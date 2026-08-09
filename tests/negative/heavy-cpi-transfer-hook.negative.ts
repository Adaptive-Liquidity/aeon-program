/**
 * HEAVY — Token-2022 transfer-hook reject path (fail-closed spent)
 * ────────────────────────────────────────────────────────────────
 * Protocol mint is Token-2022 with TransferHook extension pointing at a
 * non-deployed program id. AEON CPI uses plain transfer_checked (no
 * remaining_accounts), so Token-2022 rejects the transfer after AEON policy
 * checks pass → true CPI-fail path, same oracle as freeze suite:
 *   - authority.spent unchanged
 *   - ATA balances unchanged
 *   - CRI counters unchanged
 *   - escrow_counter unchanged on failed create_escrow
 *
 * Approach A (docs): no AEON program change — hostility via mint extension.
 * Isolated validator leg (cannot share fixture with classic freeze mint).
 *
 * Catalog: NEG-CPI-030 / 031 / 032
 */
import { expect } from "chai";
import {
  bootstrapFixture,
  expectTxFail,
  issueRoot,
  tokenBal,
  ONE,
  TOKEN_2022_PROGRAM_ID,
  type Fixture,
} from "./helpers";

describe("HEAVY CPI transfer-hook reject path", function () {
  this.timeout(180_000);

  let fx: Fixture;
  let aeon: Fixture["aeon"];
  let authId: number;

  before(async () => {
    fx = await bootstrapFixture({ force: true, withTransferHook: true });
    aeon = fx.aeon;
    expect(fx.tokenProgram.equals(TOKEN_2022_PROGRAM_ID)).to.equal(true);
    expect(fx.transferHookProgramId).to.not.equal(null);
    authId = await issueRoot(aeon, {
      budget: 500 * ONE,
      maxPerTx: 100 * ONE,
    });
    console.log(
      `\n  HEAVY transfer-hook  mint=${fx.mint.toBase58().slice(0, 8)}… ` +
        `hook=${fx.transferHookProgramId!.toBase58().slice(0, 8)}… auth=#${authId}`
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

  function expectHookishFail(detail: string, label: string) {
    // Token-2022 may surface missing accounts, hook errors, or generic ProgramFailedToComplete.
    // We only require a real failure — not an AEON policy gate — and fail-closed spent.
    const lower = detail.toLowerCase();
    const looksLikeAeonGate =
      detail.includes("Error Code: InsufficientBudget") ||
      detail.includes("Error Code: ExceedsMaxPerTx") ||
      detail.includes("Error Code: CategoryNotAllowed") ||
      detail.includes("Error Code: AuthorityNotActive");
    expect(looksLikeAeonGate, `${label}: should not be AEON policy gate`).to
      .equal(false);
    expect(detail.length, `${label}: non-empty error`).to.be.greaterThan(0);
    // soft signal that this is token/program CPI territory
    const tokenish =
      lower.includes("transfer") ||
      lower.includes("hook") ||
      lower.includes("account") ||
      lower.includes("custom program error") ||
      lower.includes("program failed") ||
      lower.includes("instruction") ||
      detail.includes("Token") ||
      detail.includes("Error");
    expect(tokenish, `${label}: error looks like runtime/CPI fail`).to.equal(
      true
    );
  }

  it("NEG-CPI-030 pay: transfer-hook mint → CPI fail; spent/balances/CRI unchanged", async () => {
    const before = await snap();
    const detail = await expectTxFail(
      aeon.pay({
        amount: 5 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        payeeToken: fx.ataB,
        authorityId: authId,
        aeonMint: fx.mint,
        tokenProgram: fx.tokenProgram,
      })
    );
    expectHookishFail(detail, "NEG-CPI-030");
    const after = await snap();
    assertUnchanged(before, after, "NEG-CPI-030");
  });

  it("NEG-CPI-031 create_escrow: transfer-hook mint → spent + escrow_counter unchanged", async () => {
    const before = await snap();
    const cfgBefore = await aeon.fetchConfig();
    const counterBefore = cfgBefore.escrowCounter.toNumber();

    const detail = await expectTxFail(
      aeon.createEscrow({
        amount: 8 * ONE,
        payee: fx.agentB.publicKey,
        payerToken: fx.ataA,
        authorityId: authId,
        aeonMint: fx.mint,
        tokenProgram: fx.tokenProgram,
      })
    );
    expectHookishFail(detail, "NEG-CPI-031");

    const after = await snap();
    assertUnchanged(before, after, "NEG-CPI-031");
    const cfgAfter = await aeon.fetchConfig();
    expect(cfgAfter.escrowCounter.toNumber(), "escrow_counter").to.equal(
      counterBefore
    );
  });

  it("NEG-CPI-032 atomic_split: transfer-hook mint → full rollback; spent unchanged", async () => {
    const before = await snap();
    const detail = await expectTxFail(
      aeon.atomicSplit({
        payees: [
          {
            payee: fx.agentB.publicKey,
            token: fx.ataB,
            amount: 3 * ONE,
          },
          {
            payee: fx.agentC.publicKey,
            token: fx.ataC,
            amount: 2 * ONE,
          },
        ],
        payerToken: fx.ataA,
        authorityId: authId,
        aeonMint: fx.mint,
        tokenProgram: fx.tokenProgram,
      })
    );
    expectHookishFail(detail, "NEG-CPI-032");
    const after = await snap();
    assertUnchanged(before, after, "NEG-CPI-032");
  });
});
