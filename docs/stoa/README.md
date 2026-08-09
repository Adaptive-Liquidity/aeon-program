# AEON Stoa

Structured argument space for protocol quality — what must fail, why, and how CI proves it.

| Document | Role |
|----------|------|
| [NEGATIVE_E2E_STRATEGIES.md](./NEGATIVE_E2E_STRATEGIES.md) | Research + advanced strategies (S1–S10), threat model, P0 catalog |
| [CASE_CATALOG.md](./CASE_CATALOG.md) | Living checklist of NEG-* cases and status |
| [TRIDENT_P2.md](./TRIDENT_P2.md) | P2 Trident remaining_accounts / cascade fuzz |
| [CPI_SPENT_INVARIANCE.md](./CPI_SPENT_INVARIANCE.md) | HEAVY CPI-fail spent review (freeze + transfer-hook) |

**Product entry (not stoa research):**

| Document | Role |
|----------|------|
| [../OVERVIEW.md](../OVERVIEW.md) | What the surface is / is not |
| [../QUICKSTART.md](../QUICKSTART.md) | Localnet pay path |
| [../SECURITY_MODEL.md](../SECURITY_MODEL.md) | Hard invariants + claim checklist |

## Doctrine

> Every failure mode that can lose money or mint privilege must be named, numbered, and forced to fail the same way in CI.

## Status

1. **DONE** negative harness + P0/P1 suites (`tests/negative/`)  
2. **DONE** `npm run test:negative` multi-leg runner  
3. **DONE** HEAVY freeze + transfer-hook fail-closed spent  
4. **DONE** P2 Trident remaining_accounts fuzz  
5. **DONE** soft-model NEG-AUTH-011 ACCEPTED  
6. **DONE** product docs (OVERVIEW / QUICKSTART / SECURITY_MODEL)  
7. Keep CASE_CATALOG status in sync with implementations  
