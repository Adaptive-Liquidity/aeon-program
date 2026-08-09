# CPI Spent Invariance — HEAVY Closeout

**Status:** **CLOSED** (freeze suite + transfer-hook suite)  
**Date:** 2026-08-09  
**Program:** AEON (`8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn`)

---

## 1. Question

If token CPI fails *after* AEON policy validation, does `authority.spent` (or related counters) still move?

**Doctrine:** validate → CPI → commit spent. Fail closed.

---

## 2. Order review (source)

| Instruction | Order | Result |
|-------------|-------|--------|
| `pay` | policy → `transfer_checked` → write spent | **correct** |
| `create_escrow` | policy → transfer to vault → spent + counter | **correct** |
| `atomic_split` | both legs CPI → then spent/CRI | **correct** |

---

## 3. Forced CPI-fail mechanisms

### A. Freeze (classic mint)

Mint freeze authority = admin. Freeze source/dest ATA.  
Pre-validation does **not** check freeze; Token Program rejects inside CPI.

**Suite:** `tests/negative/heavy-cpi-spent.negative.ts`  
**Runner:** `npm run test:heavy-cpi` (also leg 3 of `npm run test:negative`)

| ID | Result |
|----|--------|
| NEG-CPI-001..003, 010, 020, 021, 090, 091 | **8/8 PASS** |

### B. TransferHook mint (Token-2022)

Protocol mint is Token-2022 with `TransferHook` extension pointing at a non-deployed program id.  
AEON CPI uses plain `transfer_checked` (no remaining_accounts) → Token-2022 rejects transfer after AEON policy checks.

**Suite:** `tests/negative/heavy-cpi-transfer-hook.negative.ts`  
**Runner:** `npm run test:heavy-hook` (also leg 4 of `npm run test:negative`)  
**Helper:** `createMintWithTransferHook` in `tests/negative/helpers.ts`

| ID | Setup | Assert |
|----|--------|--------|
| NEG-CPI-030 | pay | CPI fail; spent/ATAs/CRI unchanged |
| NEG-CPI-031 | create_escrow | spent + `escrow_counter` unchanged |
| NEG-CPI-032 | atomic_split 2-leg | full rollback; spent unchanged |

**3/3 PASS**

This is **Approach A** (no AEON program change). Full hook Execute support would need remaining_accounts forwarding (Approach B — product stretch).

---

## 4. Oracle (shared)

For every forced fail:

- `authority.spent` unchanged  
- ATA balances unchanged  
- CRI commitments + volume unchanged  
- On failed create_escrow: `escrow_counter` unchanged  

---

## 5. Residual / out of scope

- Approach B: deploy always-reject hook + AEON forwards remaining_accounts so Execute runs  
- Cross-program re-entrancy (Token Program is not re-entering AEON)  
- Client SDK retries double-spend (wallet/user layer)

---

## 6. Run

```bash
npm run test:heavy-cpi    # freeze leg only
npm run test:heavy-hook   # transfer-hook leg only
npm run test:negative     # all legs including both HEAVY suites
```

**No program code change required** for this closeout — order was already correct. Tests close the HEAVY items.
