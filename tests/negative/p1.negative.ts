/**
 * P1 negative e2e — slot-warp EscrowExpired, InvalidCategoryCount,
 * cascade edge cases, Token-2022 hostility (classic mint suite).
 *
 * Token-2022 happy path: p1-token2022.negative.ts (isolated process).
 */
import { expect } from "chai";
import {
  getFixture,
  expectAeonError,
  tokenBal,
  issueRoot,
  waitPastSlot,
  ONE,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  SystemProgram,
  BN,
  Keypair,
  CONDITION,
  createMint,
  airdrop,
  type Fixture,
} from "./helpers";
import { SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

describe("P1 negative e2e", function () {
  this.timeout(180_000);

  let fx: Fixture;
  let program: Fixture["program"];
  let aeon: Fixture["aeon"];

  before(async () => {
    console.log("\n  ── P1 negative suite (classic mint) ──");
    fx = await getFixture();
    program = fx.program;
    aeon = fx.aeon;
  });

  describe("NEG-AUTH P1", () => {
    it("NEG-AUTH-009 InvalidCategoryCount when categories > 8", async () => {
      const cats: number[][] = [];
      for (let i = 0; i < 9; i++) {
        const c = new Array(16).fill(0);
        c[0] = i + 1;
        cats.push(c);
      }
      await expectAeonError(
        aeon.issueAuthority({
          budget: 10 * ONE,
          maxPerTx: 5 * ONE,
          categories: cats,
        }),
        "InvalidCategoryCount"
      );
    });

    it("NEG-AUTH-010 unregistered agent cannot issue", async () => {
      const stranger = Keypair.generate();
      await airdrop(fx.connection, stranger.publicKey);
      const next = (await aeon.nextIds()).authorityId;
      try {
        await program.methods
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
            agent: stranger.publicKey,
            config: aeon.configAddress(),
            agentIdentity: aeon.agentAddress(stranger.publicKey),
            parentAuthority: null,
            authority: aeon.authorityAddress(next),
            systemProgram: SystemProgram.programId,
          })
          .signers([stranger])
          .rpc();
        expect.fail("expected unregistered agent to fail");
      } catch (e: any) {
        if (e.message?.includes("expected unregistered")) throw e;
        const s = e.toString() + (e.logs || []).join("\n");
        expect(
          s.includes("AccountNotInitialized") ||
            s.includes("ConstraintSeeds") ||
            s.includes("AgentNotActive") ||
            s.includes("Error")
        ).to.equal(true);
      }
    });
  });

  describe("NEG-ESC P1 slot-warp", () => {
    let authId: number;

    before(async () => {
      authId = await issueRoot(aeon, {
        budget: 2_000 * ONE,
        maxPerTx: 200 * ONE,
      });
    });

    it("NEG-ESC-004 EscrowExpired on IMMEDIATE after expiry_slot passes", async () => {
      const now = await fx.connection.getSlot("confirmed");
      const expiry = now + 5;
      const { escrowId } = await aeon.createEscrow({
        amount: 3 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.IMMEDIATE,
        expirySlot: expiry,
        aeonMint: fx.mint,
        tokenProgram: fx.tokenProgram,
      });

      const past = await waitPastSlot(fx.connection, expiry);
      console.log(`    ✓ slot ${now} → past expiry ${expiry} (now ${past})`);

      await expectAeonError(
        aeon.releaseEscrow(escrowId, fx.ataB),
        "EscrowExpired"
      );
      const vault = await tokenBal(
        fx.connection,
        aeon.escrowVaultAddress(escrowId)
      );
      expect(Number(vault)).to.equal(3 * ONE);
    });

    it("NEG-ESC-004b TIMEOUT release succeeds after expiry_slot", async () => {
      const now = await fx.connection.getSlot("confirmed");
      const expiry = now + 4;
      const { escrowId } = await aeon.createEscrow({
        amount: 2 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.TIMEOUT,
        expirySlot: expiry,
        aeonMint: fx.mint,
        tokenProgram: fx.tokenProgram,
      });

      await expectAeonError(
        aeon.releaseEscrow(escrowId, fx.ataB),
        "EscrowConditionFailed"
      );

      // Wait until slot >= expiry (release uses >= for TIMEOUT)
      await waitPastSlot(fx.connection, expiry - 1);

      const before = await tokenBal(fx.connection, fx.ataB);
      await aeon.releaseEscrow(escrowId, fx.ataB);
      const after = await tokenBal(fx.connection, fx.ataB);
      expect(Number(after - before)).to.equal(2 * ONE);
      console.log(`    ✓ TIMEOUT release after expiry → B +2 AEON`);
    });

    it("NEG-ESC-004c non-payer cancel allowed after expiry", async () => {
      const now = await fx.connection.getSlot("confirmed");
      const expiry = now + 4;
      const { escrowId } = await aeon.createEscrow({
        amount: 2 * ONE,
        payee: fx.agentC.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        conditionType: CONDITION.IMMEDIATE,
        expirySlot: expiry,
        aeonMint: fx.mint,
        tokenProgram: fx.tokenProgram,
      });

      await waitPastSlot(fx.connection, expiry);

      const beforeA = await tokenBal(fx.connection, fx.ataA);
      await program.methods
        .cancelEscrow(new BN(escrowId))
        .accounts({
          canceller: fx.agentB.publicKey,
          escrow: aeon.escrowAddress(escrowId),
          escrowVault: aeon.escrowVaultAddress(escrowId),
          payerToken: fx.ataA,
          payerCri: aeon.criAddress(fx.agentA.publicKey),
          aeonMint: fx.mint,
          tokenProgram: fx.tokenProgram,
        })
        .signers([fx.agentB])
        .rpc();

      const afterA = await tokenBal(fx.connection, fx.ataA);
      expect(Number(afterA - beforeA)).to.equal(2 * ONE);
      const esc = await aeon.fetchEscrow(escrowId);
      expect([2, 3]).to.include(esc.status);
      console.log(`    ✓ non-payer cancel post-expiry status=${esc.status}`);
    });
  });

  describe("NEG-T22 hostility (classic config mint)", () => {
    let authId: number;
    let spentAtStart: number;

    before(async () => {
      authId = await issueRoot(aeon, {
        budget: 200 * ONE,
        maxPerTx: 50 * ONE,
      });
      spentAtStart = (await aeon.fetchAuthority(authId)).spent.toNumber();
    });

    it("NEG-T22-001 wrong TOKEN_2022 program id fails; spent unchanged", async () => {
      try {
        await program.methods
          .pay(new BN(1 * ONE), new BN(authId), new Array(16).fill(0))
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
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("expected wrong token program to fail");
      } catch (e: any) {
        if (e.message?.includes("expected wrong")) throw e;
      }
      expect((await aeon.fetchAuthority(authId)).spent.toNumber()).to.equal(
        spentAtStart
      );
    });

    it("NEG-T22-002 foreign Token-2022 mint rejected as aeon_mint", async () => {
      const t22mint = await createMint(
        fx.connection,
        fx.admin.payer,
        fx.admin.publicKey,
        null,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      await expectAeonError(
        program.methods
          .pay(new BN(1 * ONE), new BN(authId), new Array(16).fill(0))
          .accounts({
            payer: fx.agentA.publicKey,
            payee: fx.agentB.publicKey,
            config: aeon.configAddress(),
            authority: aeon.authorityAddress(authId),
            payerCri: aeon.criAddress(fx.agentA.publicKey),
            payeeCri: aeon.criAddress(fx.agentB.publicKey),
            payerToken: fx.ataA,
            payeeToken: fx.ataB,
            aeonMint: t22mint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
        "InvalidMint"
      );
    });

    it("NEG-T22-003 classic pay still works (control)", async () => {
      const before = await tokenBal(fx.connection, fx.ataB);
      await aeon.pay({
        amount: 1 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        payeeToken: fx.ataB,
        authorityId: authId,
        aeonMint: fx.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      });
      expect(
        Number((await tokenBal(fx.connection, fx.ataB)) - before)
      ).to.equal(1 * ONE);
    });
  });

  describe("NEG-REV / ORG P1", () => {
    it("NEG-REV-004 InvalidCascadeChild when remaining is not writable", async () => {
      const root = await issueRoot(aeon, {
        budget: 40 * ONE,
        maxPerTx: 20 * ONE,
      });
      const child = await aeon.issueAuthority({
        budget: 10 * ONE,
        maxPerTx: 10 * ONE,
        parentId: root,
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
              pubkey: aeon.authorityAddress(child.authorityId),
              isWritable: false,
              isSigner: false,
            },
          ])
          .rpc(),
        "InvalidCascadeChild"
      );
    });

    it("NEG-ORG-010 unregistered creator cannot create_org", async () => {
      const stranger = Keypair.generate();
      await airdrop(fx.connection, stranger.publicKey);
      const next = (await aeon.nextIds()).orgId;
      const nameHash = Array.from(Buffer.alloc(32));
      try {
        await program.methods
          .createOrg(new BN(next), nameHash, 5000)
          .accounts({
            creator: stranger.publicKey,
            config: aeon.configAddress(),
            creatorIdentity: aeon.agentAddress(stranger.publicKey),
            organization: aeon.orgAddress(next),
            creatorMember: aeon.orgMemberAddress(next, stranger.publicKey),
            orgTreasury: aeon.orgTreasuryAddress(next),
            aeonMint: fx.mint,
            tokenProgram: fx.tokenProgram,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([stranger])
          .rpc();
        expect.fail("expected unregistered create_org to fail");
      } catch (e: any) {
        if (e.message?.includes("expected unregistered")) throw e;
        expect(e.toString().includes("Error") || e.toString().includes("failed")).to.equal(
          true
        );
      }
    });
  });
});
