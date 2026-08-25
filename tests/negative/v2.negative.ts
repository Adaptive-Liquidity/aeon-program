import { expect } from "chai";
import {
  bootstrapFixture,
  expectAeonError,
  expectTxFail,
  getFixture,
  tokenBal,
  ONE,
  issueRoot,
  airdrop,
  createAgentClient,
} from "./helpers";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotent, mintTo, TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { RECEIPT_TYPE, BOND_STATUS, AUTH_STATUS } from "../../client";

describe("v0.2 Negative Tests", () => {
  before(async () => {
    await bootstrapFixture();
  });

  describe("Receipts (NEG-RCPT)", () => {
    it("NEG-RCPT-001: Empty payload", async () => {
      const fx = await getFixture();
      await expectAeonError(
        fx.aeon.createReceipt({
          receiptType: RECEIPT_TYPE.PAY,
          payload: Buffer.from([]),
        }),
        "InvalidPayload"
      );
    });

    it("NEG-RCPT-002: >1024 payload", async () => {
      const fx = await getFixture();
      // A 1025-byte payload exceeds the transaction size limit, so the client
      // throws a local RangeError during serialization BEFORE the program runs.
      // Assert any failure (not a specific on-chain AeonError).
      await expectTxFail(
        fx.aeon.createReceipt({
          receiptType: RECEIPT_TYPE.PAY,
          payload: Buffer.alloc(1025, 0x1),
        })
      );
    });

    it("NEG-RCPT-003: ID mismatch", async () => {
      const fx = await getFixture();
      const nextIds = await fx.aeon.nextIds();
      await expectAeonError(
        fx.aeon.createReceipt({
          receiptId: nextIds.receiptId + 1, // Wrong ID
          receiptType: RECEIPT_TYPE.PAY,
          payload: Buffer.from("hello"),
        }),
        "ReceiptIdMismatch"
      );
    });

    it("NEG-RCPT-005: Paused blocks receipt", async () => {
      const fx = await getFixture();
      // Admin pauses protocol
      await fx.aeon.setPaused(true);

      await expectAeonError(
        fx.aeon.createReceipt({
          receiptType: RECEIPT_TYPE.PAY,
          payload: Buffer.from("test paused"),
        }),
        "Paused"
      );

      // Unpause
      await fx.aeon.setPaused(false);
    });
  });

  describe("Config & Pause (NEG-CFG)", () => {
    it("NEG-CFG-001: Non-admin calling set_paused", async () => {
      const fx = await getFixture();
      await expectAeonError(
        fx.aeon.program.methods
          .setPaused(true)
          .accounts({
            admin: fx.agentB.publicKey,
            config: fx.aeon.configAddress(),
          })
          .signers([fx.agentB])
          .rpc(),
        "Unauthorized"
      );
    });

    it("NEG-CFG-002: Paused blocks issue_authority and register_agent", async () => {
      const fx = await getFixture();
      await fx.aeon.setPaused(true);

      try {
        await expectAeonError(
          fx.aeon.issueAuthority({
            budget: 10 * ONE,
            maxPerTx: 10 * ONE,
          }),
          "Paused"
        );

        const newAgent = Keypair.generate();
        // Airdrop SOL to new agent for rent
        await fx.connection.requestAirdrop(newAgent.publicKey, 2 * 10**9);
        await fx.connection.confirmTransaction(
          await fx.connection.requestAirdrop(newAgent.publicKey, 2 * 10**9),
          "confirmed"
        );
        await expectAeonError(
          fx.aeon.registerAgent(newAgent.publicKey, { signers: [newAgent] }),
          "Paused"
        );
      } finally {
        await fx.aeon.setPaused(false);
      }
    });
  });

  describe("Expiry (NEG-AUTH)", () => {
    let authIdWithExpiry: number;

    before(async () => {
      const fx = await getFixture();
      const slot = await fx.connection.getSlot("confirmed");
      authIdWithExpiry = await issueRoot(fx.aeon, { expirySlot: slot + 200 }); // some future slot
    });

    it("NEG-AUTH-012: Expiring before expiry_slot", async () => {
      const fx = await getFixture();
      await expectAeonError(
        fx.aeon.expireAuthority({ authorityId: authIdWithExpiry }),
        "AuthorityNotExpired"
      );
    });

    it("NEG-AUTH-013: Expiring authority with expiry_slot=0", async () => {
      const fx = await getFixture();
      const noExpiryId = await issueRoot(fx.aeon, { expirySlot: 0 });
      await expectAeonError(
        fx.aeon.expireAuthority({ authorityId: noExpiryId }),
        "AuthorityNotExpired" // 0 means no expiry, so it's never expired
      );
    });

    it("NEG-AUTH-014: Non-owner attempting to expire", async () => {
      const fx = await getFixture();
      const slot = await fx.connection.getSlot("confirmed");
      const authId = await issueRoot(fx.aeon, { expirySlot: slot + 1 });

      // Wait for expiry
      let currentSlot = slot;
      while (currentSlot <= slot + 1) {
        await new Promise((r) => setTimeout(r, 400));
        currentSlot = await fx.connection.getSlot("confirmed");
      }

      await expectAeonError(
        fx.aeon.expireAuthority({ authorityId: authId, agent: fx.agentB.publicKey }, { signers: [fx.agentB] }),
        "Unauthorized"
      );
    });
  });

  describe("Bond (NEG-BOND)", () => {
    let bondAuthId: number;
    let bondVault: PublicKey;

    before(async () => {
      const fx = await getFixture();
      const nextIds = await fx.aeon.nextIds();
      const authorityId = nextIds.authorityId;
      const bondPda = fx.aeon.authorityBondAddress(authorityId);

      const { authorityId: createdId } = await fx.aeon.issueAuthority({
        budget: 10 * ONE,
        maxPerTx: 10 * ONE,
        bondAmount: 50 * ONE,
        agentVault: fx.ataA,
        bondVault: await createAssociatedTokenAccountIdempotent(
          fx.connection,
          fx.admin.payer,
          fx.mint,
          bondPda,
          {},
          fx.tokenProgram,
          undefined,
          true
        ),
      });
      bondAuthId = createdId;
      // Compute the bond vault ATA (owned by bond PDA)
      bondVault = await getAssociatedTokenAddress(
        fx.mint,
        bondPda,
        true,
        fx.tokenProgram
      );
    });

    it("NEG-BOND-001: Zero bond slash", async () => {
      const fx = await getFixture();
      const noBondId = await issueRoot(fx.aeon); // bond=0

      await expectAeonError(
        fx.aeon.slashBond({
          authorityId: noBondId,
          bondVault: fx.ataA, // random
          destination: fx.ataA,
        }),
        "AccountNotInitialized" // bond account doesn't exist for zero-bond authorities
      );
    });

    it("NEG-BOND-002: Non-owner slash", async () => {
      const fx = await getFixture();
      // slasher must be the agent who created the authority; agentB is not the owner.
      const agentBClient = createAgentClient(fx.agentB, fx.aeon);
      await expectAeonError(
        agentBClient.slashBond({
          authorityId: bondAuthId,
          bondVault: bondVault,
          destination: fx.ataB,
        }),
        "Unauthorized"
      );
    });

    it("NEG-BOND-004: Insufficient bond during issue_authority", async () => {
      const fx = await getFixture();
      const nextIds = await fx.aeon.nextIds();

      // Try to issue with bond = 1_000_000 ONE, which agent A doesn't have
      const bondVaultAddr = fx.aeon.authorityBondAddress(nextIds.authorityId);
      const bondVaultAta = await createAssociatedTokenAccountIdempotent(
        fx.connection,
        fx.admin.payer,
        fx.mint,
        bondVaultAddr,
        {},
        fx.tokenProgram,
        undefined,
        true
      );

      // Should fail transfer inside issue_authority
      await expectTxFail(
        fx.aeon.issueAuthority({
          budget: 10 * ONE,
          maxPerTx: 10 * ONE,
          bondAmount: 999_999_999 * ONE,
          agentVault: fx.ataA,
          bondVault: bondVaultAta,
        })
      );
    });
  });
});
