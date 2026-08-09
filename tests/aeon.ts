/**
 * AEON localnet e2e happy path:
 * config → agent → authority → pay → escrow → org → join → deposit → split → dissolve → reclaim
 *
 * Also covers: second register fails, parent authority, depth>3 fails.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";
import { expect } from "chai";

type Aeon = any;

describe("aeon e2e", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Aeon as Program<Aeon>;
  const admin = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  let mint: PublicKey;
  let payerAta: PublicKey;
  let payee: Keypair;
  let payeeAta: PublicKey;
  let memberB: Keypair;
  let memberBAta: PublicKey;

  const seedBuf = (label: string, id?: number | BN) => {
    if (id === undefined) return [Buffer.from(label)];
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(id.toString()));
    return [Buffer.from(label), buf];
  };

  const configPda = () =>
    PublicKey.findProgramAddressSync([Buffer.from("aeon_config")], program.programId)[0];
  const agentPda = (a: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("agent"), a.toBuffer()], program.programId)[0];
  const criPda = (a: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("cri"), a.toBuffer()], program.programId)[0];
  const authorityPda = (id: number | BN) =>
    PublicKey.findProgramAddressSync(seedBuf("authority", id), program.programId)[0];
  const escrowPda = (id: number | BN) =>
    PublicKey.findProgramAddressSync(seedBuf("escrow", id), program.programId)[0];
  const escrowVaultPda = (id: number | BN) =>
    PublicKey.findProgramAddressSync(seedBuf("escrow_vault", id), program.programId)[0];
  const orgPda = (id: number | BN) =>
    PublicKey.findProgramAddressSync(seedBuf("org", id), program.programId)[0];
  const orgTreasuryPda = (id: number | BN) =>
    PublicKey.findProgramAddressSync(seedBuf("org_treasury", id), program.programId)[0];
  const orgMemberPda = (orgId: number | BN, agent: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("org_member"), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(orgId.toString())); return b; })(), agent.toBuffer()],
      program.programId
    )[0];

  const zeroCat = new Array(16).fill(0) as number[];
  const catArr = () => {
    const a = new Uint8Array(16);
    return Array.from(a);
  };

  const airdrop = async (pk: PublicKey, lamports = 2e9) => {
    const sig = await connection.requestAirdrop(pk, lamports);
    await connection.confirmTransaction(sig, "confirmed");
  };

  const register = async (kp: Keypair) => {
    await program.methods
      .registerAgent()
      .accounts({
        agent: kp.publicKey,
        config: configPda(),
        agentIdentity: agentPda(kp.publicKey),
        cri: criPda(kp.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([kp])
      .rpc();
  };

  it("1. initialize_config succeeds", async () => {
    // Create real mint first
    mint = await createMint(
      connection,
      admin.payer,
      admin.publicKey,
      null,
      6
    );

    await program.methods
      .initializeConfig(mint)
      .accounts({
        admin: admin.publicKey,
        config: configPda(),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.config.fetch(configPda());
    expect(cfg.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(cfg.aeonMint.toBase58()).to.equal(mint.toBase58());
    expect(cfg.authorityCounter.toNumber()).to.equal(0);
    expect(cfg.paused).to.equal(false);

    // Setup token accounts + agents for later tests
    payerAta = await createAccount(connection, admin.payer, mint, admin.publicKey);
    await mintTo(connection, admin.payer, mint, payerAta, admin.publicKey, 10_000_000_000);

    payee = Keypair.generate();
    await airdrop(payee.publicKey);
    payeeAta = await createAccount(connection, admin.payer, mint, payee.publicKey);

    memberB = Keypair.generate();
    await airdrop(memberB.publicKey);
    memberBAta = await createAccount(connection, admin.payer, mint, memberB.publicKey);
  });

  it("2. register_agent succeeds; second register fails", async () => {
    await register(admin.payer);

    const identity = await program.account.agentIdentity.fetch(agentPda(admin.publicKey));
    expect(identity.active).to.equal(true);

    let failed = false;
    try {
      await register(admin.payer);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);

    await register(payee);
    await register(memberB);
  });

  it("3. issue_authority root succeeds", async () => {
    await program.methods
      .issueAuthority(
        new BN(1),
        new BN(5_000_000),
        new BN(1_000_000),
        new BN(5_000_000),
        [],
        new BN(0),
        new BN(0)
      )
      .accounts({
        agent: admin.publicKey,
        config: configPda(),
        agentIdentity: agentPda(admin.publicKey),
        parentAuthority: null,
        authority: authorityPda(1),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const auth = await program.account.authority.fetch(authorityPda(1));
    expect(auth.authorityId.toNumber()).to.equal(1);
    expect(auth.depth).to.equal(0);
    expect(auth.status).to.equal(0);
  });

  it("4. issue_authority with parent succeeds and respects depth/budget", async () => {
    await program.methods
      .issueAuthority(
        new BN(2),
        new BN(500_000),
        new BN(2_000_000), // capped to parent max_per_tx 1_000_000
        new BN(500_000),
        [],
        new BN(1),
        new BN(0)
      )
      .accounts({
        agent: admin.publicKey,
        config: configPda(),
        agentIdentity: agentPda(admin.publicKey),
        parentAuthority: authorityPda(1),
        authority: authorityPda(2),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const child = await program.account.authority.fetch(authorityPda(2));
    expect(child.depth).to.equal(1);
    expect(child.parentId.toNumber()).to.equal(1);
    expect(child.maxPerTx.toNumber()).to.equal(1_000_000);
  });

  it("5. issue_authority depth > 3 fails", async () => {
    // depth 2, 3 under chain
    for (const [id, parent, budget] of [
      [3, 2, 50_000],
      [4, 3, 5_000],
    ] as const) {
      await program.methods
        .issueAuthority(
          new BN(id),
          new BN(budget),
          new BN(budget),
          new BN(budget),
          [],
          new BN(parent),
          new BN(0)
        )
        .accounts({
          agent: admin.publicKey,
          config: configPda(),
          agentIdentity: agentPda(admin.publicKey),
          parentAuthority: authorityPda(parent),
          authority: authorityPda(id),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    let failed = false;
    try {
      await program.methods
        .issueAuthority(
          new BN(5),
          new BN(100),
          new BN(100),
          new BN(100),
          [],
          new BN(4),
          new BN(0)
        )
        .accounts({
          agent: admin.publicKey,
          config: configPda(),
          agentIdentity: agentPda(admin.publicKey),
          parentAuthority: authorityPda(4),
          authority: authorityPda(5),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("6. pay under authority succeeds", async () => {
    const amount = new BN(10_000);
    const beforePayer = (await getAccount(connection, payerAta)).amount;
    const beforePayee = (await getAccount(connection, payeeAta)).amount;

    await program.methods
      .pay(amount, new BN(1), catArr())
      .accounts({
        payer: admin.publicKey,
        payee: payee.publicKey,
        config: configPda(),
        authority: authorityPda(1),
        payerCri: criPda(admin.publicKey),
        payeeCri: criPda(payee.publicKey),
        payerToken: payerAta,
        payeeToken: payeeAta,
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterPayer = (await getAccount(connection, payerAta)).amount;
    const afterPayee = (await getAccount(connection, payeeAta)).amount;
    expect(Number(beforePayer - afterPayer)).to.equal(10_000);
    expect(Number(afterPayee - beforePayee)).to.equal(10_000);

    const auth = await program.account.authority.fetch(authorityPda(1));
    expect(auth.spent.toNumber()).to.equal(10_000);

    const payeeCri = await program.account.cri.fetch(criPda(payee.publicKey));
    expect(payeeCri.successfulSettlements.toNumber()).to.equal(1);
  });

  it("7. create_escrow + release_escrow (immediate)", async () => {
    const amount = new BN(25_000);
    const escrowId = new BN(1);

    await program.methods
      .createEscrow(
        escrowId,
        amount,
        new BN(1),
        catArr(),
        0, // immediate
        Array(64).fill(0),
        new BN(0)
      )
      .accounts({
        payer: admin.publicKey,
        payee: payee.publicKey,
        config: configPda(),
        authority: authorityPda(1),
        escrow: escrowPda(1),
        escrowVault: escrowVaultPda(1),
        payerToken: payerAta,
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const vault = await getAccount(connection, escrowVaultPda(1));
    expect(Number(vault.amount)).to.equal(25_000);

    const beforePayee = (await getAccount(connection, payeeAta)).amount;
    await program.methods
      .releaseEscrow(escrowId, Array(64).fill(0))
      .accounts({
        releaser: admin.publicKey,
        escrow: escrowPda(1),
        escrowVault: escrowVaultPda(1),
        payeeToken: payeeAta,
        payerCri: criPda(admin.publicKey),
        payeeCri: criPda(payee.publicKey),
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterPayee = (await getAccount(connection, payeeAta)).amount;
    expect(Number(afterPayee - beforePayee)).to.equal(25_000);
    const esc = await program.account.escrow.fetch(escrowPda(1));
    expect(esc.status).to.equal(1); // Released
  });

  it("8. create_org → join → deposit → org_split → dissolve → reclaim residual", async () => {
    // Create org with creator share 6000 bps; leave room for memberB
    const orgId = new BN(1);
    const nameHash = Array(32).fill(7);

    await program.methods
      .createOrg(orgId, nameHash, 6000)
      .accounts({
        creator: admin.publicKey,
        config: configPda(),
        creatorIdentity: agentPda(admin.publicKey),
        organization: orgPda(1),
        orgTreasury: orgTreasuryPda(1),
        creatorMember: orgMemberPda(1, admin.publicKey),
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    let org = await program.account.organization.fetch(orgPda(1));
    expect(org.status).to.equal(0);
    expect(org.totalShareBps).to.equal(6000);
    expect(org.memberCount).to.equal(1);

    // Join memberB as member with 3000 bps
    await program.methods
      .joinOrg(orgId, 1 /* MEMBER */, 3000)
      .accounts({
        admin: admin.publicKey,
        newAgent: memberB.publicKey,
        organization: orgPda(1),
        adminMember: orgMemberPda(1, admin.publicKey),
        agentIdentity: agentPda(memberB.publicKey),
        newMember: orgMemberPda(1, memberB.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    org = await program.account.organization.fetch(orgPda(1));
    expect(org.memberCount).to.equal(2);
    expect(org.totalShareBps).to.equal(9000);

    // Deposit 1_000_000 into treasury
    await program.methods
      .depositToOrg(orgId, new BN(1_000_000))
      .accounts({
        member: admin.publicKey,
        organization: orgPda(1),
        orgMember: orgMemberPda(1, admin.publicKey),
        orgTreasury: orgTreasuryPda(1),
        memberToken: payerAta,
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    let treasury = await getAccount(connection, orgTreasuryPda(1));
    expect(Number(treasury.amount)).to.equal(1_000_000);

    // Org split: send 100_000 to memberB
    const beforeB = (await getAccount(connection, memberBAta)).amount;
    await program.methods
      .orgSplit(orgId, [new BN(100_000)])
      .accounts({
        admin: admin.publicKey,
        organization: orgPda(1),
        adminMember: orgMemberPda(1, admin.publicKey),
        recipientMember: orgMemberPda(1, memberB.publicKey),
        recipientToken: memberBAta,
        orgTreasury: orgTreasuryPda(1),
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterB = (await getAccount(connection, memberBAta)).amount;
    expect(Number(afterB - beforeB)).to.equal(100_000);
    treasury = await getAccount(connection, orgTreasuryPda(1));
    expect(Number(treasury.amount)).to.equal(900_000);

    // Dissolve: distribute by share_bps (6000 + 3000 of residual 900_000)
    // admin: floor(900_000 * 6000/10000) = 540_000
    // memberB: floor(900_000 * 3000/10000) = 270_000
    // residual: 90_000
    const beforeAdmin = (await getAccount(connection, payerAta)).amount;
    const beforeMemberB = (await getAccount(connection, memberBAta)).amount;

    await program.methods
      .dissolveOrg(orgId)
      .accounts({
        admin: admin.publicKey,
        organization: orgPda(1),
        adminMember: orgMemberPda(1, admin.publicKey),
        adminToken: payerAta,
        memberB: orgMemberPda(1, memberB.publicKey),
        memberBToken: memberBAta,
        orgTreasury: orgTreasuryPda(1),
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    org = await program.account.organization.fetch(orgPda(1));
    expect(org.status).to.equal(2); // Closed

    const afterAdmin = (await getAccount(connection, payerAta)).amount;
    const afterMemberB2 = (await getAccount(connection, memberBAta)).amount;
    expect(Number(afterAdmin - beforeAdmin)).to.equal(540_000);
    expect(Number(afterMemberB2 - beforeMemberB)).to.equal(270_000);

    treasury = await getAccount(connection, orgTreasuryPda(1));
    expect(Number(treasury.amount)).to.equal(90_000); // residual

    // Reclaim residual to admin
    await program.methods
      .reclaimOrgResidual(orgId)
      .accounts({
        authority: admin.publicKey,
        organization: orgPda(1),
        authorityMember: orgMemberPda(1, admin.publicKey),
        orgTreasury: orgTreasuryPda(1),
        destination: payerAta,
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    treasury = await getAccount(connection, orgTreasuryPda(1));
    expect(Number(treasury.amount)).to.equal(0);
  });

  it("9. cancel_escrow returns funds to payer", async () => {
    const amount = new BN(5_000);
    const escrowId = new BN(2);
    const before = (await getAccount(connection, payerAta)).amount;

    await program.methods
      .createEscrow(
        escrowId,
        amount,
        new BN(1),
        catArr(),
        0,
        Array(64).fill(0),
        new BN(0)
      )
      .accounts({
        payer: admin.publicKey,
        payee: payee.publicKey,
        config: configPda(),
        authority: authorityPda(1),
        escrow: escrowPda(2),
        escrowVault: escrowVaultPda(2),
        payerToken: payerAta,
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    await program.methods
      .cancelEscrow(escrowId)
      .accounts({
        canceller: admin.publicKey,
        escrow: escrowPda(2),
        escrowVault: escrowVaultPda(2),
        payerToken: payerAta,
        payerCri: criPda(admin.publicKey),
        aeonMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const after = (await getAccount(connection, payerAta)).amount;
    expect(Number(after)).to.equal(Number(before)); // net zero after create+cancel
    const esc = await program.account.escrow.fetch(escrowPda(2));
    expect(esc.status).to.equal(2); // Cancelled
  });
});
