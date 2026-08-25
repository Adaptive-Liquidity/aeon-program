# AEON Audit Pass — Gated Review Process

**Purpose:** Every Rust change to `programs/` must pass a formal audit before it is
considered "done." This turns ad-hoc review into a repeatable, checklist-driven gate.

**Owner:** Ollama (docs/architecture/code-review). Gemini (build/impl) submits changes;
Ollama runs the audit pass and returns PASS / FAIL with line-level findings.

**Status:** v0.2 — applies to Phase 4 (cleanups) and any future program changes.

---

## 1. When the audit runs

| Trigger | Action |
|---------|--------|
| Gemini finishes a Rust change | Gemini writes handoff + lists changed files |
| Benna pings Ollama ("your turn") | Ollama reads handoff, then runs the audit |
| Audit result | Ollama writes PASS/FAIL to `TEAM/handoffs/ollama.md` + `TEAM/STATUS.md` |

**Rule:** no Rust change is merged/deployed until the audit returns PASS (or FAIL items
are explicitly waived with a recorded decision in `TEAM/decisions.md`).

---

## 2. The 7 hard invariants (the checklist)

Each is a gate. A change that touches any of these areas MUST be checked against the
corresponding invariant. A change that doesn't touch an area is marked N/A.

### H1 — Spent-after-CPI (fail-closed)
**Applies to:** `pay`, `create_escrow`, `atomic_split`, `slash_bond`, `issue_authority` (bond CPI).

Checklist:
- [ ] `authority.spent` is written ONLY after `transfer_checked` returns `Ok`.
- [ ] CRI counters (`successful_commitments`, `volume_settled`) written only after CPI `Ok`.
- [ ] Escrow/org counters written only after CPI `Ok`.
- [ ] No `spent`/counter mutation appears BEFORE the CPI call in the handler.
- [ ] On CPI failure, the transaction aborts with no partial state (Anchor rollback).

**Evidence:** source order review + HEAVY freeze/hook suites (NEG-CPI-*).

### H2 — Authority depth & parent constraints
**Applies to:** `issue_authority`.

Checklist:
- [ ] `depth = parent.depth + 1` and `depth <= MAX_AUTHORITY_DEPTH (3)`.
- [ ] `budget <= parent.remaining` (`parent.budget - parent.spent`).
- [ ] Parent `status == ACTIVE` and `parent.agent == agent.key()`.
- [ ] Category intersection non-empty (or parent allows all).
- [ ] `parent_id == 0` ⟺ `parent_authority` is `None` (both directions enforced).

**Evidence:** NEG-AUTH-001..010.

### H3 — Cascade correctness on revoke
**Applies to:** `revoke_authority`.

Checklist:
- [ ] remaining_accounts are direct children (parent_id == revoked id).
- [ ] Same agent as the revoked authority.
- [ ] Canonical authority PDA (seeds `["authority", id_le]`).
- [ ] Writable.
- [ ] Adversarial metas (wrong parent/agent/non-writable/garbage) fail closed.

**Evidence:** NEG-REV-* + Trident FUZZ-REV-001/002.

### H4 — Org share conservation
**Applies to:** `create_org`, `join_org`, `set_member_share`, `dissolve_org`, `reclaim_org_residual`.

Checklist:
- [ ] Σ `share_bps <= 10000` always (checked on every mutation).
- [ ] `dissolve_org` remaining set covers EXACT total share bps (no omitted-member siphon).
- [ ] Residual reclaim only via `reclaim_org_residual` under admin/creator rules.

**Evidence:** NEG-ORG-*.

### H5 — Mint binding
**Applies to:** every token-account instruction.

Checklist:
- [ ] All token accounts constrained to `config.aeon_mint`.
- [ ] Token interface accepts classic SPL OR Token-2022 program IDs.
- [ ] Foreign mint / wrong program pairing rejected (`InvalidMint`).

**Evidence:** NEG-T22-*.

### H6 — Receipt chain integrity (v0.2)
**Applies to:** `create_receipt`.

Checklist:
- [ ] `prev_hash` read from `cri.last_receipt_hash` (NOT caller-supplied).
- [ ] `hash` is program-computed (domain separator + id + type + actor + slot + payload_hash + prev_hash).
- [ ] `payload_hash = sha256(payload)`; payload non-empty and ≤ 1024 bytes.
- [ ] Sequence enforced: `receipt_id == config.receipt_counter + 1`.
- [ ] On success: advance `cri.last_receipt_hash`, `cri.receipt_count`, `cri.last_active_slot`, `config.receipt_counter`.

**Evidence:** NEG-RCPT-* (pending in Phase 5).

### H7 — Bond fail-closed (v0.2)
**Applies to:** `issue_authority` (bond branch), `slash_bond`.

Checklist:
- [ ] Bond vault is an ATA owned by the bond PDA (not an arbitrary account).
- [ ] `slash_bond` validates authority + bond state BEFORE any CPI.
- [ ] Bond status committed to `SLASHED` only after transfer succeeds.
- [ ] `bond_amount > 0` ⟺ all bond accounts present (no partial/mixed).
- [ ] No `unwrap()`/panic paths in account constraints (fail with a clean error).

**Evidence:** NEG-BOND-* (pending in Phase 5).

---

## 3. Audit output format

Ollama writes this to `TEAM/handoffs/ollama.md`:

```
## AUDIT PASS — <change description>
| Invariant | Applies? | Result | Notes |
|-----------|----------|--------|-------|
| H1 | yes/no | PASS/FAIL/N/A | ... |
| H2 | ... | ... | ... |
| ... | ... | ... | ... |

Verdict: PASS / FAIL (N items)
Findings (if FAIL):
- [file:line] issue + suggested fix
```

---

## 4. Severity & disposition

| Severity | Meaning | Disposition |
|----------|---------|-------------|
| **BLOCKER** | Violates a hard invariant | Must fix before merge/deploy |
| **WARN** | Correct but fragile (e.g. `unwrap()`, confusing error reuse) | Fix in Phase 4 cleanup; not a merge blocker |
| **INFO** | Style / naming / docs | Optional |

Only BLOCKER items fail the audit. WARN/INFO are tracked but don't block.

---

## 5. Known open WARN items (from prior review)

These are already logged; they should be resolved in Phase 4:

1. `issue_authority.rs` — `bond_vault` constraint uses `bond.as_ref().unwrap().key()`
   → potential panic if `bond` is None but `bond_vault` is Some. Replace with a safe check.
2. `slash_bond.rs` — overloads `AuthorityNotSlashed` for "bond not active" → add a
   dedicated `BondNotActive` error for clarity.

---

## 6. Relationship to the build loop

The audit is a **review gate**, not a build gate. It does not require the toolchain —
Ollama can run it with `read_file` + `git diff` + `grep`. This is exactly the
specialization that adds value without adding a third agent or a second build loop.

**Flow:** Gemini builds/tests → Gemini writes handoff → Ollama audits (no toolchain needed)
→ PASS/FAIL → Gemini fixes BLOCKERs → repeat → deploy.
