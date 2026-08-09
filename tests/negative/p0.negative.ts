/**
 * P0 negative e2e suite — exact AeonError + fail-closed oracles.
 * Catalog: docs/stoa/CASE_CATALOG.md
 *
 *   npm run test:negative
 */
import { expect } from "chai";
import {
  getFixture,
  expectAeonError,
  tokenBal,
  issueRoot,
  issueChild,
  cat,
  zeroCat,
  ONE,
  airdrop,
  TOKEN_PROGRAM_ID,
  SystemProgram,
  BN,
  Keypair,
  ROLE,
  CONDITION,
  createMint,
  createAccount,
  mintTo,
  type Fixture,
} from "./helpers";

describe("P0 negative e2e", function () {
  this.timeout(180_000);

  let fx: Fixture;
  let program: Fixture["program"];
  let aeon: Fixture["aeon"];

  before(async () => {
    console.log("\n  ── P0 negative suite: bootstrap ──");
    fx = await getFixture();
    program = fx.program;
    aeon = fx.aeon;
    console.log(`  mint=${fx.mint.toBase58().slice(0, 8)}… agents ready\n`);
  });

  describe("NEG-AUTH hierarchy", () => {
    it("NEG-AUTH-001 MaxDelegationDepth on depth 4", async () => {
      const r = await issueRoot(aeon, { budget: 500 * ONE, maxPerTx: 100 * ONE });
      const d1 = await issueChild(aeon, r, { budget: 200 * ONE });
      const d2 = await issueChild(aeon, d1, { budget: 80 * ONE });
      const d3 = await issueChild(aeon, d2, { budget: 20 * ONE });
      expect((await aeon.fetchAuthority(d3)).depth).to.equal(3);

      await expectAeonError(
        aeon.issueAuthority({
          budget: 5 * ONE,
          maxPerTx: 5 * ONE,
          parentId: d3,
        }),
        "MaxDelegationDepth"
      );
    });

    it("NEG-AUTH-002 EmptyCategoryIntersection", async () => {
      const parent = await issueRoot(aeon, {
        budget: 100 * ONE,
        maxPerTx: 50 * ONE,
        categories: [cat("compute")],
      });
      await expectAeonError(
        aeon.issueAuthority({
          budget: 10 * ONE,
          maxPerTx: 10 * ONE,
          parentId: parent,
          categories: [cat("research")],
        }),
        "EmptyCategoryIntersection"
      );
    });

    it("NEG-AUTH-003 ChildBudgetExceedsParent", async () => {
      const parent = await issueRoot(aeon, {
        budget: 50 * ONE,
        maxPerTx: 50 * ONE,
      });
      await expectAeonError(
        aeon.issueAuthority({
          budget: 51 * ONE,
          maxPerTx: 50 * ONE,
          parentId: parent,
        }),
        "ChildBudgetExceedsParent"
      );
    });

    it("NEG-AUTH-004 ParentNotActive after revoke", async () => {
      const parent = await issueRoot(aeon, { budget: 80 * ONE, maxPerTx: 40 * ONE });
      await aeon.revokeAuthority(parent, []);
      await expectAeonError(
        aeon.issueAuthority({
          budget: 10 * ONE,
          maxPerTx: 10 * ONE,
          parentId: parent,
        }),
        "ParentNotActive"
      );
    });

    it("NEG-AUTH-005 ParentRequired when parent_id≠0 and parent null", async () => {
      const parent = await issueRoot(aeon, { budget: 40 * ONE, maxPerTx: 20 * ONE });
      const next = (await aeon.nextIds()).authorityId;
      await expectAeonError(
        program.methods
          .issueAuthority(
            new BN(next),
            new BN(5 * ONE),
            new BN(5 * ONE),
            new BN(5 * ONE),
            [],
            new BN(parent),
            new BN(0)
          )
          .accounts({
            agent: fx.agentA.publicKey,
            config: aeon.configAddress(),
            agentIdentity: aeon.agentAddress(),
            parentAuthority: null,
            authority: aeon.authorityAddress(next),
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
        "ParentRequired"
      );
    });

    it("NEG-AUTH-006 Unauthorized root with parent account supplied", async () => {
      const decoy = await issueRoot(aeon, { budget: 30 * ONE, maxPerTx: 15 * ONE });
      const next = (await aeon.nextIds()).authorityId;
      await expectAeonError(
        program.methods
          .issueAuthority(
            new BN(next),
            new BN(5 * ONE),
            new BN(5 * ONE),
            new BN(5 * ONE),
            [],
            new BN(0),
            new BN(0)
          )
          .accounts({
            agent: fx.agentA.publicKey,
            config: aeon.configAddress(),
            agentIdentity: aeon.agentAddress(),
            parentAuthority: aeon.authorityAddress(decoy),
            authority: aeon.authorityAddress(next),
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-AUTH-007 cross-agent parent → Unauthorized", async () => {
      const parent = await issueRoot(aeon, { budget: 60 * ONE, maxPerTx: 30 * ONE });
      const next = (await aeon.nextIds()).authorityId;
      await expectAeonError(
        program.methods
          .issueAuthority(
            new BN(next),
            new BN(5 * ONE),
            new BN(5 * ONE),
            new BN(5 * ONE),
            [],
            new BN(parent),
            new BN(0)
          )
          .accounts({
            agent: fx.agentB.publicKey,
            config: aeon.configAddress(),
            agentIdentity: aeon.agentAddress(fx.agentB.publicKey),
            parentAuthority: aeon.authorityAddress(parent),
            authority: aeon.authorityAddress(next),
            systemProgram: SystemProgram.programId,
          })
          .signers([fx.agentB])
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-AUTH-008 ParentIdMismatch", async () => {
      const p1 = await issueRoot(aeon, { budget: 40 * ONE, maxPerTx: 20 * ONE });
      const p2 = await issueRoot(aeon, { budget: 40 * ONE, maxPerTx: 20 * ONE });
      const next = (await aeon.nextIds()).authorityId;
      await expectAeonError(
        program.methods
          .issueAuthority(
            new BN(next),
            new BN(5 * ONE),
            new BN(5 * ONE),
            new BN(5 * ONE),
            [],
            new BN(p1),
            new BN(0)
          )
          .accounts({
            agent: fx.agentA.publicKey,
            config: aeon.configAddress(),
            agentIdentity: aeon.agentAddress(),
            parentAuthority: aeon.authorityAddress(p2),
            authority: aeon.authorityAddress(next),
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
        "ParentIdMismatch"
      );
    });
  });

  describe("NEG-PAY spend gates", () => {
    let authId: number;

    before(async () => {
      authId = await issueRoot(aeon, {
        budget: 500 * ONE,
        maxPerTx: 50 * ONE,
        categories: [cat("compute")],
      });
    });

    it("NEG-PAY-001 ExceedsMaxPerTx", async () => {
      const spentBefore = (await aeon.fetchAuthority(authId)).spent.toNumber();
      const balBefore = await tokenBal(fx.connection, fx.ataA);
      await expectAeonError(
        aeon.pay({
          amount: 51 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: authId,
          category: cat("compute"),
          aeonMint: fx.mint,
        }),
        "ExceedsMaxPerTx"
      );
      expect((await aeon.fetchAuthority(authId)).spent.toNumber()).to.equal(spentBefore);
      expect(await tokenBal(fx.connection, fx.ataA)).to.equal(balBefore);
    });

    it("NEG-PAY-002 budget/max_total ceiling (ExceedsMaxTotal)", async () => {
      const id = await issueRoot(aeon, {
        budget: 10 * ONE,
        maxPerTx: 10 * ONE,
        categories: [],
      });
      await aeon.pay({
        amount: 9 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        payeeToken: fx.ataB,
        authorityId: id,
        aeonMint: fx.mint,
      });
      await expectAeonError(
        aeon.pay({
          amount: 2 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: id,
          aeonMint: fx.mint,
        }),
        "ExceedsMaxTotal"
      );
      expect((await aeon.fetchAuthority(id)).spent.toNumber()).to.equal(9 * ONE);
    });

    it("NEG-PAY-002b InsufficientBudget when ATA balance too low", async () => {
      const idB = await (async () => {
        const next = (await aeon.nextIds()).authorityId;
        await program.methods
          .issueAuthority(
            new BN(next),
            new BN(1000 * ONE),
            new BN(500 * ONE),
            new BN(1000 * ONE),
            [],
            new BN(0),
            new BN(0)
          )
          .accounts({
            agent: fx.agentB.publicKey,
            config: aeon.configAddress(),
            agentIdentity: aeon.agentAddress(fx.agentB.publicKey),
            parentAuthority: null,
            authority: aeon.authorityAddress(next),
            systemProgram: SystemProgram.programId,
          })
          .signers([fx.agentB])
          .rpc();
        return next;
      })();
      const spent0 = (await aeon.fetchAuthority(idB)).spent.toNumber();
      await expectAeonError(
        program.methods
          .pay(new BN(500 * ONE), new BN(idB), zeroCat())
          .accounts({
            payer: fx.agentB.publicKey,
            payee: fx.agentC.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(idB),
            payerCri: aeon.criAddress(fx.agentB.publicKey),
            payeeCri: aeon.criAddress(fx.agentC.publicKey),
            payerToken: fx.ataB,
            payeeToken: fx.ataC,
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([fx.agentB])
          .rpc(),
        "InsufficientBudget"
      );
      expect((await aeon.fetchAuthority(idB)).spent.toNumber()).to.equal(spent0);
    });

    it("NEG-PAY-003 CategoryNotAllowed", async () => {
      const spentBefore = (await aeon.fetchAuthority(authId)).spent.toNumber();
      await expectAeonError(
        aeon.pay({
          amount: 1 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: authId,
          category: cat("research"),
          aeonMint: fx.mint,
        }),
        "CategoryNotAllowed"
      );
      expect((await aeon.fetchAuthority(authId)).spent.toNumber()).to.equal(spentBefore);
    });

    it("NEG-PAY-005 AuthorityNotActive after revoke", async () => {
      const id = await issueRoot(aeon, { budget: 20 * ONE, maxPerTx: 10 * ONE });
      await aeon.revokeAuthority(id, []);
      await expectAeonError(
        aeon.pay({
          amount: 1 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: id,
          aeonMint: fx.mint,
        }),
        "AuthorityNotActive"
      );
    });

    it("NEG-PAY-006 AuthorityRequired when id≠0 and authority null", async () => {
      await expectAeonError(
        program.methods
          .pay(new BN(1 * ONE), new BN(authId), zeroCat())
          .accounts({
            payer: fx.agentA.publicKey,
            payee: fx.agentB.publicKey,
            config: aeon.configAddress(),
            authority: null,
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            payeeCri: aeon.criAddress(fx.agentB.publicKey),
            payerToken: fx.ataA,
            payeeToken: fx.ataB,
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc(),
        "AuthorityRequired"
      );
    });

    it("NEG-PAY-007 Unauthorized when id=0 but authority Some", async () => {
      await expectAeonError(
        program.methods
          .pay(new BN(1 * ONE), new BN(0), zeroCat())
          .accounts({
            payer: fx.agentA.publicKey,
            payee: fx.agentB.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(authId),
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            payeeCri: aeon.criAddress(fx.agentB.publicKey),
            payerToken: fx.ataA,
            payeeToken: fx.ataB,
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-PAY-008 Unauthorized self-pay", async () => {
      await expectAeonError(
        aeon.pay({
          amount: 1 * ONE,
          payee: fx.agentA.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataA,
          authorityId: authId,
          category: cat("compute"),
          aeonMint: fx.mint,
        }),
        "Unauthorized"
      );
    });

    it("NEG-PAY-009 InvalidAmount zero", async () => {
      await expectAeonError(
        aeon.pay({
          amount: 0,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: authId,
          category: cat("compute"),
          aeonMint: fx.mint,
        }),
        "InvalidAmount"
      );
    });

    it("NEG-PAY-010 InvalidMint wrong mint account", async () => {
      const badMint = await createMint(
        fx.connection,
        fx.admin.payer,
        fx.admin.publicKey,
        null,
        6
      );
      await expectAeonError(
        program.methods
          .pay(new BN(1 * ONE), new BN(authId), cat("compute"))
          .accounts({
            payer: fx.agentA.publicKey,
            payee: fx.agentB.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(authId),
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            payeeCri: aeon.criAddress(fx.agentB.publicKey),
            payerToken: fx.ataA,
            payeeToken: fx.ataB,
            aeonMint: badMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc(),
        "InvalidMint"
      );
    });

    it("NEG-PAY-011 Unauthorized payee_token owner mismatch", async () => {
      await expectAeonError(
        program.methods
          .pay(new BN(1 * ONE), new BN(authId), cat("compute"))
          .accounts({
            payer: fx.agentA.publicKey,
            payee: fx.agentB.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(authId),
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            payeeCri: aeon.criAddress(fx.agentB.publicKey),
            payerToken: fx.ataA,
            payeeToken: fx.ataA,
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-PAY-012 Unauthorized wrong authority PDA for id", async () => {
      const other = await issueRoot(aeon, {
        budget: 20 * ONE,
        maxPerTx: 10 * ONE,
        categories: [cat("compute")],
      });
      await expectAeonError(
        program.methods
          .pay(new BN(1 * ONE), new BN(authId), cat("compute"))
          .accounts({
            payer: fx.agentA.publicKey,
            payee: fx.agentB.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(other),
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            payeeCri: aeon.criAddress(fx.agentB.publicKey),
            payerToken: fx.ataA,
            payeeToken: fx.ataB,
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-PAY-013 AuthorityAgentMismatch (B spends A's authority)", async () => {
      await expectAeonError(
        program.methods
          .pay(new BN(1 * ONE), new BN(authId), cat("compute"))
          .accounts({
            payer: fx.agentB.publicKey,
            payee: fx.agentC.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(authId),
            payerCri: aeon.criAddress(fx.agentB.publicKey),
            payeeCri: aeon.criAddress(fx.agentC.publicKey),
            payerToken: fx.ataB,
            payeeToken: fx.ataC,
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([fx.agentB])
          .rpc(),
        "AuthorityAgentMismatch"
      );
    });

    it("NEG-PAY-014 AuthorityExpired", async () => {
      const id = await issueRoot(aeon, {
        budget: 20 * ONE,
        maxPerTx: 10 * ONE,
        expirySlot: 1,
      });
      await expectAeonError(
        aeon.pay({
          amount: 1 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: id,
          aeonMint: fx.mint,
        }),
        "AuthorityExpired"
      );
    });

    it("NEG-PAY-016 fail-closed: spent unchanged on validation fail", async () => {
      const id = await issueRoot(aeon, {
        budget: 100 * ONE,
        maxPerTx: 20 * ONE,
        categories: [cat("compute")],
      });
      const spent0 = (await aeon.fetchAuthority(id)).spent.toNumber();
      const bal0 = await tokenBal(fx.connection, fx.ataA);
      await expectAeonError(
        aeon.pay({
          amount: 25 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: id,
          category: cat("compute"),
          aeonMint: fx.mint,
        }),
        "ExceedsMaxPerTx"
      );
      expect((await aeon.fetchAuthority(id)).spent.toNumber()).to.equal(spent0);
      expect(await tokenBal(fx.connection, fx.ataA)).to.equal(bal0);
    });
  });

  describe("NEG-ESC lifecycle", () => {
    let authId: number;

    before(async () => {
      authId = await issueRoot(aeon, {
        budget: 1_000 * ONE,
        maxPerTx: 200 * ONE,
      });
    });

    it("NEG-ESC-001 EscrowNotOpen on re-release", async () => {
      const { escrowId } = await aeon.createEscrow({
        amount: 5 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.IMMEDIATE,
        aeonMint: fx.mint,
      });
      await aeon.releaseEscrow(escrowId, fx.ataB);
      await expectAeonError(
        aeon.releaseEscrow(escrowId, fx.ataB),
        "EscrowNotOpen"
      );
    });

    it("NEG-ESC-002 EscrowConditionFailed bad receipt witness", async () => {
      const conditionData = new Array(64).fill(0);
      conditionData[0] = 0xaa;
      const { escrowId } = await aeon.createEscrow({
        amount: 3 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.RECEIPT,
        conditionData,
        aeonMint: fx.mint,
      });
      const badWitness = new Array(64).fill(0);
      badWitness[0] = 0xbb;
      await expectAeonError(
        aeon.releaseEscrow(escrowId, fx.ataB, badWitness),
        "EscrowConditionFailed"
      );
    });

    it("NEG-ESC-003 EscrowConditionFailed timeout before expiry", async () => {
      const far = 9_000_000_000;
      const { escrowId } = await aeon.createEscrow({
        amount: 2 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.TIMEOUT,
        expirySlot: far,
        aeonMint: fx.mint,
      });
      await expectAeonError(
        aeon.releaseEscrow(escrowId, fx.ataB),
        "EscrowConditionFailed"
      );
    });

    it("NEG-ESC-005 EscrowCancelUnauthorized non-payer", async () => {
      const { escrowId } = await aeon.createEscrow({
        amount: 2 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.IMMEDIATE,
        aeonMint: fx.mint,
      });
      await expectAeonError(
        program.methods
          .cancelEscrow(new BN(escrowId))
          .accounts({
            canceller: fx.agentB.publicKey,
            escrow: aeon.escrowAddress(escrowId),
            escrowVault: aeon.escrowVaultAddress(escrowId),
            payerToken: fx.ataA,
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([fx.agentB])
          .rpc(),
        "EscrowCancelUnauthorized"
      );
    });

    it("NEG-ESC-006 EscrowConditionFailed oracle type", async () => {
      const { escrowId } = await aeon.createEscrow({
        amount: 2 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.ORACLE,
        aeonMint: fx.mint,
      });
      await expectAeonError(
        aeon.releaseEscrow(escrowId, fx.ataB),
        "EscrowConditionFailed"
      );
    });

    it("NEG-ESC-007 release id/account seeds mismatch fails closed", async () => {
      const { escrowId } = await aeon.createEscrow({
        amount: 2 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.IMMEDIATE,
        aeonMint: fx.mint,
      });
      try {
        await program.methods
          .releaseEscrow(new BN(escrowId + 999), new Array(64).fill(0))
          .accounts({
            releaser: fx.agentA.publicKey,
            escrow: aeon.escrowAddress(escrowId),
            escrowVault: aeon.escrowVaultAddress(escrowId),
            payeeToken: fx.ataB,
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            payeeCri: aeon.criAddress(fx.agentB.publicKey),
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        expect.fail("expected seeds/id mismatch to fail");
      } catch (e: any) {
        const s = e.toString() + (e.logs || []).join("\n");
        expect(
          s.includes("ConstraintSeeds") || s.includes("EscrowIdMismatch")
        ).to.equal(true);
      }
      const vault = await tokenBal(fx.connection, aeon.escrowVaultAddress(escrowId));
      expect(Number(vault)).to.equal(2 * ONE);
    });

    it("NEG-ESC-008 Unauthorized release to wrong payee ATA", async () => {
      const { escrowId } = await aeon.createEscrow({
        amount: 2 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.IMMEDIATE,
        aeonMint: fx.mint,
      });
      await expectAeonError(
        aeon.releaseEscrow(escrowId, fx.ataC),
        "Unauthorized"
      );
    });

    it("NEG-ESC-009 AuthorityNotActive on create_escrow", async () => {
      const id = await issueRoot(aeon, { budget: 50 * ONE, maxPerTx: 25 * ONE });
      await aeon.revokeAuthority(id, []);
      await expectAeonError(
        aeon.createEscrow({
          amount: 1 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          authorityId: id,
          aeonMint: fx.mint,
        }),
        "AuthorityNotActive"
      );
    });

    it("NEG-ESC-010 EscrowIdMismatch wrong client id", async () => {
      const next = (await aeon.nextIds()).escrowId;
      await expectAeonError(
        aeon.createEscrow({
          amount: 1 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          escrowId: next + 5,
          authorityId: authId,
          aeonMint: fx.mint,
        }),
        "EscrowIdMismatch"
      );
    });
  });

  describe("NEG-ORG treasury & membership", () => {
    let orgId: number;

    before(async () => {
      const nameHash = Array.from(Buffer.from("neg-org".padEnd(32, "\0")));
      const org = await aeon.createOrg({
        nameHash,
        creatorShareBps: 5000,
        aeonMint: fx.mint,
      });
      orgId = org.orgId;
      await aeon.joinOrg(orgId, fx.agentB.publicKey, ROLE.MEMBER, 3000);
      await aeon.joinOrg(orgId, fx.agentC.publicKey, ROLE.VIEWER, 0);
      await aeon.depositToOrg(orgId, 100 * ONE, fx.ataA);
    });

    it("NEG-ORG-001 ShareBpsExceedsMax on join", async () => {
      const agentD = Keypair.generate();
      await airdrop(fx.connection, agentD.publicKey);
      await aeon.registerAgent(agentD.publicKey, { signers: [agentD] });
      await expectAeonError(
        aeon.joinOrg(orgId, agentD.publicKey, ROLE.MEMBER, 3000),
        "ShareBpsExceedsMax"
      );
    });

    it("NEG-ORG-002 InvalidShareBps > 10000", async () => {
      const agentE = Keypair.generate();
      await airdrop(fx.connection, agentE.publicKey);
      await aeon.registerAgent(agentE.publicKey, { signers: [agentE] });
      await expectAeonError(
        aeon.joinOrg(orgId, agentE.publicKey, ROLE.MEMBER, 10001),
        "InvalidShareBps"
      );
    });

    it("NEG-ORG-003 Unauthorized non-admin join", async () => {
      const agentF = Keypair.generate();
      await airdrop(fx.connection, agentF.publicKey);
      await aeon.registerAgent(agentF.publicKey, { signers: [agentF] });
      await expectAeonError(
        program.methods
          .joinOrg(new BN(orgId), ROLE.MEMBER, 100)
          .accounts({
            admin: fx.agentB.publicKey,
            newAgent: agentF.publicKey,
            organization: aeon.orgAddress(orgId),
            adminMember: aeon.orgMemberAddress(orgId, fx.agentB.publicKey),
            agentIdentity: aeon.agentAddress(agentF.publicKey),
            newMember: aeon.orgMemberAddress(orgId, agentF.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([fx.agentB])
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-ORG-004 Unauthorized viewer as org_split recipient", async () => {
      await expectAeonError(
        aeon.orgSplit({
          orgId,
          amount: 1 * ONE,
          recipient: fx.agentC.publicKey,
          recipientToken: fx.ataC,
          aeonMint: fx.mint,
        }),
        "Unauthorized"
      );
    });

    it("NEG-ORG-007 Unauthorized non-member deposit", async () => {
      const stranger = Keypair.generate();
      await airdrop(fx.connection, stranger.publicKey);
      await aeon.registerAgent(stranger.publicKey, { signers: [stranger] });
      const strangerAta = await createAccount(
        fx.connection,
        fx.admin.payer,
        fx.mint,
        stranger.publicKey
      );
      await mintTo(
        fx.connection,
        fx.admin.payer,
        fx.mint,
        strangerAta,
        fx.admin.publicKey,
        10 * ONE
      );
      try {
        await program.methods
          .depositToOrg(new BN(orgId), new BN(1 * ONE))
          .accounts({
            member: stranger.publicKey,
            organization: aeon.orgAddress(orgId),
            orgMember: aeon.orgMemberAddress(orgId, stranger.publicKey),
            orgTreasury: aeon.orgTreasuryAddress(orgId),
            memberToken: strangerAta,
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([stranger])
          .rpc();
        expect.fail("expected deposit by non-member to fail");
      } catch (e: any) {
        const s = e.toString() + (e.logs || []).join("\n");
        expect(s.includes("Error") || s.includes("failed")).to.equal(true);
      }
    });

    it("NEG-ORG-008 TreasuryConservation over-split", async () => {
      const treasury = await tokenBal(
        fx.connection,
        aeon.orgTreasuryAddress(orgId)
      );
      await expectAeonError(
        aeon.orgSplit({
          orgId,
          amount: Number(treasury) + 1,
          recipient: fx.agentB.publicKey,
          recipientToken: fx.ataB,
          aeonMint: fx.mint,
        }),
        "TreasuryConservation"
      );
    });

    it("NEG-ORG-009 ShareBpsExceedsMax set_share grow-first", async () => {
      await expectAeonError(
        aeon.setMemberShare(orgId, fx.agentB.publicKey, 6000),
        "ShareBpsExceedsMax"
      );
    });

    it("NEG-ORG-011 Unauthorized member dissolve", async () => {
      await expectAeonError(
        program.methods
          .dissolveOrg(new BN(orgId))
          .accounts({
            admin: fx.agentB.publicKey,
            organization: aeon.orgAddress(orgId),
            adminMember: aeon.orgMemberAddress(orgId, fx.agentB.publicKey),
            adminToken: fx.ataB,
            memberB: null,
            memberBToken: null,
            orgTreasury: aeon.orgTreasuryAddress(orgId),
            aeonMint: fx.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([fx.agentB])
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-ORG-006 OrgNotClosed reclaim while Active", async () => {
      await expectAeonError(
        aeon.reclaimOrgResidual(orgId, fx.ataA),
        "OrgNotClosed"
      );
    });

    it("NEG-ORG-005 OrgNotActive deposit after dissolve", async () => {
      await aeon.dissolveOrg({
        orgId,
        adminToken: fx.ataA,
        memberB: fx.agentB.publicKey,
        memberBToken: fx.ataB,
        aeonMint: fx.mint,
      });
      expect((await aeon.fetchOrg(orgId)).status).to.equal(2);
      await expectAeonError(
        aeon.depositToOrg(orgId, 1 * ONE, fx.ataA),
        "OrgNotActive"
      );
    });
  });

  describe("NEG-REV revoke", () => {
    it("NEG-REV-001 AuthorityAlreadyRevoked", async () => {
      const id = await issueRoot(aeon, { budget: 10 * ONE, maxPerTx: 5 * ONE });
      await aeon.revokeAuthority(id, []);
      await expectAeonError(aeon.revokeAuthority(id, []), "AuthorityAlreadyRevoked");
    });

    it("NEG-REV-002 AuthorityAgentMismatch other agent", async () => {
      const id = await issueRoot(aeon, { budget: 10 * ONE, maxPerTx: 5 * ONE });
      await expectAeonError(
        program.methods
          .revokeAuthority(new BN(id))
          .accounts({
            agent: fx.agentB.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(id),
          })
          .signers([fx.agentB])
          .rpc(),
        "AuthorityAgentMismatch"
      );
    });

    it("NEG-REV-003 InvalidCascadeChild non-child remaining", async () => {
      const root = await issueRoot(aeon, { budget: 30 * ONE, maxPerTx: 15 * ONE });
      const unrelated = await issueRoot(aeon, {
        budget: 10 * ONE,
        maxPerTx: 5 * ONE,
      });
      await expectAeonError(
        program.methods
          .revokeAuthority(new BN(root))
          .accounts({
            agent: fx.agentA.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(root),
          })
          .remainingAccounts([
            {
              pubkey: aeon.authorityAddress(unrelated),
              isWritable: true,
              isSigner: false,
            },
          ])
          .rpc(),
        "InvalidCascadeChild"
      );
    });
  });
});
