# AEON v0.2 — Phase-by-Phase Build Plan

**Goal:** Ship a complete, tested, documented v0.2 release (20 instructions).
**Last updated:** 2026-08-20
**Owner:** Ollama (Open WebUI) + Antigravity/Gemini (IDE) — see TEAM/STATUS.md

---

## Current state summary

- ✅ Rust program: all 20 instructions implemented (4 new v0.2 done).
- ✅ State/constants/errors/events: v0.2 additions present.
- 🔴 **IDL stale** (16 ixs only) — must regen.
- 🔴 **TS SDK stale** — missing 4 methods + bond param + new PDAs/constants/types.
- 🟠 **Bond vault not initialized** in `issue_authority`.
- 🟠 **No tests** for the 4 new instructions.
- 🟡 Docs stale (OVERVIEW/CHANGELOG/CASE_CATALOG).

---

## Phase 0 — Verify & baseline (do first, ~30 min)

- [ ] Run `npm run build:sbf` to confirm the Rust program compiles with v0.2 changes.
- [ ] Run existing suites to confirm no regression: `npm run test:negative`, `test:heavy-cpi`, `test:heavy-hook`, `test:fuzz:p2`.
- [ ] Verify devnet counter state (`solana account 8i5E3R2... --url devnet`) — confirm `authority_counter`/`receipt_counter` so we know if `Authority`/`Cri` layout changes need migration.
- [ ] Confirm `Cri.created_slot` is `u64` (live file says `u64` — resolved).

**Exit:** green baseline, known devnet counters.

---

## Phase 1 — Regenerate IDL (~15 min)

- [ ] Run `anchor build` (or `build:sbf` + IDL regen) to produce a fresh `client/idl/aeon.json`.
- [ ] Verify the IDL now contains 20 instructions + `AuthorityBond` account + new fields (`bond_amount`, `last_receipt_hash`, `receipt_count`).
- [ ] Confirm `address` still equals `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm`.

**Exit:** IDL matches `lib.rs` exactly.

---

## Phase 2 — Fix bond vault creation (program, ~45 min)

**Problem:** `issue_authority` transfers tokens into `bond_vault` (remaining_accounts[1])
but never initializes that token account as owned by the bond PDA.

- [ ] In `issue_authority.rs`, when `bond_amount > 0`, initialize the bond vault as an
  associated token account (or a PDA-owned token account) owned by the `AuthorityBond` PDA.
- [ ] Decide: ATA (owner = bond PDA) vs. PDA-derived vault. Recommend ATA for simplicity.
- [ ] Ensure the CPI `agent_vault → bond_vault` has a valid destination owner.
- [ ] Re-verify `slash_bond` reads the same vault (owner == bond PDA) — currently it
  constrains `bond_vault.owner == bond.key()`, which is correct **only if** the vault
  is actually owned by the bond PDA.

**Exit:** bond path is end-to-end coherent (issue → lock → slash → destination).

---

## Phase 3 — Sync TypeScript SDK (~60 min)

- [ ] `client/constants.ts`: add `RECEIPT_TYPE` (PAY=0, ATOMIC_SPLIT=1), `BOND_STATUS`
  (ACTIVE=0, SLASHED=1), `SEEDS.AUTHORITY_BOND`, `SEEDS.ORACLE_ENTRY`.
- [ ] `client/pdas.ts`: add `authorityBondPda`, `oracleEntryPda` (+ `pdas.*` entries).
- [ ] `client/types.ts`: add `bondAmount?` to `IssueAuthorityParams`; add
  `CreateReceiptParams`, `ExpireAuthorityParams`, `SlashBondParams`; add
  `AuthorityBondAccount`, `ReceiptAccount`; add `lastReceiptHash`/`receiptCount` to
  `CriAccount`; add `bondAmount` to `AuthorityAccount`.
- [ ] `client/aeon.ts`: add methods `createReceipt`, `expireAuthority`, `setPaused`,
  `slashBond`; update `issueAuthority` to pass `bondAmount` (9th arg); add
  `fetchReceipt`, `fetchAuthorityBond`, `receiptAddress`, `authorityBondAddress`.
- [ ] `client/index.ts`: export new methods/types/constants (frozen surface — additive only).
- [ ] `client/README.md`: document new methods + params.

**Exit:** `npm run typecheck:sdk` passes; SDK covers all 20 instructions.

---

## Phase 4 — Defensive program cleanups (~30 min)

- [x] `register_agent.rs`: explicitly set `cri.last_receipt_hash = [0u8; 32]` and
  `cri.receipt_count = 0` (defensive; currently relies on zero-init).
- [x] `slash_bond.rs`: add a dedicated error `BondNotActive` (or reuse cleanly) instead
  of overloading `AuthorityNotSlashed`; clarify the `bond` account constraint.
- [x] `issue_authority.rs`: replace the fragile `try_deserialize` fallback with a clean
  `init`-style AuthorityBond write (or a proper `#[account(init)]` if feasible).
- [x] Confirm `create_receipt` uses `solana_program::hash::Hasher::default()` compiles
  under solana-program 1.18.10.

**Exit:** no `unwrap_or`/`try_deserialize` hacks; clean error semantics.

---

## Phase 5 — Tests for v0.2 (~90 min)

Add to `tests/negative/` (reuse `helpers.ts`):

- [ ] **NEG-RCPT-001..005** — receipt: empty payload, >1024 payload, id mismatch,
  chain mismatch (tampered prev), paused.
- [ ] **NEG-CFG-001..005** — pause: non-admin set_paused, paused blocks pay/issue/register/receipt.
- [ ] **NEG-AUTH-012..016** — expiry: not-yet-expired, no-expiry (0), non-owner, already-expired, child orphan safety.
- [ ] **NEG-BOND-001..005** — bond: zero bond slash, non-owner slash, double slash, insufficient bond, wrong destination mint.
- [ ] **NEG-MIG-001..003** — migration (only if devnet counters > 0): old Authority/Cri layout reads.

**Exit:** new suites green; existing 87+ tests still green.

---

## Phase 6 — Docs & release (~30 min)

- [ ] `docs/OVERVIEW.md`: instruction table 16 → 20; add receipt/bond/expiry/pause rows.
- [ ] `CHANGELOG.md`: add `[0.2.0]` section.
- [ ] `docs/stoa/CASE_CATALOG.md`: add new NEG-* IDs.
- [ ] `docs/SECURITY_MODEL.md`: add H6 (receipt chain) + H7 (bond fail-closed) invariants.
- [ ] `docs/FINAL_ARCHITECTURE.md` (this doc) kept in sync.
- [ ] Tag `v0.2.0` + release notes.

**Exit:** docs match code; release cut ready.

---

## Phase 7 — Devnet deploy & smoke (~30 min)

- [ ] `npm run build:sbf` + `npm run deploy:devnet`.
- [ ] Smoke: receipt create → chain; set_paused → pay blocked; issue with bond → slash.
- [ ] Update `docs/DEVNET.md` with new program data length + any new accounts.

**Exit:** v0.2 live on devnet, smoke artifacts committed.

---

## Dependency order

```
Phase 0 (baseline) → Phase 1 (IDL) → Phase 2 (bond vault) → Phase 3 (SDK)
                  → Phase 4 (cleanups) → Phase 5 (tests) → Phase 6 (docs) → Phase 7 (deploy)
```

Phases 1–4 are the critical path (unblock SDK + correctness). Phases 5–7 are
verification + release.

---

## Division of labor (team)

| Work | Best owner | Why |
|------|-----------|-----|
| Rust program fixes (Phase 2, 4) | Antigravity/Gemini | Has build/compile loop |
| IDL regen (Phase 1) | Antigravity/Gemini | Needs `anchor build` |
| TS SDK (Phase 3) | Either | Pure text edits |
| Tests (Phase 5) | Either | Needs `anchor test` runner |
| Docs (Phase 6) | Ollama | Pure text, no build needed |
| Architecture/plan (this doc) | Ollama | Done |

**Ollama constraint:** I can read/write files but cannot compile or run tests.
I'll own docs + architecture + code review; Antigravity owns build/test/compile.
