# Negative E2E Case Catalog

Living checklist. Status: `TODO` | `IMPL` | `PASS` | `SKIP` | `ACCEPTED`.

Full strategy: [NEGATIVE_E2E_STRATEGIES.md](./NEGATIVE_E2E_STRATEGIES.md)  
CPI spent review: [CPI_SPENT_INVARIANCE.md](./CPI_SPENT_INVARIANCE.md)

**Runner:** `npm run test:negative` → **67 passing** (P0 45 + P1 classic 10 + P1 T22 4 + HEAVY CPI 8)

---

## AUTH

| ID | Pri | Expect | Status |
|----|-----|--------|--------|
| NEG-AUTH-001 | P0 | MaxDelegationDepth | **PASS** |
| NEG-AUTH-002 | P0 | EmptyCategoryIntersection | **PASS** |
| NEG-AUTH-003 | P0 | ChildBudgetExceedsParent | **PASS** |
| NEG-AUTH-004 | P0 | ParentNotActive | **PASS** |
| NEG-AUTH-005 | P0 | ParentRequired | **PASS** |
| NEG-AUTH-006 | P0 | Unauthorized (root+parent acct) | **PASS** |
| NEG-AUTH-007 | P0 | Unauthorized (cross-agent parent) | **PASS** |
| NEG-AUTH-008 | P0 | ParentIdMismatch | **PASS** |
| NEG-AUTH-009 | P1 | InvalidCategoryCount (>8) | **PASS** |
| NEG-AUTH-010 | P1 | unregistered agent issue fails | **PASS** |
| NEG-AUTH-011 | P2 | soft dual-child overissue | TODO |

## PAY

| ID | Pri | Expect | Status |
|----|-----|--------|--------|
| NEG-PAY-001..016 | P0 | spend gates | **PASS** (see prior) |
| NEG-PAY-004 | P0 | RecipientBlocked | **SKIP** (unsettable v0.1) |
| NEG-PAY-015 | P1 | min_reserve | **SKIP** (always 0) |

## ESC

| ID | Pri | Expect | Status |
|----|-----|--------|--------|
| NEG-ESC-001..010 | P0 | lifecycle | **PASS** |
| NEG-ESC-004 | P1 | EscrowExpired (slot-warp) | **PASS** |
| NEG-ESC-004b | P1 | TIMEOUT release after expiry | **PASS** |
| NEG-ESC-004c | P1 | non-payer cancel post-expiry | **PASS** |

## ORG / REV

| ID | Pri | Expect | Status |
|----|-----|--------|--------|
| NEG-ORG-001..011 | P0 | treasury/membership | **PASS** |
| NEG-ORG-010 | P1 | unregistered create_org | **PASS** |
| NEG-REV-001..003 | P0 | revoke | **PASS** |
| NEG-REV-004 | P1 | cascade non-writable | **PASS** |

## Token-2022

| ID | Pri | Expect | Status |
|----|-----|--------|--------|
| NEG-T22-001 | P1 | wrong program vs classic mint fails | **PASS** |
| NEG-T22-002 | P1 | foreign T22 mint InvalidMint | **PASS** |
| NEG-T22-003 | P1 | classic control pay | **PASS** |
| NEG-T22-010 | P1 | T22 pay success | **PASS** |
| NEG-T22-011 | P1 | T22 escrow create+release | **PASS** |
| NEG-T22-012 | P1 | classic program vs T22 mint fails | **PASS** |
| NEG-T22-013 | P1 | CategoryNotAllowed on T22 | **PASS** |

## HEAVY CPI-fail spent invariance

| ID | Pri | Expect | Status |
|----|-----|--------|--------|
| NEG-CPI-001 | HEAVY | freeze payee → pay CPI fail; spent/ATAs/CRI unchanged | **PASS** |
| NEG-CPI-002 | HEAVY | freeze payer → pay CPI fail; spent unchanged | **PASS** |
| NEG-CPI-003 | HEAVY | wrong token program; spent unchanged | **PASS** |
| NEG-CPI-010 | HEAVY | freeze payer create_escrow; spent + counter unchanged | **PASS** |
| NEG-CPI-020 | HEAVY | atomic_split leg-B freeze; full rollback | **PASS** |
| NEG-CPI-021 | HEAVY | atomic_split leg-A freeze; spent unchanged | **PASS** |
| NEG-CPI-090 | HEAVY | control pay increments spent once | **PASS** |
| NEG-CPI-091 | HEAVY | freeze/thaw then pay ok | **PASS** |

## Counts

| Status | Count |
|--------|-------|
| **PASS** | **67** |
| SKIP | 2 |
| TODO P2 | ~3 |

## Implementation notes

1. **Slot-warp:** `waitPastSlot` polls `getSlot('confirmed')` on solana-test-validator.
2. **Token-2022:** isolated validator leg with protocol mint as T22.
3. **CPI spent:** freeze-authority mint; real SPL freeze fails `transfer_checked` after AEON policy checks. See [CPI_SPENT_INVARIANCE.md](./CPI_SPENT_INVARIANCE.md).
