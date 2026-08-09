# AEON Product Surface — Handoff (post v0.1.0 cut)

**Date:** 2026-08-09  
**Release:** **v0.1.0**  
**Program ID:** `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn`  

Phases 0–5 and R1–R4 are complete. Pre-R6 cleanups are done. Stretch work is **R6**.

---

## Done checklist

- [x] Real program ID deployed (devnet)  
- [x] 16 ixs + SDK + examples  
- [x] HEAVY freeze + transfer-hook  
- [x] CASE_CATALOG (70 PASS + 1 ACCEPTED)  
- [x] Extended devnet demo  
- [x] Trident P2 focused fuzz  
- [x] OVERVIEW + QUICKSTART + SECURITY_MODEL  
- [x] Frozen client public API + examples  
- [x] CI on every push; fuzz nightly  
- [x] **Tag `v0.1.0` + CHANGELOG + release notes**  
- [x] **docs-site/index.html** updated to v0.1.0 product surface (no 3/13 stub claim)  
- [x] **CI Solana PATH fix** (export PATH in install step; documented in docs/CI.md)  
- [x] **Formal GitHub Release** for `v0.1.0`

Release notes: [`RELEASE_NOTES_v0.1.0.md`](./RELEASE_NOTES_v0.1.0.md) · [`CHANGELOG.md`](../CHANGELOG.md)

---

## Stretch (R6) — not blockers

| # | Task |
|---|------|
| 1 | Multi-signer pay path in Trident |
| 2 | Approach B transfer-hook remaining_accounts forward |
| 3 | Nightly fuzz regression seed archive |
| 4 | AEON-IQ read-only index notes |
| 5 | Nexus capability gate notes |
| 6 | On-chain Receipt instruction |
| 7 | Mainnet + formal audit |
| 8 | Optional `@aeon/agent-sdk` npm publish |

---

## Non-goals (permanent)

Yield / APY / emissions · relaxing fail-closed or depth/share invariants · replacing TS SDK as primary client

---

## Start command (stretch only)

```text
Pick one R6 stretch item from docs/PRODUCT_SURFACE_HANDOFF.md
(e.g. Approach B transfer-hook, multi-signer Trident, or integration notes).
Do not rotate program keys. Do not re-scaffold v0.1 surface.
```
