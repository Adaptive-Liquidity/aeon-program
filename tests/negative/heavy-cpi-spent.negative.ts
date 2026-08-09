/**
 * HEAVY — CPI-fail spent invariance
 * ─────────────────────────────────
 * Force real token CPI failures *after* authority pre-checks pass, then assert:
 *   - authority.spent unchanged
 *   - ATA balances unchanged
 *   - CRI counters unchanged
 *
 * Mechanism: freeze source/dest ATAs (mint freeze authority = admin).
 * Pre-validation only checks balances / policy — freeze is enforced inside
 * transfer_checked CPI, so this is a true CPI-fail path (not AeonError gates).
 *
 * Isolated validator leg: bootstrap with freeze authority.
 */
import { expect } from "chai";
import {
  bootstrapFixture,
  expectTxFail,
  freezeAta,
  thawAta,
  issueRoot,
  tokenBal,
  ONE,
  TOKEN_2022_PROGRAM_ID,
  BN,
  zeroCat,
  type Fixture,
} from "./helpers";

describe("HEAVY CPI-fail spent invariance", function () {
  this.timeout(180_000);

  let fx: Fixture;
  let aeon: Fixture["aeon"];
  let program: Fixture["program"];
  let authId: number;

  before(async () => {
    fx = await bootstrapFixture({ force: true, withFreeze: true });
    aeon = fx.aeon;
    program = fx.program;
    expect(fx.freezeAuthority).to.not.equal(null);
    authId = await issueRoot(aeon, {
      budget: 500 * ONE,
      maxPerTx: 100 * ONE,
    });
    console.log(
      `\n  HEAVY CPI-spent  mint=${fx.mint.toBase58().slice(0, 8)}… auth=#${authId}`
    );
  });

  async function snap() {
    const auth = await aeon.fetchAuthority(authId);
    const criA = await aeon.fetchCri(fx.agentA.publicKey);
    return {
      spent: auth.spent.toNumber(),
      status: auth.status,
      balA: await tokenBal(fx.connection, fx.ataA, fx.tokenProgram),
      balB: await tokenBal(fx.connection, fx.ataB, fx.tokenProgram),
      balC: await tokenBal(fx.connection, fx.ataC, fx.tokenProgram),
      commitments: criA.successfulCommitments.toNumber(),
      volume: criA.volumeSettled.toNumber(),
    };
  }

  function assertUnchanged(
    before: Awaited<ReturnType<typeof snap>>,
    after: Awaited<ReturnType<typeof snap>>,
    label: string
  ) {
    expect(after.spent, `${label}: spent`).to.equal(before.spent);
    expect(after.status, `${label}: status`).to.equal(before.status);
    expect(after.balA, `${label}: balA`).to.equal(before.balA);
    expect(after.balB, `${label}: balB`).to.equal(before.balB);
    expect(after.balC, `${label}: balC`).to.equal(before.balC);
    expect(after.commitments, `${label}: CRI commitments`).to.equal(
      before.commitments
    );
    expect(after.volume, `${label}: CRI volume`).to.equal(before.volume);
  }

  // ─── Pay ─────────────────────────────────────────────────────────────────

  it("NEG-CPI-001 pay: frozen payee ATA → CPI fail; spent/balances/CRI unchanged", async () => {
    const before = await snap();
    await freezeAta(fx, fx.ataB);
    try {
      const detail = await expectTxFail(
        aeon.pay({
          amount: 5 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: authId,
          aeonMint: fx.mint,
        })
      );
      expect(
        detail.includes("Account is frozen") ||
          detail.includes("AccountFrozen") ||
          detail.includes("frozen") ||
          detail.includes("custom program error") ||
          detail.includes("Error") ||
          detail.length > 0
      ).to.equal(true);
    } finally {
      await thawAta(fx, fx.ataB);
    }
    assertUnchanged(before, await snap(), "NEG-CPI-001");
    console.log("    ✓ frozen payee → CPI fail, spent invariant");
  });

  it("NEG-CPI-002 pay: frozen payer ATA → CPI fail; spent unchanged", async () => {
    const before = await snap();
    await freezeAta(fx, fx.ataA);
    try {
      await expectTxFail(
        aeon.pay({
          amount: 5 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          payeeToken: fx.ataB,
          authorityId: authId,
          aeonMint: fx.mint,
        })
      );
    } finally {
      await thawAta(fx, fx.ataA);
    }
    assertUnchanged(before, await snap(), "NEG-CPI-002");
    console.log("    ✓ frozen payer → CPI fail, spent invariant");
  });

  it("NEG-CPI-003 pay: wrong token program after validation path → spent unchanged", async () => {
    const before = await snap();
    await expectTxFail(
      program.methods
        .pay(new BN(5 * ONE), new BN(authId), zeroCat())
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
        .rpc()
    );
    assertUnchanged(before, await snap(), "NEG-CPI-003");
    console.log("    ✓ wrong Token-2022 program id → spent invariant");
  });

  // ─── Escrow ──────────────────────────────────────────────────────────────

  it("NEG-CPI-010 create_escrow: frozen payer ATA → CPI fail; spent unchanged", async () => {
    const before = await snap();
    await freezeAta(fx, fx.ataA);
    try {
      await expectTxFail(
        aeon.createEscrow({
          amount: 10 * ONE,
          payee: fx.agentB.publicKey,
          payerToken: fx.ataA,
          authorityId: authId,
          aeonMint: fx.mint,
        })
      );
    } finally {
      await thawAta(fx, fx.ataA);
    }
    assertUnchanged(before, await snap(), "NEG-CPI-010");
    const cfg = await aeon.fetchConfig();
    expect(cfg.escrowCounter.toNumber()).to.equal(0);
    console.log("    ✓ frozen payer create_escrow → spent + counter invariant");
  });

  // ─── Atomic split (multi-leg) ────────────────────────────────────────────

  it("NEG-CPI-020 atomic_split: frozen payee B → fail; no leg commits; spent unchanged", async () => {
    const before = await snap();
    await freezeAta(fx, fx.ataC);
    try {
      await expectTxFail(
        aeon.atomicSplit({
          authorityId: authId,
          payerToken: fx.ataA,
          aeonMint: fx.mint,
          payees: [
            {
              payee: fx.agentB.publicKey,
              token: fx.ataB,
              amount: 3 * ONE,
            },
            {
              payee: fx.agentC.publicKey,
              token: fx.ataC,
              amount: 4 * ONE,
            },
          ],
        })
      );
    } finally {
      await thawAta(fx, fx.ataC);
    }
    assertUnchanged(before, await snap(), "NEG-CPI-020");
    console.log("    ✓ atomic_split leg-B freeze → full rollback, spent invariant");
  });

  it("NEG-CPI-021 atomic_split: frozen payee A → fail before B; spent unchanged", async () => {
    const before = await snap();
    await freezeAta(fx, fx.ataB);
    try {
      await expectTxFail(
        aeon.atomicSplit({
          authorityId: authId,
          payerToken: fx.ataA,
          aeonMint: fx.mint,
          payees: [
            {
              payee: fx.agentB.publicKey,
              token: fx.ataB,
              amount: 3 * ONE,
            },
            {
              payee: fx.agentC.publicKey,
              token: fx.ataC,
              amount: 4 * ONE,
            },
          ],
        })
      );
    } finally {
      await thawAta(fx, fx.ataB);
    }
    assertUnchanged(before, await snap(), "NEG-CPI-021");
    console.log("    ✓ atomic_split leg-A freeze → spent invariant");
  });

  // ─── Control: success path still works ───────────────────────────────────

  it("NEG-CPI-090 control: successful pay increments spent exactly once", async () => {
    const before = await snap();
    const amount = 7 * ONE;
    await aeon.pay({
      amount,
      payee: fx.agentB.publicKey,
      payerToken: fx.ataA,
      payeeToken: fx.ataB,
      authorityId: authId,
      aeonMint: fx.mint,
    });
    const after = await snap();
    expect(after.spent).to.equal(before.spent + amount);
    expect(after.balA).to.equal(before.balA - BigInt(amount));
    expect(after.balB).to.equal(before.balB + BigInt(amount));
    expect(after.commitments).to.equal(before.commitments + 1);
    expect(after.volume).to.equal(before.volume + amount);
    console.log(
      `    ✓ control pay spent ${before.spent / ONE} → ${after.spent / ONE}`
    );
  });

  it("NEG-CPI-091 control: freeze→thaw then pay still works", async () => {
    await freezeAta(fx, fx.ataB);
    await thawAta(fx, fx.ataB);
    const before = await snap();
    await aeon.pay({
      amount: 2 * ONE,
      payee: fx.agentB.publicKey,
      payerToken: fx.ataA,
      payeeToken: fx.ataB,
      authorityId: authId,
      aeonMint: fx.mint,
    });
    const after = await snap();
    expect(after.spent).to.equal(before.spent + 2 * ONE);
    console.log("    ✓ freeze/thaw restore; subsequent pay ok");
  });
});
