# AEON Product Surface — Handoff (post v0.2.0 cut)

**Date:** 2026-08-25  
**Release:** **v0.2.0**  
**Program ID:** `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm`

v0.1 phases 0–5 and R1–R4 are complete. v0.2 (receipts, bonds, pause, expiry) is implemented,
smoke-tested on devnet, and **live under the new program ID**. Trident fuzz covers the v0.1
surface only (pre-v0.2 ABI).

---

## Done checklist

### v0.1 surface
- [x] Real program ID deployed (devnet)
- [x] SDK + examples · HEAVY freeze + transfer-hook
- [x] CASE_CATALOG (70 PASS + 1 ACCEPTED) · Trident P2 fuzz
- [x] Product docs (OVERVIEW / QUICKSTART / SECURITY_MODEL) · frozen client API
- [x] CI on every push; fuzz nightly · Tag `v0.1.0` + formal GitHub Release

### v0.2 surface
- [x] 4 new instructions: `create_receipt`, `expire_authority`, `set_paused`, `slash_bond` (20 total)
- [x] `AuthorityBond` account + bond vault · CRI receipt chain fields
- [x] IDL + TypeScript SDK updated (`createReceipt`, `expireAuthority`, `setPaused`, `slashBond`, `bondAmount`)
- [x] Fresh program ID deployed to devnet (v0.1 ID abandoned — upgrade wallet lost)
- [x] v0.2 smoke tests PASS (receipt chain, pause gate, bond issue/slash)
- [x] Negative e2e 68+ PASS · HEAVY CPI 8/8 · HEAVY hook 3/3 · fuzz exit 0
- [x] README + docs-site refreshed to the v0.2 product story

---

## Open items

| # | Task | Priority |
|---|------|----------|
| 1 | NEG-* catalog entries for the four v0.2 instructions (~21 cases; see CASE_CATALOG v0.2 section) | **High** |
| 2 | Bond vault ATA initialization fix (`docs/PHASE2_BOND_VAULT_FIX.md`) — callers must currently pre-create the vault ATA | **High** |
| 3 | Upgrade Trident harness to v0.2 `issue_authority` ABI + flows for receipt/pause/expiry/slash | **High** |
| 4 | Push branch + push `v0.2.0` tag + formal GitHub Release | Medium |
| 5 | Multi-signer pay path in Trident fuzz | Stretch |
| 6 | Approach B transfer-hook remaining_accounts forward | Stretch |
| 7 | Nightly fuzz regression seed archive | Stretch |
| 8 | AEON-IQ read-only index notes · Nexus capability gate notes | Stretch |
| 9 | Optional `@aeon/agent-sdk` npm publish · Mainnet + formal audit | Stretch |

---

## Non-goals (permanent)

Yield / APY / emissions · relaxing fail-closed or depth/share invariants · replacing TS SDK as primary client

---

## Start command (open items only)

```text
Pick item 1 or 2 from docs/PRODUCT_SURFACE_HANDOFF.md.
Do not rotate program keys. Do not re-scaffold the v0.2 surface.
```
