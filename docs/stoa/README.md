# AEON Stoa

Structured argument space for protocol quality — what must fail, why, and how CI proves it.

| Document | Role |
|----------|------|
| [NEGATIVE_E2E_STRATEGIES.md](./NEGATIVE_E2E_STRATEGIES.md) | Research + advanced strategies (S1–S10), threat model, P0 catalog |
| [CASE_CATALOG.md](./CASE_CATALOG.md) | Living checklist of NEG-* cases and status |
| [TRIDENT_P2.md](./TRIDENT_P2.md) | P2 Trident remaining_accounts / cascade fuzz |
| [CPI_SPENT_INVARIANCE.md](./CPI_SPENT_INVARIANCE.md) | HEAVY CPI-fail spent review |


## Doctrine

> Every failure mode that can lose money or mint privilege must be named, numbered, and forced to fail the same way in CI.

## Status

1. **DONE** — negative harness + P0/P1 suites (`tests/negative/`) → `npm run test:negative` (67 PASS)
2. **DONE** — HEAVY CPI spent invariance → `npm run test:heavy-cpi`
3. **DONE** — P2 Trident remaining_accounts / cascade → `npm run test:fuzz:p2`
4. Keep CASE_CATALOG status in sync with implementations
