/**
 * P1 Token-2022 happy-path isolation suite.
 * Bootstraps protocol mint as Token-2022 (cannot share process with classic P0).
 */
import { expect } from "chai";
import {
  bootstrapFixture,
  expectAeonError,
  tokenBal,
  issueRoot,
  cat,
  ONE,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  CONDITION,
  type Fixture,
} from "./helpers";
import { getAccount } from "@solana/spl-token";

describe("P1 Token-2022 protocol mint", function () {
  this.timeout(180_000);

  let fx: Fixture;
  let aeon: Fixture["aeon"];
  const TP = TOKEN_2022_PROGRAM_ID;

  before(async () => {
    console.log("\n  ── P1 Token-2022 suite: bootstrap with TOKEN_2022 mint ──");
    fx = await bootstrapFixture({ token2022: true, force: true });
    aeon = fx.aeon;
    expect(fx.tokenProgram.equals(TP)).to.equal(true);
    // Sanity: ATAs owned by Token-2022
    const a = await getAccount(fx.connection, fx.ataA, undefined, TP);
    expect(Number(a.amount)).to.be.greaterThan(0);
    console.log(`  t22 mint=${fx.mint.toBase58().slice(0, 8)}… funded\n`);
  });

  it("NEG-T22-010 pay under authority with Token-2022 succeeds", async () => {
    const authId = await issueRoot(aeon, {
      budget: 100 * ONE,
      maxPerTx: 50 * ONE,
      categories: [cat("compute")],
    });
    const before = await tokenBal(fx.connection, fx.ataB, TP);
    await aeon.pay({
      amount: 7 * ONE,
      payee: fx.agentB.publicKey,
      payerToken: fx.ataA,
      payeeToken: fx.ataB,
      authorityId: authId,
      category: cat("compute"),
      aeonMint: fx.mint,
      tokenProgram: TP,
    });
    expect(
      Number((await tokenBal(fx.connection, fx.ataB, TP)) - before)
    ).to.equal(7 * ONE);
    expect((await aeon.fetchAuthority(authId)).spent.toNumber()).to.equal(
      7 * ONE
    );
  });

  it("NEG-T22-011 create_escrow + release with Token-2022 vault", async () => {
    const authId = await issueRoot(aeon, {
      budget: 100 * ONE,
      maxPerTx: 50 * ONE,
    });
    const { escrowId } = await aeon.createEscrow({
      amount: 5 * ONE,
      payee: fx.agentC.publicKey,
      payerToken: fx.ataA,
      authorityId: authId,
      conditionType: CONDITION.IMMEDIATE,
      aeonMint: fx.mint,
      tokenProgram: TP,
    });

    const vault = await getAccount(
      fx.connection,
      aeon.escrowVaultAddress(escrowId),
      undefined,
      TP
    );
    expect(Number(vault.amount)).to.equal(5 * ONE);

    const beforeC = await tokenBal(fx.connection, fx.ataC, TP);
    await aeon.releaseEscrow(escrowId, fx.ataC);
    const afterC = await tokenBal(fx.connection, fx.ataC, TP);
    expect(Number(afterC - beforeC)).to.equal(5 * ONE);
  });

  it("NEG-T22-012 classic TOKEN_PROGRAM_ID against T22 mint fails closed", async () => {
    const authId = await issueRoot(aeon, {
      budget: 50 * ONE,
      maxPerTx: 25 * ONE,
    });
    const spent0 = (await aeon.fetchAuthority(authId)).spent.toNumber();
    try {
      await aeon.pay({
        amount: 1 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        payeeToken: fx.ataB,
        authorityId: authId,
        aeonMint: fx.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      });
      expect.fail("expected classic program id against T22 mint to fail");
    } catch (e: any) {
      if (e.message?.includes("expected classic")) throw e;
    }
    expect((await aeon.fetchAuthority(authId)).spent.toNumber()).to.equal(
      spent0
    );
  });

  it("NEG-T22-013 CategoryNotAllowed still enforced on Token-2022", async () => {
    const authId = await issueRoot(aeon, {
      budget: 50 * ONE,
      maxPerTx: 25 * ONE,
      categories: [cat("compute")],
    });
    await expectAeonError(
      aeon.pay({
        amount: 1 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        payeeToken: fx.ataB,
        authorityId: authId,
        category: cat("research"),
        aeonMint: fx.mint,
        tokenProgram: TP,
      }),
      "CategoryNotAllowed"
    );
  });
});
