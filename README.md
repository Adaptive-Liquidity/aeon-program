# AEON Solana Program (Anchor 0.30.1)

Adaptive economic primitive for autonomous agents.

## Status

| Layer | Status |
|-------|--------|
| Program (16 ixs) | **Done** — localnet e2e 9/9 |
| TypeScript Agent SDK | **Done** |
| Agent economy demo | **Done** |
| P0+P1 negatives | **59/59 PASS** |
| HEAVY CPI-spent | **8/8 PASS** |
| P2 Trident fuzz | **PASS** — remaining_accounts / cascade (200×40, 0 panics) |
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
npm run test:negative      # P0 + P1 + HEAVY CPI (3 legs)
npm run test:heavy-cpi     # freeze-based CPI-fail spent suite only
npm run test:fuzz:p2       # P2 Trident remaining_accounts / cascade
npm run demo:economy
npm run build:sbf
npm run deploy:devnet
npm run smoke:devnet
```

## Next (tagged)

| # | Tag | Task |
|---|-----|------|
| 1 | **BUILD** | Extended devnet demo (escrow → org → dissolve) |
| 2 | **HEAVY** | Transfer-hook reject path (Token-2022) |
| 3 | **BUILD** | Soft-model docs cases (e.g. NEG-AUTH-011 dual-child overissue) |
