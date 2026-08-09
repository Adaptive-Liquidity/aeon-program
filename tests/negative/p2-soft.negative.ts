/**
 * P2 soft-model documentation tests
 * ─────────────────────────────────
 * These assert product behavior that is intentional in v0.1, not hard rejects.
 * Tag: MUST_SUCCEED_DOCUMENTED | ACCEPTED
 *
 * Catalog: NEG-AUTH-011
 * Spec: docs/stoa/NEGATIVE_E2E_STRATEGIES.md §S7 soft_overissue
 */
import { expect } from "chai";
import {
  getFixture,
  expectAeonError,
  issueRoot,
  issueChild,
  ONE,
  type Fixture,
} from "./helpers";

describe("P2 soft-model documentation", function () {
  this.timeout(120_000);

  let fx: Fixture;
  let aeon: Fixture["aeon"];

  before(async () => {
    console.log("\n  ── P2 soft-model suite: bootstrap ──");
    fx = await getFixture();
    aeon = fx.aeon;
    console.log(`  mint=${fx.mint.toBase58().slice(0, 8)}… agents ready\n`);
  });

  /**
   * NEG-AUTH-011 soft dual-child overissue
   *
   * Product rule (v0.1): issue_authority checks budget <= parent.remaining
   * per call only; parent.spent is not reserved for children. Two siblings
   * may each take budget == parent.remaining; sum of child budgets may
   * exceed parent.budget.
   */
  it("NEG-AUTH-011 soft_overissue dual-child each budget=parent.remaining [ACCEPTED]", async () => {
    const PARENT_BUDGET = 100 * ONE;

    const parentId = await issueRoot(aeon, {
      budget: PARENT_BUDGET,
      maxPerTx: PARENT_BUDGET,
    });
    const parentBefore = await aeon.fetchAuthority(parentId);
    const remaining =
      Number(parentBefore.budget) - Number(parentBefore.spent);
    expect(remaining).to.equal(PARENT_BUDGET);
    expect(Number(parentBefore.spent)).to.equal(0);

    // Child A: full remaining — must succeed
    const childA = await issueChild(aeon, parentId, {
      budget: remaining,
      maxPerTx: remaining,
    });
    const a = await aeon.fetchAuthority(childA);
    expect(Number(a.budget)).to.equal(remaining);
    expect(Number(a.parentId)).to.equal(parentId);
    expect(a.depth).to.equal(1);

    // Soft-model oracle: parent.spent unchanged after issue(child)
    const parentMid = await aeon.fetchAuthority(parentId);
    expect(Number(parentMid.spent)).to.equal(0);
    expect(Number(parentMid.budget)).to.equal(PARENT_BUDGET);

    // Child B: again budget = same parent.remaining — must succeed (overissue)
    const childB = await issueChild(aeon, parentId, {
      budget: remaining,
      maxPerTx: remaining,
    });
    const b = await aeon.fetchAuthority(childB);
    expect(Number(b.budget)).to.equal(remaining);
    expect(Number(b.parentId)).to.equal(parentId);
    expect(b.depth).to.equal(1);

    // Documented overissue: childA + childB budgets > parent.budget
    expect(Number(a.budget) + Number(b.budget)).to.equal(2 * PARENT_BUDGET);
    expect(Number(a.budget) + Number(b.budget)).to.be.greaterThan(
      Number(parentMid.budget)
    );

    // Parent still unreserved
    const parentAfter = await aeon.fetchAuthority(parentId);
    expect(Number(parentAfter.spent)).to.equal(0);

    // Hard edge still holds: R+1 fails (NEG-AUTH-003 regression guard)
    await expectAeonError(
      aeon.issueAuthority({
        budget: remaining + 1,
        maxPerTx: remaining,
        parentId,
      }),
      "ChildBudgetExceedsParent"
    );

    console.log(
      `    soft overissue documented: parent=#${parentId} children=#${childA}+#${childB} ` +
        `each budget=${remaining / ONE} (sum ${
          (2 * remaining) / ONE
        } > parent ${PARENT_BUDGET / ONE})`
    );
  });
});
