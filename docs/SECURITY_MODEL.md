# AEON Security Model

**Scope:** On-chain AEON program + what the product claims about safety.  
**Program:** `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn`  
**Status:** Fail-closed spent **CLOSED** (freeze + transfer-hook HEAVY). No Critical/High open findings from that review.

This document distinguishes **hard invariants** (must always hold) from **soft / ACCEPTED** model choices.  
It does **not** claim financial returns, solvency of agents, or mainnet audit completion.

Primary evidence:

| Doc / suite | Role |
|-------------|------|
| [stoa/CASE_CATALOG.md](./stoa/CASE_CATALOG.md) | Living NEG-* / FUZZ-* checklist |
| [stoa/CPI_SPENT_INVARIANCE.md](./stoa/CPI_SPENT_INVARIANCE.md) | HEAVY spent-after-CPI closeout |
| [stoa/TRIDENT_P2.md](./stoa/TRIDENT_P2.md) | Cascade / remaining_accounts fuzz |
| [stoa/NEGATIVE_E2E_STRATEGIES.md](./stoa/NEGATIVE_E2E_STRATEGIES.md) | Threat strategies S1–S10 |

---

## 1. Threat posture

AEON is an **economic control plane**. Relevant failures:

| Class | Example | Desired property |
|-------|---------|------------------|
| Accounting | `spent` increments when transfer fails | Fail closed — no spent move |
| Privilege | Child deeper than 3; foreign parent | Reject issue |
| Cascade | Revoke misses children or revokes wrong agent | remaining_accounts validated |
| Org siphon | Dissolve without full share set | Reject incomplete dissolve |
| Mint confusion | Wrong mint / wrong token program | Reject; mint bound to config |
| Hostile mint | Freeze / transfer-hook reject after policy | Spent and balances unchanged |

Out of scope for this model doc: wallet key compromise, RPC lying, off-chain agent bugs, market risk of the mint asset.

---

## 2. Hard invariants

These are **protocol law**. Violations are bugs.

### H1 — Spent-after-CPI (fail-closed)

For money paths that debit authority budget:

| Instruction | Order |
|-------------|--------|
| `pay` | policy checks → `transfer_checked` → write `spent` / CRI |
| `create_escrow` | policy → transfer to vault → spent + escrow counter |
| `atomic_split` | policy → **all** leg CPIs → then spent / CRI |

If any token CPI fails, the transaction aborts: **`authority.spent`, CRI volume/commitments, and escrow counters must not advance.**

**Evidence:**

- Source order review in [CPI_SPENT_INVARIANCE.md](./stoa/CPI_SPENT_INVARIANCE.md)  
- HEAVY freeze suite: **NEG-CPI-001…091 → 8/8 PASS** (`npm run test:heavy-cpi`)  
- HEAVY transfer-hook suite: **NEG-CPI-030…032 → 3/3 PASS** (`npm run test:heavy-hook`)  
  - Approach A: Token-2022 mint with TransferHook extension; AEON does not forward remaining_accounts → transfer rejected after policy  

Oracle on forced fail: spent unchanged, ATA balances unchanged, CRI unchanged, escrow_counter unchanged on failed create.

### H2 — Authority depth and parent constraints

On `issue_authority`:

- Child depth = parent.depth + 1 and **depth ≤ 3** (`MAX_AUTHORITY_DEPTH`)  
- Child budget ≤ parent remaining (`budget - spent`)  
- Parent must be active and same agent  
- Category intersection non-empty (or parent allows all)  
- Parent account / parent_id consistency enforced  

**Evidence:** NEG-AUTH-001…010 (and related) in CASE_CATALOG — **PASS**.

### H3 — Cascade correctness on revoke

`revoke_authority` may pass **remaining_accounts** as direct children to cascade:

- Must be direct children of the revoked authority  
- Same agent  
- Canonical authority PDA  
- Writable  

Adversarial metas (wrong parent, wrong agent, non-writable, non-canonical, garbage) must fail closed without invariant breaks.

**Evidence:**

- P0/P1 revoke cases (e.g. NEG-REV-*) — **PASS**  
- Trident FUZZ-REV-001/002, FUZZ-INV-001 — **PASS** (200 iterations × 40 flows, 0 panics)

On-chain cascade is **one level** (direct children). Multi-level trees require client deepest-first planning (`revokeTree` / `planRevoke`).

### H4 — Organization share conservation

- Σ member `share_bps` ≤ **10000** always  
- `dissolve_org` remaining set must cover **exact** total share bps (no omitted-member residual theft)  
- Closed org residual reclaim only via `reclaim_org_residual` under admin/creator rules  

**Evidence:** NEG-ORG-* suite — **PASS** (see CASE_CATALOG).

### H5 — Mint binding

- All protocol token accounts use `config.aeon_mint`  
- Token interface accepts classic SPL **or** Token-2022 program IDs  
- Foreign mint / wrong program pairing rejected  

**Evidence:** NEG-T22-* and pay mint gates — **PASS**.

---

## 3. Soft / ACCEPTED model (not bugs)

| ID | Behavior | Why ACCEPTED in v0.1 |
|----|----------|----------------------|
| **NEG-AUTH-011** | Two children can each be issued with `budget = parent.remaining` | `issue_authority` does **not** reserve parent `spent`. Over-subscription is a known product model; parents enforce remaining at **spend** time, not at issue time. Documented test asserts the soft behavior. |

Do **not** market soft cases as hard rejects. Do **not** “fix” them without an explicit versioned policy change.

### Explicit SKIPs (unsettable in v0.1)

| ID | Reason |
|----|--------|
| NEG-PAY-004 | Blocked recipients unsettable in v0.1 surface |
| NEG-PAY-015 | `min_reserve` effectively always 0 |

---

## 4. Token-2022 and hostile mints

| Scenario | AEON behavior | Status |
|----------|---------------|--------|
| Classic mint success path | transfer_checked OK → spent commits | PASS (e2e + controls) |
| T22 mint success path | Same via token interface | PASS (NEG-T22-010/011) |
| Frozen ATA mid-policy | CPI fails → spent unchanged | HEAVY freeze PASS |
| TransferHook mint (Approach A) | CPI fails → spent unchanged | HEAVY hook PASS |
| Approach B (forward remaining_accounts for hook Execute) | **Not implemented** | Stretch — not required for fail-closed honesty under Approach A |

Approach A is sufficient to keep the story honest: **policy can pass and money still not move, without false spent**.

---

## 5. Catalog counts (snapshot)

From [CASE_CATALOG.md](./stoa/CASE_CATALOG.md) (keep catalog authoritative if numbers drift):

| Status | Count |
|--------|-------|
| PASS (negative e2e) | **70** |
| ACCEPTED (soft) | **1** (NEG-AUTH-011) |
| PASS (P2 fuzz targets) | **5** |
| SKIP | **2** |
| TODO P2 | **0** |

Runners:

```bash
npm run test:negative   # all negative + HEAVY legs
npm run test:heavy-cpi
npm run test:heavy-hook
npm run test:fuzz:p2
```

---

## 6. What AEON does **not** guarantee

- Agent or treasury **economic** solvency beyond on-chain budgets  
- Correctness of off-chain planners that omit children on revoke  
- Safety if upgrade authority is compromised (devnet upgrade authority is live — see [DEVNET.md](./DEVNET.md))  
- Mainnet readiness or third-party formal audit (deferred)  
- Yield, APY, emissions, or price of `aeon_mint`  

---

## 7. Operational security notes

| Topic | Guidance |
|-------|----------|
| Program keypair | Do not rotate without coordinated redeploy; ID is public and live on devnet |
| Upgrade authority | Treat as high-value; prod should use multisig / governance (not specified in v0.1 product surface) |
| IDL sync | `client/idl/aeon.json` address must equal `declare_id!` |
| Client ids | Concurrent `authorityId` / `escrowId` / `orgId` races fail safely (account exists); retry with counter |

---

## 8. Integration boundaries

| Consumer | Allowed use of this model |
|----------|---------------------------|
| Agent SDK | Encodes PDAs and cascade planning; must not skip on-chain checks |
| AEON-IQ | Read/index authorities and CRI; must not claim stronger invariants than CASE_CATALOG |
| Nexus | Off-chain capability gates **before** issue/pay; cannot replace H1–H5 |

Changing fail-closed order or relaxing depth/share rules is a **breaking security change**, not a docs tweak.

---

## 9. Claim checklist (for docs and external posts)

Safe to claim (with citation):

- [x] Spent only commits after successful token CPI (HEAVY freeze + hook)  
- [x] Hierarchical authorities depth-capped with parent remaining checks  
- [x] Org dissolve requires complete share set  
- [x] Negative catalog and focused Trident fuzz green on cascade/spent  

Unsafe / forbidden without new evidence:

- [ ] “Audited for mainnet”  
- [ ] “Impossible to over-issue children” (false — see NEG-AUTH-011)  
- [ ] “Guaranteed returns / APY / risk-free agent treasury”  
- [ ] “Transfer hooks fully supported end-to-end” (Approach B not shipped)  

---

*Security claims should link this file and CASE_CATALOG — not paraphrase into stronger guarantees.*
