# AEON Solana Program (Anchor 0.30.1)

Adaptive economic primitive for autonomous agents.

## Status

| Layer | Status |
|-------|--------|
| Program (16 ixs) | **Done** — localnet e2e 9/9 |
| TypeScript Agent SDK | **Done** |
| Agent economy demo | **Done** (localnet) |
| Extended devnet demo | **PASS** — escrow → org → dissolve |
| P0+P1 negatives | **59/59 PASS** |
| HEAVY CPI-spent (freeze) | **8/8 PASS** |
| HEAVY transfer-hook reject | **3/3 PASS** |
| P2 Trident fuzz | **PASS** — remaining_accounts / cascade (200×40, 0 panics) |
| Soft-model NEG-AUTH-011 | **ACCEPTED** (documented dual-child overissue) |
| Devnet deploy | **Live** |
| Devnet smoke | **PASS** |

## Devnet

| Field | Value |
|-------|--------|
| **Program ID** | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| **Config** | `JCbqqJxxCzYzfs1YK3FDD5ZvW66ZbMNq82u3gto1Pmok` |
| **Mint** | `CBVW7hZ14AUkZM2AUYs44J83GgzyY891ugknDSbQJpTz` |
| Cluster | `https://api.devnet.solana.com` |
| Explorer | [program](https://explorer.solana.com/address/8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn?cluster=devnet) |

Docs: [`docs/DEVNET.md`](docs/DEVNET.md) · CPI review: [`docs/stoa/CPI_SPENT_INVARIANCE.md`](docs/stoa/CPI_SPENT_INVARIANCE.md) · P2 fuzz: [`docs/stoa/TRIDENT_P2.md`](docs/stoa/TRIDENT_P2.md)

## Commands

```bash
cd aeon-program
npm run test:e2e
npm run test:negative      # P0+P1+soft + T22 + HEAVY freeze + HEAVY hook
npm run test:heavy-cpi     # freeze-based CPI-fail spent suite only
npm run test:heavy-hook    # Token-2022 transfer-hook reject path only
npm run test:fuzz:p2       # P2 Trident remaining_accounts / cascade
npm run demo:economy       # localnet narrative demo
npm run demo:devnet        # live escrow → org → dissolve
npm run build:sbf
npm run deploy:devnet
npm run smoke:devnet
```

## Next (optional stretch)

| # | Tag | Task |
|---|-----|------|
| 1 | **BUILD** | Multi-signer pay path in Trident (single-payer SVM limit today) |
| 2 | **PRODUCT** | Approach B: AEON forwards remaining_accounts for real hook Execute |
| 3 | **BUILD** | Nightly CI for `test:negative` + fuzz regression seeds |
