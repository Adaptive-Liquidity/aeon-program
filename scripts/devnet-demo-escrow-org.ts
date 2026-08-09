/**
 * AEON Devnet extended demo
 * ─────────────────────────
 * Live path on public devnet:
 *   issue_authority → create_escrow → release_escrow
 *   → create_org → join → set_member_share → deposit
 *   → org_split → dissolve → reclaim_org_residual
 *
 * Reuses smoke-initialized config/mint when present.
 *   npm run demo:devnet
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getAccount,
  createAssociatedTokenAccountIdempotent,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";
import {
  AeonClient,
  categoryFromLabel,
  AEON_PROGRAM_ID,
  CONDITION,
  ROLE,
  ESCROW_STATUS,
  ORG_STATUS,
} from "../client";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DECIMALS = 6;
const ONE = 10 ** DECIMALS;
const EXPLORER = "https://explorer.solana.com";

function loadKeypair(): Keypair {
  const p =
    process.env.SOLANA_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function log(step: string, msg: string) {
  console.log(`\n  ▸ [${step}] ${msg}`);
}
function ok(msg: string) {
  console.log(`    ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`    ✗ ${msg}`);
  process.exit(1);
}
function txUrl(sig: string): string {
  return `${EXPLORER}/tx/${sig}?cluster=devnet`;
}

async function fundIfNeeded(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  sol = 0.08
) {
  const bal = await connection.getBalance(to);
  if (bal >= 0.03 * LAMPORTS_PER_SOL) return;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: Math.floor(sol * LAMPORTS_PER_SOL),
    })
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [from], {
    commitment: "confirmed",
  });
  ok(`funded ${to.toBase58().slice(0, 8)}… ${sol} SOL (${sig.slice(0, 12)}…)`);
}

async function ensureAgent(
  aeon: AeonClient,
  agent: PublicKey,
  signers: Keypair[] = []
) {
  try {
    await aeon.fetchAgent(agent);
    ok(`${agent.toBase58().slice(0, 8)}… already registered`);
  } catch {
    const sig =
      signers.length > 0
        ? await aeon.registerAgent(agent, { signers })
        : await aeon.registerAgent();
    ok(`register_agent ${agent.toBase58().slice(0, 8)}… ${sig.slice(0, 12)}…`);
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║     AEON — Devnet Demo (escrow → org → dissolve)         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const payer = loadKeypair();
  const connection = new Connection(RPC, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const bal = await connection.getBalance(payer.publicKey);
  console.log(`  RPC     : ${RPC}`);
  console.log(`  Program : ${AEON_PROGRAM_ID.toBase58()}`);
  console.log(`  Admin   : ${payer.publicKey.toBase58()}`);
  console.log(`  Balance : ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (bal < 0.4 * LAMPORTS_PER_SOL) {
    fail("admin needs ≥ 0.4 SOL for extended demo (rent + fees + fund agents)");
  }

  const prog = await connection.getAccountInfo(AEON_PROGRAM_ID);
  if (!prog?.executable) fail("program not executable on this cluster");
  ok("program executable on-chain");

  const aeon = AeonClient.fromProvider(provider);
  const agentB = Keypair.generate();
  const agentC = Keypair.generate();
  const catResearch = categoryFromLabel("research");
  const catCompute = categoryFromLabel("compute");

  const sigs: Record<string, string> = {};

  // ─── 1. Config / mint ────────────────────────────────────────────────────
  log("1", "config + mint");

  let mint: PublicKey;
  try {
    const cfg = await aeon.fetchConfig();
    mint = cfg.aeonMint;
    ok(`reusing config mint ${mint.toBase58()}`);
    ok(
      `counters auth=${cfg.authorityCounter.toNumber()} escrow=${cfg.escrowCounter.toNumber()} org=${cfg.orgCounter.toNumber()}`
    );
  } catch {
    mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      DECIMALS,
      undefined,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    ok(`mint ${mint.toBase58()}`);
    const sig = await aeon.initializeConfig(mint);
    sigs.initializeConfig = sig;
    ok(`initialize_config ${sig.slice(0, 12)}…`);
  }

  // ─── 2. ATAs + fund agents ────────────────────────────────────────────────
  log("2", "ATAs, mint AEON, fund agents B/C");

  const ataAdmin = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  const ataB = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    agentB.publicKey
  );
  const ataC = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    agentC.publicKey
  );
  ok(`admin/B/C ATAs ready`);

  const need = 500n * BigInt(ONE);
  const adminBal = (await getAccount(connection, ataAdmin)).amount;
  if (adminBal < need) {
    await mintTo(connection, payer, mint, ataAdmin, payer, need);
    ok(`minted ${Number(need) / ONE} AEON to admin`);
  } else {
    ok(`admin balance ${Number(adminBal) / ONE} AEON`);
  }

  await fundIfNeeded(connection, payer, agentB.publicKey, 0.08);
  await fundIfNeeded(connection, payer, agentC.publicKey, 0.08);

  // ─── 3. Register ─────────────────────────────────────────────────────────
  log("3", "register agents A/B/C");
  await ensureAgent(aeon, payer.publicKey);
  await ensureAgent(aeon, agentB.publicKey, [agentB]);
  await ensureAgent(aeon, agentC.publicKey, [agentC]);

  // ─── 4. Authority ────────────────────────────────────────────────────────
  log("4", "issue_authority root (auto nextIds)");

  const budget = 200 * ONE;
  const maxPerTx = 80 * ONE;
  const { authorityId, signature: authSig } = await aeon.issueAuthority({
    budget,
    maxPerTx,
    maxTotal: budget,
    categories: [catResearch, catCompute],
  });
  sigs.issueAuthority = authSig;
  ok(`authority #${authorityId} ${authSig.slice(0, 12)}…`);

  const auth = await aeon.fetchAuthority(authorityId);
  if (auth.depth !== 0) fail(`expected depth 0, got ${auth.depth}`);
  if (auth.spent.toNumber() !== 0) fail("spent should be 0");
  ok(`depth=0 budget=${budget / ONE} spent=0`);

  // ─── 5. Escrow create + release ──────────────────────────────────────────
  log("5", "create_escrow → release_escrow (payee C)");

  const escrowAmount = 25 * ONE;
  const beforeC = (await getAccount(connection, ataC)).amount;
  const spentBeforeEscrow = (await aeon.fetchAuthority(authorityId)).spent.toNumber();

  const { escrowId, signature: escCreateSig } = await aeon.createEscrow({
    amount: escrowAmount,
    payee: agentC.publicKey,
    payerToken: ataAdmin,
    authorityId,
    category: catResearch,
    conditionType: CONDITION.IMMEDIATE,
    aeonMint: mint,
  });
  sigs.createEscrow = escCreateSig;
  ok(`escrow #${escrowId} create ${escCreateSig.slice(0, 12)}…`);

  const vault = await getAccount(connection, aeon.escrowVaultAddress(escrowId));
  if (Number(vault.amount) !== escrowAmount) {
    fail(`vault expected ${escrowAmount}, got ${vault.amount}`);
  }
  ok(`vault locked ${escrowAmount / ONE} AEON`);

  const releaseSig = await aeon.releaseEscrow(escrowId, ataC);
  sigs.releaseEscrow = releaseSig;
  ok(`release ${releaseSig.slice(0, 12)}…`);

  const afterC = (await getAccount(connection, ataC)).amount;
  if (afterC - beforeC !== BigInt(escrowAmount)) {
    fail(`C delta expected ${escrowAmount}, got ${afterC - beforeC}`);
  }
  const escAcc = await aeon.fetchEscrow(escrowId);
  if (escAcc.status !== ESCROW_STATUS.RELEASED) {
    fail(`escrow status expected RELEASED, got ${escAcc.status}`);
  }
  const spentAfterEscrow = (await aeon.fetchAuthority(authorityId)).spent.toNumber();
  if (spentAfterEscrow !== spentBeforeEscrow + escrowAmount) {
    fail(
      `spent expected ${spentBeforeEscrow + escrowAmount}, got ${spentAfterEscrow}`
    );
  }
  ok(
    `C +${escrowAmount / ONE} AEON  status=RELEASED  spent=${
      spentAfterEscrow / ONE
    }`
  );

  // ─── 6. Optional cancel path (second escrow) ─────────────────────────────
  log("6", "create_escrow → cancel_escrow (payee B)");

  const cancelAmount = 10 * ONE;
  const beforeAdminCancel = (await getAccount(connection, ataAdmin)).amount;
  const { escrowId: cancelEscrowId, signature: cancelCreateSig } =
    await aeon.createEscrow({
      amount: cancelAmount,
      payee: agentB.publicKey,
      payerToken: ataAdmin,
      authorityId,
      category: catCompute,
      conditionType: CONDITION.IMMEDIATE,
      aeonMint: mint,
    });
  sigs.createEscrowCancelPath = cancelCreateSig;
  ok(`escrow #${cancelEscrowId} create ${cancelCreateSig.slice(0, 12)}…`);

  const cancelSig = await aeon.cancelEscrow(cancelEscrowId, ataAdmin);
  sigs.cancelEscrow = cancelSig;
  const afterAdminCancel = (await getAccount(connection, ataAdmin)).amount;
  // net: create debited, cancel credited → back to beforeAdminCancel
  if (afterAdminCancel !== beforeAdminCancel) {
    fail(
      `cancel net-zero failed: before=${beforeAdminCancel} after=${afterAdminCancel}`
    );
  }
  const cancelAcc = await aeon.fetchEscrow(cancelEscrowId);
  if (cancelAcc.status !== ESCROW_STATUS.CANCELLED) {
    fail(`escrow status expected CANCELLED, got ${cancelAcc.status}`);
  }
  ok(`cancel net-zero  status=CANCELLED  ${cancelSig.slice(0, 12)}…`);

  // ─── 7. Org lifecycle ────────────────────────────────────────────────────
  log("7", "create_org → join → set_member_share → deposit → split → dissolve → reclaim");

  const nameHash = Array.from(
    Buffer.from("devnet-swarm-v1".padEnd(32, "\0"))
  );
  const { orgId, signature: orgCreateSig } = await aeon.createOrg({
    nameHash,
    creatorShareBps: 5000,
    aeonMint: mint,
  });
  sigs.createOrg = orgCreateSig;
  ok(`org #${orgId} create ${orgCreateSig.slice(0, 12)}…`);

  const joinBSig = await aeon.joinOrg(
    orgId,
    agentB.publicKey,
    ROLE.MEMBER,
    3000
  );
  const joinCSig = await aeon.joinOrg(
    orgId,
    agentC.publicKey,
    ROLE.MEMBER,
    2000
  );
  sigs.joinOrgB = joinBSig;
  sigs.joinOrgC = joinCSig;
  let orgAcc = await aeon.fetchOrg(orgId);
  if (orgAcc.memberCount !== 3) fail(`memberCount expected 3, got ${orgAcc.memberCount}`);
  if (orgAcc.totalShareBps !== 10000) {
    fail(`totalShareBps expected 10000, got ${orgAcc.totalShareBps}`);
  }
  ok(`joined B(3000) + C(2000)  total_share_bps=10000`);

  // Shrink C first so intermediate total never exceeds 10000.
  const setCSig = await aeon.setMemberShare(orgId, agentC.publicKey, 1500);
  const setBSig = await aeon.setMemberShare(orgId, agentB.publicKey, 3500);
  sigs.setMemberShareC = setCSig;
  sigs.setMemberShareB = setBSig;
  orgAcc = await aeon.fetchOrg(orgId);
  if (orgAcc.totalShareBps !== 10000) {
    fail(`after reallocate totalShareBps=${orgAcc.totalShareBps}`);
  }
  ok(`reallocated A=5000 B=3500 C=1500`);

  const depositAmount = 100 * ONE;
  const depositSig = await aeon.depositToOrg(orgId, depositAmount, ataAdmin);
  sigs.depositToOrg = depositSig;
  let treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
  if (Number(treasury.amount) !== depositAmount) {
    fail(`treasury expected ${depositAmount}, got ${treasury.amount}`);
  }
  ok(`deposited ${depositAmount / ONE} AEON  ${depositSig.slice(0, 12)}…`);

  const splitAmount = 20 * ONE;
  const beforeBSplit = (await getAccount(connection, ataB)).amount;
  const splitSig = await aeon.orgSplit({
    orgId,
    amount: splitAmount,
    recipient: agentB.publicKey,
    recipientToken: ataB,
    aeonMint: mint,
  });
  sigs.orgSplit = splitSig;
  const afterBSplit = (await getAccount(connection, ataB)).amount;
  if (afterBSplit - beforeBSplit !== BigInt(splitAmount)) {
    fail(`split B delta expected ${splitAmount}`);
  }
  treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
  ok(
    `org_split ${splitAmount / ONE} → B  treasury=${
      Number(treasury.amount) / ONE
    }  ${splitSig.slice(0, 12)}…`
  );

  // v0.1 dissolve pays admin + optional memberB; C's bps become residual.
  const treasuryBefore = Number(treasury.amount);
  const beforeA = (await getAccount(connection, ataAdmin)).amount;
  const beforeB2 = (await getAccount(connection, ataB)).amount;

  const dissolveSig = await aeon.dissolveOrg({
    orgId,
    adminToken: ataAdmin,
    memberB: agentB.publicKey,
    memberBToken: ataB,
    aeonMint: mint,
  });
  sigs.dissolveOrg = dissolveSig;

  orgAcc = await aeon.fetchOrg(orgId);
  if (orgAcc.status !== ORG_STATUS.CLOSED) {
    fail(`org status expected CLOSED, got ${orgAcc.status}`);
  }

  const paidA = Number(
    (await getAccount(connection, ataAdmin)).amount - beforeA
  );
  const paidB = Number((await getAccount(connection, ataB)).amount - beforeB2);
  treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
  const residual = Number(treasury.amount);

  const expectA = Math.floor((treasuryBefore * 5000) / 10000);
  const expectB = Math.floor((treasuryBefore * 3500) / 10000);
  if (paidA !== expectA) fail(`dissolve A expected ${expectA}, got ${paidA}`);
  if (paidB !== expectB) fail(`dissolve B expected ${expectB}, got ${paidB}`);
  ok(
    `dissolved  A+${paidA / ONE} B+${paidB / ONE} residual=${
      residual / ONE
    } (C share)  ${dissolveSig.slice(0, 12)}…`
  );

  if (residual > 0) {
    const beforeReclaim = (await getAccount(connection, ataAdmin)).amount;
    const reclaimSig = await aeon.reclaimOrgResidual(orgId, ataAdmin);
    sigs.reclaimOrgResidual = reclaimSig;
    const reclaimed = Number(
      (await getAccount(connection, ataAdmin)).amount - beforeReclaim
    );
    if (reclaimed !== residual) {
      fail(`reclaim expected ${residual}, got ${reclaimed}`);
    }
    treasury = await getAccount(connection, aeon.orgTreasuryAddress(orgId));
    if (Number(treasury.amount) !== 0) fail("treasury not zero after reclaim");
    ok(`reclaimed residual ${reclaimed / ONE} → A  treasury=0  ${reclaimSig.slice(0, 12)}…`);
  } else {
    ok("no residual to reclaim");
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  const cfgFinal = await aeon.fetchConfig();
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║              DEVNET EXTENDED DEMO PASS                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Program     ${AEON_PROGRAM_ID.toBase58()}`);
  console.log(`  Config      ${aeon.configAddress().toBase58()}`);
  console.log(`  Mint        ${mint.toBase58()}`);
  console.log(`  Authority   #${authorityId}`);
  console.log(`  Escrow      #${escrowId} RELEASED + #${cancelEscrowId} CANCELLED`);
  console.log(`  Org         #${orgId} CLOSED`);
  console.log(
    `  Counters    auth=${cfgFinal.authorityCounter.toNumber()} escrow=${cfgFinal.escrowCounter.toNumber()} org=${cfgFinal.orgCounter.toNumber()}`
  );
  console.log(`  Explorer    ${txUrl(sigs.dissolveOrg)}`);
  console.log("");

  const outDir = path.join(__dirname, "..", "target", "devnet");
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    cluster: "devnet",
    rpc: RPC,
    programId: AEON_PROGRAM_ID.toBase58(),
    config: aeon.configAddress().toBase58(),
    mint: mint.toBase58(),
    admin: payer.publicKey.toBase58(),
    agentB: agentB.publicKey.toBase58(),
    agentC: agentC.publicKey.toBase58(),
    authorityId,
    escrowId,
    cancelEscrowId,
    orgId,
    shares: { A: 5000, B: 3500, C: 1500 },
    amounts: {
      escrow: escrowAmount / ONE,
      cancelEscrow: cancelAmount / ONE,
      deposit: depositAmount / ONE,
      orgSplit: splitAmount / ONE,
      dissolvePaidA: expectA / ONE,
      dissolvePaidB: expectB / ONE,
      residual: residual / ONE,
    },
    signatures: sigs,
    explorer: Object.fromEntries(
      Object.entries(sigs).map(([k, v]) => [k, txUrl(v)])
    ),
    demoedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "demo-escrow-org.json"),
    JSON.stringify(artifact, null, 2)
  );
  console.log(`  Artifact   target/devnet/demo-escrow-org.json\n`);
}

main().catch((e) => {
  console.error("\nDEVNET EXTENDED DEMO FAILED\n");
  console.error(e);
  process.exit(1);
});
