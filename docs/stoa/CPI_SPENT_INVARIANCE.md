# HEAVY: CPI-fail spent invariance

**Status:** Reviewed + tested (2026-08-09)  
**Invariant:** `authority.spent` (and CRI volume / commitments) increase **if and only if** the token transfer CPI(s) succeed.

---

## 1. Threat model

| Concern | Real on Solana? | Notes |
|---------|-----------------|--------|
| Write `spent` then CPI fails, spent sticks | **No** (runtime) | Whole tx atomic — failed ix rolls back all account writes |
| Write `spent` then CPI fails, confusing simulation/logs | Yes (ops) | Developers may misread partial sim; post-transfer commit is clearer |
| Multi-leg: transfer A ok, transfer B fails, spent still applied | **No** if spent after both; **Yes** if spent between legs | AEON commits spent **after** all legs |
| Pre-check only (empty ATA) mistaken for CPI-fail test | Test gap | Pre-checks return `InsufficientBudget` *before* CPI |

Defense in depth: **validate → transfer CPI(s) → commit spent / CRI**.

---

## 2. Code map (post-CPI commit)

| Instruction | File | Order |
|-------------|------|--------|
| `pay` | `instructions/pay.rs` | policy + balance checks → `transfer_checked` → `authority.spent` + CRI |
| `create_escrow` | `instructions/create_escrow.rs` | same → transfer to vault → spent → escrow fields |
| `atomic_split` | `instructions/atomic_split.rs` | policy → CPI A → optional CPI B → **then** spent + CRI |

Pattern (all three):

```text
commit_spent = Some(new_spent)   // not written yet
transfer_checked(...)?;          // may fail
authority.spent = new_spent;     // only on success path
```

`commit_spent` is a local `Option` — never persisted until after `?` on CPI.

---

## 3. Solana atomicity (why runtime is safe even if order flipped)

A single instruction that mutates `authority` then CPIs into Token Program:

1. If CPI returns `Err`, the **instruction** fails.
2. The runtime discards **all** account modifications from that transaction.
3. Therefore pre-CPI `spent` writes would also roll back.

Post-CPI commit remains required for:

- Readable fail-closed design review
- Correct multi-leg ordering (`atomic_split`)
- Avoiding “spent increased” in logs for failed sims that only show partial account meta

---

## 4. How tests force a *real* CPI failure

Pre-validation does **not** check freeze state. SPL `transfer_checked` does.

| Case ID | Force | Assert |
|---------|-------|--------|
| NEG-CPI-001 | Freeze **payee** ATA | pay fails; spent/ATAs/CRI unchanged |
| NEG-CPI-002 | Freeze **payer** ATA | pay fails; spent unchanged |
| NEG-CPI-003 | Wrong `token_program` (Token-2022 on classic mint) | fail; spent unchanged |
| NEG-CPI-010 | Freeze payer on `create_escrow` | fail; spent + `escrow_counter` unchanged |
| NEG-CPI-020 | Freeze payee **B** on 2-leg `atomic_split` | fail; **neither** leg balances change; spent unchanged |
| NEG-CPI-021 | Freeze payee **A** | fail; spent unchanged |
| NEG-CPI-090/091 | Control success after thaw | spent += amount exactly |

Bootstrap: `bootstrapFixture({ force: true, withFreeze: true })` — mint freeze authority = admin.

---

## 5. Review verdict

| Check | Verdict |
|-------|---------|
| `pay` spent after CPI | **PASS** |
| `create_escrow` spent after CPI | **PASS** |
| `atomic_split` spent after **all** legs | **PASS** |
| CRI only on success path | **PASS** |
| No intermediate spent between split legs | **PASS** |
| Forced CPI-fail e2e | **PASS** (`tests/negative/heavy-cpi-spent.negative.ts`) |

**No program code change required** for this closeout — order was already correct. Tests + this memo close the HEAVY item.

---

## 6. Residual / out of scope

- Token-2022 **transfer hooks** that reject mid-CPI (similar class; freeze is sufficient proxy)
- Cross-program re-entrancy (Token Program is not re-entering AEON)
- Client SDK retries double-spend (wallet/user layer)

---

## 7. Run

```bash
# isolated leg (own validator + freeze mint)
# wired into npm run test:negative as leg 3, or:
# Anchor.toml test glob → tests/negative/heavy-cpi-spent.negative.ts
npm run test:negative
```
