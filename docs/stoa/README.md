# AEON Stoa

Structured argument space for protocol quality — what must fail, why, and how CI proves it.

| Document | Role |
|----------|------|
| [NEGATIVE_E2E_STRATEGIES.md](./NEGATIVE_E2E_STRATEGIES.md) | Research + advanced strategies (S1–S10), threat model, P0 catalog |
| [CASE_CATALOG.md](./CASE_CATALOG.md) | Living checklist of NEG-* cases and status |

## Doctrine

> Every failure mode that can lose money or mint privilege must be named, numbered, and forced to fail the same way in CI.

## Next

1. **BUILD** negative harness + P0 suites (`tests/negative/`)  
2. Wire `npm run test:negative`  
3. Keep CASE_CATALOG status in sync with implementations  
