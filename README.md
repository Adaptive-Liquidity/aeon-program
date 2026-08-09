# AEON

**Agent economic control plane on Solana** — scoped authorities, fail-closed spend, escrow, and multi-agent orgs.

Not a yield product. Not emissions or APY. Enforcement-first primitives for autonomous agents.

| | |
|--|--|
| **Program** | Anchor 0.30.1 · 16 instructions |
| **Program ID** | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| **Client** | TypeScript Agent SDK → [`client/`](client/) · [`examples/`](client/examples/) |
| **Live** | [Devnet](docs/DEVNET.md) |
| **CI** | [docs/CI.md](docs/CI.md) · push/PR + nightly fuzz |

**Start here:** [docs/OVERVIEW.md](docs/OVERVIEW.md) · [docs/QUICKSTART.md](docs/QUICKSTART.md) · [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md)

---

## Status

| Layer | Status |
|-------|--------|
| Program (16 ixs) | **Done** — localnet e2e 9/9 |
| TypeScript Agent SDK | **Done** — frozen public API + examples |
| Agent economy demo | **Done** (localnet) |
| Extended devnet demo | **PASS** — escrow → org → dissolve |
| P0+P1 negatives | **70 PASS** + **1 ACCEPTED** soft |
| HEAVY CPI-spent (freeze) | **8/8 PASS** |
| HEAVY transfer-hook reject | **3/3 PASS** (Approach A) |
| P2 Trident fuzz | **PASS** — cascade / remaining_accounts |
| Soft-model NEG-AUTH-011 | **ACCEPTED** |
| Devnet deploy + smoke | **Live / PASS** |
| Product docs | **Done** (R1) |
| SDK examples + API freeze | **Done** (R2) |
| CI (push/PR + nightly fuzz) | **Done** (R3) |
| Tag `v0.1.0` | **Done** — see CHANGELOG |

Safety evidence: [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) · [docs/stoa/CASE_CATALOG.md](docs/stoa/CASE_CATALOG.md)

---

## What agents get

1. **Identity** — register agent + non-transferable CRI  
2. **Scoped power** — hierarchical authorities (budget, max-per-tx, categories, depth ≤ 3)  
3. **Fail-closed spend** — `pay` / `atomic_split` never mark `spent` if token CPI fails  
4. **Escrow** — conditional lock, release / cancel  
5. **Organizations** — share_bps conservation, complete dissolve, residual reclaim  
6. **Token-2022** — classic SPL and T22 via token interface  

---

## Devnet

| Field | Value |
|-------|--------|
| **Program ID** | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| **Config** | `JCbqqJxxCzYzfs1YK3FDD5ZvW66ZbMNq82u3gto1Pmok` |
| **Mint** | `CBVW7hZ14AUkZM2AUYs44J83GgzyY891ugknDSbQJpTz` |
| Cluster | `https://api.devnet.solana.com` |
| Explorer | [program](https://explorer.solana.com/address/8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn?cluster=devnet) |

---

## Quick commands

```bash
cd aeon-program
npm install

npm run build:sbf
npm run ci:prepare           # keypair + IDL assert for localnet
npm run demo:economy
npm run test:e2e
npm run test:sdk && npm run typecheck:sdk
npm run test:negative
npm run test:fuzz:p2         # heavy; nightly in CI

npm run smoke:devnet
npm run demo:devnet
```

---

## Documentation map

| Doc | Audience |
|-----|----------|
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | What AEON is / is not |
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Build + localnet pay |
| [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | Hard invariants + HEAVY status |
| [docs/DEVNET.md](docs/DEVNET.md) | Live deployment |
| [docs/CI.md](docs/CI.md) | GitHub Actions |
| [docs/stoa/](docs/stoa/) | CASE_CATALOG, CPI spent, Trident P2 |
| [client/README.md](client/README.md) | Frozen public API |
| [client/examples/](client/examples/) | Pay / escrow / org / revoke |
| [docs/PRODUCT_SURFACE_HANDOFF.md](docs/PRODUCT_SURFACE_HANDOFF.md) | Remaining release work |

---

## Release

**v0.1.0** — product surface. Changelog: [`CHANGELOG.md`](CHANGELOG.md) · notes: [`docs/RELEASE_NOTES_v0.1.0.md`](docs/RELEASE_NOTES_v0.1.0.md)

### Stretch (post v0.1)

| Tag | Task |
|-----|------|
| BUILD | Multi-signer pay path in Trident |
| PRODUCT | Approach B transfer-hook remaining_accounts |
| INTEGRATION | AEON-IQ / Nexus docs · optional npm SDK publish |

---

## Non-goals

- Fixed yields, APY, or emissions framing  
- Replacing the TypeScript SDK as the primary client  
- Relaxing fail-closed spent, depth, or org share invariants  

---

Adaptive Liquidity Labs (`@all4aeon`) · [Adaptive-Liquidity/aeon-program](https://github.com/Adaptive-Liquidity/aeon-program)
