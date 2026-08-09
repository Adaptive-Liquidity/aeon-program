# AEON v0.1.0 — Release Notes

**Date:** 2026-08-09  
**Tag:** `v0.1.0`  
**Codename:** Product surface  

AEON is an **agent economic control plane** on Solana — not a yield product.

---

## Headline

Ship a complete, agent-consumable economic surface:

- **16 on-chain instructions** (identity, hierarchical authorities, fail-closed spend, escrow, orgs)  
- **TypeScript Agent SDK** with frozen public API + examples  
- **Safety proof**: 70 negative PASS + HEAVY freeze/hook + Trident cascade fuzz  
- **Live devnet** with smoke + escrow→org→dissolve demo  
- **Product docs** + **CI** on every push (fuzz nightly)  

Full changelog: [`CHANGELOG.md`](../CHANGELOG.md)

---

## Coordinates

| | |
|--|--|
| Program ID | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| Devnet config | `JCbqqJxxCzYzfs1YK3FDD5ZvW66ZbMNq82u3gto1Pmok` |
| Devnet mint | `CBVW7hZ14AUkZM2AUYs44J83GgzyY891ugknDSbQJpTz` |
| Explorer | [program on devnet](https://explorer.solana.com/address/8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn?cluster=devnet) |
| Client | in-repo `client/` (`AeonClient`) |

---

## What to try

```bash
git checkout v0.1.0
npm ci
npm run build:sbf
npm run demo:economy          # localnet narrative
npm run test:sdk && npm run typecheck:sdk
npm run test:e2e
# optional: npm run test:negative
# live:     npm run smoke:devnet && npm run demo:devnet
```

Read: [QUICKSTART](./QUICKSTART.md) · [OVERVIEW](./OVERVIEW.md) · [SECURITY_MODEL](./SECURITY_MODEL.md)

---

## Safety snapshot

| Suite | Result |
|-------|--------|
| Negative e2e | **70 PASS** + **1 ACCEPTED** (NEG-AUTH-011) + 2 SKIP |
| HEAVY freeze CPI-fail spent | **8/8** |
| HEAVY T22 transfer-hook deny (Approach A) | **3/3** |
| Trident P2 remaining_accounts / cascade | **PASS** (200×40, 0 panics) |
| Open Critical / High (CPI spent review) | **None** |

Hard invariants: spent-after-CPI · depth/parent · cascade · org share conservation · mint binding.

---

## Not in v0.1.0

- Mainnet deploy / formal external audit  
- Receipt instruction (struct only)  
- Approach B transfer-hook remaining_accounts forwarding  
- Multi-signer Trident pay paths  
- npm-published `@aeon/agent-sdk` package  
- Yield / APY / emissions framing (permanent non-goal)

---

## Annotated tag message (copy for `git tag -a`)

```
AEON v0.1.0 — product surface

Agent economic control plane on Solana (Anchor 0.30.1).

Program: 8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn (devnet live)
- 16 instructions: authority hierarchy, fail-closed pay/escrow/split, org lifecycle
- Token-2022 + classic SPL via token interface
- TypeScript Agent SDK (path import) + examples
- Safety: 70 neg PASS + 1 ACCEPTED, HEAVY freeze 8/8, hook 3/3, Trident P2 PASS
- Docs: OVERVIEW, QUICKSTART, SECURITY_MODEL; CI push/PR + nightly fuzz

Not a yield product. See CHANGELOG.md and docs/RELEASE_NOTES_v0.1.0.md.
```

---

Adaptive Liquidity Labs (`@all4aeon`)
