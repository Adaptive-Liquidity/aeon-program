/**
 * AEON Agent Economy Demo
 * ───────────────────────
 * Narrative multi-agent flow on localnet, driven entirely by the TypeScript SDK.
 *
 * Story:
 *   1. Protocol admin mints AEON and initializes config
 *   2. Orchestrator (Agent A) registers + issues hierarchical authority
 *   3. Worker (Agent B) and Specialist (Agent C) register
 *   4. A pays B for "compute" under authority budget
 *   5. A escrows funds for C, then releases
 *   6. A atomic-splits payment to B + C
 *   7. Swarm org: create → join → deposit → split → dissolve → reclaim
 *   8. Authority revoke tree (deepest-first)
 *
 * Run (fresh localnet + deploy + this suite only):
 *   npm run demo:economy
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAccount,
  createAssociatedTokenAccountIdempotent,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  AeonClient,
  ROLE,
  CONDITION,
  AUTH_STATUS,
  ORG_STATUS,
  ESCROW_STATUS,
  categoryFromLabel,
  planRevokeTree,
  nodesFromAuthorities,
  type AuthorityNode,
} from "../client";

const DECIMALS = 6;
const ONE = 10 ** DECIMALS;

function fmt(amount: bigint | number, decimals = DECIMALS): string {
  const n = typeof amount === "bigint" ? Number(amount) : amount;
  return (n / 10 ** decimals).toFixed(2);
}

function log(step: string, msg: string) {
  console.log(`\n  ▸ [${step}] ${msg}`);
}

function ok(msg: string) {
  console.log(`    ✓ ${msg}`);
}

describe("Agent Economy Demo", function () {
  this.timeout(180_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;

  const agentA = admin.payer;
  const agentB = Keypair.generate();
  const agentC = Keypair.generate();

  let mint: PublicKey;
  let ataA: PublicKey;
  let ataB: PublicKey;
  let ataC: PublicKey;
  let aeon: AeonClient;

  let rootAuthId: number;
  let childAuthId: number;
  let grandAuthId: number;
  let escrowId: number;
  let orgId: number;

  const catCompute = categoryFromLabel("compute");
  const catResearch = categoryFromLabel("research");

  const airdrop = async (pk: PublicKey, sol = 2) => {
    const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  };

  const bal = async (ata: PublicKey) => (await getAccount(connection, ata)).amount;

  const tryRegister = async (
    pk: PublicKey,
    signers: Keypair[] = []
  ): Promise<boolean> => {
    try {
      if (signers.length) {
        await aeon.registerAgent(pk, { signers });
      } else {
        await aeon.registerAgent();
      }
      return true;
    } catch {
      return false;
    }
  };

  before(async () => {
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║         AEON — Agent Economy Demo (localnet)             ║");
    console.log("╚══════════════════════════════════════════════════════════╝");

    const workspaceProgram = (anchor.workspace as { Aeon: anchor.Program }).Aeon;
    console.log(`  Program : ${workspaceProgram.programId.toBase58()}`);
    console.log(`  Admin/A : ${agentA.publicKey.toBase58()}`);
    console.log(`  Worker B: ${agentB.publicKey.toBase58()}`);
    console.log(`  Spec   C: ${agentC.publicKey.toBase58()}`);

    aeon = AeonClient.fromWorkspace(workspaceProgram, provider);
    await airdrop(agentB.publicKey);
    await airdrop(agentC.publicKey);
  });

  it("Act 1 — Bootstrap mint + protocol config", async () => {
    log("1", "Create AEON mint (6 decimals) and initialize_config");

    try {
      const cfg = await aeon.fetchConfig();
      mint = cfg.aeonMint;
      ok(`reusing existing config mint ${mint.toBase58()}`);
    } catch {
      mint = await createMint(
        connection,
        admin.payer,
        admin.publicKey,
        null,
        DECIMALS
      );
      ok(`mint ${mint.toBase58()}`);
      await aeon.initializeConfig(mint);
      const cfg = await aeon.fetchConfig();
      expect(cfg.paused).to.equal(false);
      expect(cfg.aeonMint.equals(mint)).to.equal(true);
      ok(`config PDA ready (admin=${cfg.admin.toBase58().slice(0, 8)}…)`);
    }

    ataA = await createAssociatedTokenAccountIdempotent(
      connection,
      admin.payer,
      mint,
      agentA.publicKey
    );
    ataB = await createAssociatedTokenAccountIdempotent(
      connection,
      admin.payer,
      mint,
      agentB.publicKey
    );
    ataC = await createAssociatedTokenAccountIdempotent(
      connection,
      admin.payer,
      mint,
      agentC.publicKey
    );

    await mintTo(
      connection,
      admin.payer,
      mint,
      ataA,
      admin.publicKey,
      10_000 * ONE
    );
    ok(`funded Agent A → balance ${fmt(await bal(ataA))} AEON`);
  });

  it("Act 2 — Register three agents (A, B, C)", async () => {
    log("2", "register_agent for orchestrator, worker, specialist");

    const aNew = await tryRegister(agentA.publicKey);
    const bNew = await tryRegister(agentB.publicKey, [agentB]);
    const cNew = await tryRegister(agentC.publicKey, [agentC]);
    ok(
      `register A=${aNew ? "new" : "exists"} B=${bNew ? "new" : "exists"} C=${
        cNew ? "new" : "exists"
      }`
    );

    for (const [label, pk] of [
      ["A", agentA.publicKey],
      ["B", agentB.publicKey],
      ["C", agentC.publicKey],
    ] as const) {
      const id = await aeon.fetchAgent(pk);
      const cri = await aeon.fetchCri(pk);
      expect(id.active).to.equal(true);
      ok(
        `Agent ${label} active · CRI settlements=${cri.successfulSettlements.toNumber()} volume=${fmt(
          cri.volumeSettled.toNumber()
        )}`
      );
    }
  });

  it("Act 3 — Issue hierarchical authority (root → child → grandchild)", async () => {
    log("3", "issue_authority tree with category policy + budget caps");

    const root = await aeon.issueAuthority({
      budget: 1_000 * ONE,
      maxPerTx: 200 * ONE,
      maxTotal: 1_000 * ONE,
      categories: [catCompute, catResearch],
    });
    rootAuthId = root.authorityId;
    ok(
      `root authority #${rootAuthId} budget=1000 max/tx=200 cats=[compute,research]`
    );

    const child = await aeon.issueAuthority({
      budget: 300 * ONE,
      maxPerTx: 500 * ONE,
      parentId: rootAuthId,
      categories: [catCompute],
    });
    childAuthId = child.authorityId;
    const childAcc = await aeon.fetchAuthority(childAuthId);
    expect(childAcc.depth).to.equal(1);
    expect(childAcc.maxPerTx.toNumber()).to.equal(200 * ONE);
    ok(
      `child authority #${childAuthId} depth=${childAcc.depth} max/tx capped to ${fmt(
        childAcc.maxPerTx.toNumber()
      )}`
    );

    const grand = await aeon.issueAuthority({
      budget: 50 * ONE,
      maxPerTx: 50 * ONE,
      parentId: childAuthId,
      categories: [catCompute],
    });
    grandAuthId = grand.authorityId;
    const g = await aeon.fetchAuthority(grandAuthId);
    expect(g.depth).to.equal(2);
    ok(`grandchild authority #${grandAuthId} depth=${g.depth} budget=50`);
  });

  it("Act 4 — Pay worker B for compute under root authority", async () => {
    log("4", "pay 25 AEON A → B (authority-gated, category=compute)");

    const beforeA = await bal(ataA);
    const beforeB = await bal(ataB);

    await aeon.pay({
      amount: 25 * ONE,
      payee: agentB.publicKey,
      payerToken: ataA,
      payeeToken: ataB,
      authorityId: rootAuthId,
      category: catCompute,
      aeonMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    const afterA = await bal(ataA);
    const afterB = await bal(ataB);
    expect(Number(beforeA - afterA)).to.equal(25 * ONE);
    expect(Number(afterB - beforeB)).to.equal(25 * ONE);

    const auth = await aeon.fetchAuthority(rootAuthId);
    const criB = await aeon.fetchCri(agentB.publicKey);
    ok(
      `spent ${fmt(auth.spent.toNumber())} / ${fmt(
        auth.budget.toNumber()
      )} on authority #${rootAuthId}`
    );
    ok(
      `B CRI: settlements=${criB.successfulSettlements.toNumber()} volume=${fmt(
        criB.volumeSettled.toNumber()
      )}`
    );
    ok(`balances A=${fmt(afterA)}  B=${fmt(afterB)}`);
  });

  it("Act 5 — Escrow for specialist C, then release", async () => {
    log("5", "create_escrow 40 AEON for C (immediate) → release_escrow");

    const beforeC = await bal(ataC);

    const esc = await aeon.createEscrow({
      amount: 40 * ONE,
      payee: agentC.publicKey,
      payerToken: ataA,
      authorityId: rootAuthId,
      category: catResearch,
      conditionType: CONDITION.IMMEDIATE,
      aeonMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    escrowId = esc.escrowId;

    const vault = await getAccount(
      connection,
      aeon.escrowVaultAddress(escrowId)
    );
    expect(Number(vault.amount)).to.equal(40 * ONE);
    ok(`escrow #${escrowId} locked 40 AEON in vault`);

    await aeon.releaseEscrow(escrowId, ataC);
    const afterC = await bal(ataC);
    expect(Number(afterC - beforeC)).to.equal(40 * ONE);

    const escAcc = await aeon.fetchEscrow(escrowId);
    expect(escAcc.status).to.equal(ESCROW_STATUS.RELEASED);
    ok(`released → C balance=${fmt(afterC)}  status=RELEASED`);
  });

  it("Act 6 — Atomic split to B + C under authority", async () => {
    log("6", "atomic_split 15+10 AEON → B and C in one tx");

    const beforeB = await bal(ataB);
    const beforeC = await bal(ataC);

    await aeon.atomicSplit({
      payees: [
        { payee: agentB.publicKey, token: ataB, amount: 15 * ONE },
        { payee: agentC.publicKey, token: ataC, amount: 10 * ONE },
      ],
      payerToken: ataA,
      authorityId: rootAuthId,
      category: catCompute,
      aeonMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    const dB = Number((await bal(ataB)) - beforeB);
    const dC = Number((await bal(ataC)) - beforeC);
    expect(dB).to.equal(15 * ONE);
    expect(dC).to.equal(10 * ONE);

    const auth = await aeon.fetchAuthority(rootAuthId);
    ok(
      `B +${fmt(dB)}  C +${fmt(dC)}  authority spent now ${fmt(
        auth.spent.toNumber()
      )}`
    );
  });

  it("Act 7 — Swarm org: create → join → deposit → split → dissolve → reclaim", async () => {
    log("7", "organization lifecycle (swarm treasury)");

    const nameHash = Array.from(Buffer.from("aeon-swarm-v1".padEnd(32, "\0")));
    const org = await aeon.createOrg({
      nameHash,
      creatorShareBps: 5000,
      aeonMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    orgId = org.orgId;
    let orgAcc = await aeon.fetchOrg(orgId);
    ok(
      `org #${orgId} created  members=${orgAcc.memberCount} total_share_bps=${orgAcc.totalShareBps}`
    );

    await aeon.joinOrg(orgId, agentB.publicKey, ROLE.MEMBER, 3000);
    await aeon.joinOrg(orgId, agentC.publicKey, ROLE.MEMBER, 2000);
    orgAcc = await aeon.fetchOrg(orgId);
    expect(orgAcc.memberCount).to.equal(3);
    expect(orgAcc.totalShareBps).to.equal(10000);
    ok(
      `joined B(member 3000bps) + C(member 2000bps)  total_share_bps=${orgAcc.totalShareBps}`
    );

    // Shrink first so intermediate total never exceeds 10000.
    await aeon.setMemberShare(orgId, agentC.publicKey, 1500); // 10000-2000+1500=9500
    await aeon.setMemberShare(orgId, agentB.publicKey, 3500); // 9500-3000+3500=10000
    orgAcc = await aeon.fetchOrg(orgId);
    expect(orgAcc.totalShareBps).to.equal(10000);
    ok(`reallocated shares B=3500 C=1500 A=5000  total=${orgAcc.totalShareBps}`);

    await aeon.depositToOrg(orgId, 200 * ONE, ataA);
    let treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
    expect(Number(treasury.amount)).to.equal(200 * ONE);
    ok(`deposited 200 AEON → treasury balance=${fmt(treasury.amount)}`);

    const beforeB = await bal(ataB);
    await aeon.orgSplit({
      orgId,
      amount: 30 * ONE,
      recipient: agentB.publicKey,
      recipientToken: ataB,
      aeonMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    const gotB = Number((await bal(ataB)) - beforeB);
    expect(gotB).to.equal(30 * ONE);
    treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
    ok(`org_split 30 → B  treasury now ${fmt(treasury.amount)}`);

    // v0.1 dissolve pays admin + optional memberB; C's bps become residual.
    const treasuryBefore = Number(treasury.amount);
    const beforeA = await bal(ataA);
    const beforeB2 = await bal(ataB);

    await aeon.dissolveOrg({
      orgId,
      adminToken: ataA,
      memberB: agentB.publicKey,
      memberBToken: ataB,
      aeonMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    orgAcc = await aeon.fetchOrg(orgId);
    expect(orgAcc.status).to.equal(ORG_STATUS.CLOSED);

    const paidA = Number((await bal(ataA)) - beforeA);
    const paidB = Number((await bal(ataB)) - beforeB2);
    treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
    const residual = Number(treasury.amount);

    const expectA = Math.floor((treasuryBefore * 5000) / 10000);
    const expectB = Math.floor((treasuryBefore * 3500) / 10000);
    expect(paidA).to.equal(expectA);
    expect(paidB).to.equal(expectB);

    ok(
      `dissolved  A+${fmt(paidA)} B+${fmt(paidB)} residual=${fmt(
        residual
      )} (C share left) status=CLOSED`
    );

    if (residual > 0) {
      const beforeReclaim = await bal(ataA);
      await aeon.reclaimOrgResidual(orgId, ataA);
      const reclaimed = Number((await bal(ataA)) - beforeReclaim);
      expect(reclaimed).to.equal(residual);
      treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
      expect(Number(treasury.amount)).to.equal(0);
      ok(`reclaimed residual ${fmt(reclaimed)} → A  treasury=0`);
    } else {
      ok("no residual to reclaim");
    }
  });

  it("Act 8 — Revoke authority tree (deepest-first)", async () => {
    log("8", "plan + execute deepest-first soft revokes");

    const cfg = await aeon.fetchConfig();
    const accounts = await aeon.scanAuthorities(
      cfg.authorityCounter.toNumber(),
      agentA.publicKey
    );
    const nodes: AuthorityNode[] = nodesFromAuthorities(accounts);
    const plan = planRevokeTree(nodes, rootAuthId);

    ok(
      `plan (${plan.length} batches): ${plan
        .map(
          (b) =>
            `#${b.authorityId}(d=${
              nodes.find((n) => n.authorityId === b.authorityId)?.depth
            })`
        )
        .join(" → ")}`
    );

    for (let i = 1; i < plan.length; i++) {
      const prev = nodes.find((n) => n.authorityId === plan[i - 1].authorityId)!;
      const cur = nodes.find((n) => n.authorityId === plan[i].authorityId)!;
      expect(prev.depth).to.be.gte(cur.depth);
    }

    let revoked = 0;
    for (const batch of plan) {
      try {
        const auth = await aeon.fetchAuthority(batch.authorityId);
        if (auth.status !== AUTH_STATUS.ACTIVE) continue;
      } catch {
        continue;
      }
      await aeon.revokeAuthority(batch.authorityId, []);
      revoked++;
    }
    ok(`executed ${revoked} soft revoke txs`);

    for (const id of [grandAuthId, childAuthId, rootAuthId]) {
      const a = await aeon.fetchAuthority(id);
      expect(a.status).to.equal(AUTH_STATUS.REVOKED);
      ok(`authority #${id} status=REVOKED`);
    }
  });

  it("Epilogue — final balances + CRI scoreboard", async () => {
    log("Σ", "economy snapshot");

    const rows = [
      ["A (orchestrator)", agentA.publicKey, ataA],
      ["B (worker)", agentB.publicKey, ataB],
      ["C (specialist)", agentC.publicKey, ataC],
    ] as const;

    console.log(
      "\n  ┌────────────────────┬──────────────┬────────────┬────────────┐"
    );
    console.log(
      "  │ Agent              │ AEON balance │ Settlements│ Volume     │"
    );
    console.log(
      "  ├────────────────────┼──────────────┼────────────┼────────────┤"
    );
    for (const [label, pk, ata] of rows) {
      const b = await bal(ata);
      const cri = await aeon.fetchCri(pk);
      console.log(
        `  │ ${label.padEnd(18)} │ ${fmt(b).padStart(12)} │ ${String(
          cri.successfulSettlements.toNumber()
        ).padStart(10)} │ ${fmt(cri.volumeSettled.toNumber()).padStart(10)} │`
      );
    }
    console.log(
      "  └────────────────────┴──────────────┴────────────┴────────────┘"
    );

    const auth = await aeon.fetchAuthority(rootAuthId);
    ok(
      `root authority #${rootAuthId} final spent=${fmt(
        auth.spent.toNumber()
      )} status=REVOKED`
    );
    ok("Agent economy demo complete");

    console.log(
      "\n╔══════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║  Demo finished — all economic primitives exercised.      ║"
    );
    console.log(
      "╚══════════════════════════════════════════════════════════╝\n"
    );
  });
});
