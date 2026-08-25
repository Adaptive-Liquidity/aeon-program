# AEON v0.2 — Final Architecture

**Status:** Living document. Authoritative for the v0.2 release cut.
**Program ID:** `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm`
**Anchor:** 0.30.1 · **solana-program:** 1.18.10
**Last updated:** 2026-08-20

---

## 1. What AEON is (one paragraph)

AEON is an **on-chain economic control plane for AI agents on Solana**. It gives
agents non-transferable identity (CRI), hierarchical scoped spending authority
(depth ≤ 3), fail-closed money movement, conditional escrow, and multi-agent
organizations. v0.2 adds four capabilities on top of the v0.1 surface:
**receipts** (hash-chained provenance), **pause** (admin kill switch),
**expiry** (scheduled authority expiration), and **bonding** (slashable
economic stake).

AEON is **not** an LLM runtime, a stablecoin, or a yield product.

---

## 2. Instruction surface (v0.2 = 20 instructions)

### v0.1 (16 — unchanged, must not regress)

| # | Instruction | Money path? |
|---|-------------|-------------|
| 1 | `initialize_config` | — |
| 2 | `register_agent` | — |
| 3 | `issue_authority` | — (bond CPI added in v0.2) |
| 4 | `revoke_authority` | — |
| 5 | `pay` | ✅ fail-closed |
| 6 | `create_escrow` | ✅ fail-closed |
| 7 | `release_escrow` | ✅ |
| 8 | `cancel_escrow` | ✅ |
| 9 | `atomic_split` | ✅ fail-closed |
| 10 | `create_org` | — |
| 11 | `join_org` | — |
| 12 | `set_member_share` | — |
| 13 | `deposit_to_org` | ✅ |
| 14 | `org_split` | ✅ |
| 15 | `dissolve_org` | ✅ |
| 16 | `reclaim_org_residual` | ✅ |

### v0.2 (4 — new)

| # | Instruction | Purpose | Status |
|---|-------------|---------|--------|
| 17 | `create_receipt` | Hash-chained provenance receipt, CRI-bound | ✅ implemented |
| 18 | `expire_authority` | Scheduled authority expiry (no account close) | ✅ implemented |
| 19 | `set_paused` | Admin pause/unpause kill switch | ✅ implemented |
| 20 | `slash_bond` | Slash authority bond → destination | ⚠️ implemented, needs bond-vault fix |

---

## 3. Account model (v0.2)

```
Config            — admin, aeon_mint, counters (authority/escrow/org/receipt),
                    min_solvency_bps, paused, bump
AgentIdentity     — agent, created_slot, active, metadata_uri_hash, bump
Cri               — agent, settlement/commitment counters, volume_settled,
                    last_active_slot, created_slot,
                    last_receipt_hash [32], receipt_count, bump   ← v0.2
Authority         — id, agent, parent_id, depth, budget, spent,
                    max_per_tx, max_total, categories[8], blocked[4],
                    require_min_reserve, expiry_slot, status,
                    bond_amount, bump                              ← v0.2
AuthorityBond     — authority_id, agent, amount, status, bump      ← v0.2 (new)
Escrow            — id, payer, payee, amount, authority_id, category,
                    condition_type, condition_data[64], status,
                    created_slot, expiry_slot, vault_bump, bump
Organization      — id, name_hash, creator, member_count,
                    total_share_bps, status, created_slot, treasury_bump, bump
OrgMember         — org_id, agent, role, share_bps, bump
Receipt           — id, receipt_type, actor, slot, payload_hash[32],
                    prev_hash[32], hash[32], bump
OracleEntry       — is_closed, oracle, payload_hash[32], bump
```

### PDA seeds (canonical)

```
config          = ["aeon_config"]
agent_identity  = ["agent", agent]
cri             = ["cri", agent]
authority       = ["authority", id_le]
authority_bond  = ["authority_bond", id_le]        ← v0.2
escrow          = ["escrow", id_le]
escrow_vault    = ["escrow_vault", id_le]
org             = ["org", id_le]
org_treasury    = ["org_treasury", id_le]
org_member      = ["org_member", id_le, agent]
receipt         = ["receipt", id_le]
oracle_entry    = ["oracle_entry", ...]
```

---

## 4. v0.2 capability design

### 4.1 Receipts (`create_receipt`)
- **Hash chain:** `hash = H(domain_sep ‖ receipt_id ‖ type ‖ actor ‖ slot ‖ payload_hash ‖ prev_hash)`
- `prev_hash` is **read from CRI** (`cri.last_receipt_hash`), never caller-supplied → chain integrity.
- `payload_hash = sha256(payload)`; payload ≤ 1024 bytes, non-empty.
- Sequence enforced: `receipt_id == config.receipt_counter + 1`.
- On success: write Receipt PDA, advance `cri.last_receipt_hash`, `cri.receipt_count++`, `cri.last_active_slot`, advance `config.receipt_counter`.
- **Unlocks:** SPX402 `OC_*` event indexing → Flok Hire Hall.

### 4.2 Pause (`set_paused`)
- Admin-only. Flips `config.paused`. Emits `ConfigPaused` / `ConfigUnpaused`.
- All money paths + `register_agent` + `issue_authority` + `create_receipt` check `paused`.

### 4.3 Expiry (`expire_authority`)
- **Does NOT close the account** (avoids orphaning children/escrows/CRI history).
- Requires `expiry_slot != 0` and `clock.slot > expiry_slot`.
- Sets `status = AUTH_STATUS_EXPIRED`. Emits `AuthorityExpired`.

### 4.4 Bonding (`slash_bond` + `issue_authority` bond param)
- `issue_authority` optionally accepts `bond_amount`; if > 0, creates `AuthorityBond`
  PDA and CPIs tokens from agent vault → bond vault.
- `slash_bond` validates authority/bond state, then fail-closed CPI transfers
  bond → destination, marks bond `SLASHED`.
- **⚠️ Known gap:** bond vault token account is not yet initialized as owned by
  the bond PDA (see BUILD_PLAN Phase 2).

---

## 5. Hard invariants (must hold — unchanged from v0.1 + v0.2 additions)

1. **Spent-after-CPI** (fail-closed) — `spent`/CRI/counters write only after token CPI `Ok`.
2. **Depth & parent** — depth ≤ 3, child budget ≤ parent remaining, same agent, category intersection.
3. **Cascade correctness** — revoke remaining_accounts are direct children, same agent, canonical PDA, writable.
4. **Org conservation** — Σ share_bps ≤ 10000; dissolve requires complete share set.
5. **Mint binding** — token accounts use `config.aeon_mint`; classic + Token-2022 via interface.
6. **Receipt chain integrity** (v0.2) — `prev_hash` read from CRI, hash program-computed, sequence enforced.
7. **Bond fail-closed** (v0.2) — slash validates state before CPI; bond status committed after transfer.

---

## 6. Layered architecture (consumers)

```
Agent runtimes (ElizaOS · LangGraph · custom · Nexus-sandboxed)
        │  TypeScript Agent SDK (AeonClient)
        ▼
PDAs · revokeTree · categories · IDL wrappers
        │  Anchor instructions
        ▼
AEON program (20 ixs) — Config · AgentIdentity · CRI · Authority ·
                       AuthorityBond · Escrow · Org* · Receipt · OracleEntry
        │  Token interface
        ▼
SPL Token · Token-2022 (extensions, freeze, hooks)
```

**Consumers (out of repo):** AEON-IQ (memory/index), Nexus (sandbox/capability),
Control panel (UX), SPX402 (reputation indexer), Flok (product surface), OIAP (physical analog).

---

## 7. Test surface (must preserve + extend)

| Suite | v0.1 status | v0.2 target |
|-------|-------------|-------------|
| Negative e2e | 70 PASS + 1 ACCEPTED + 2 SKIP | + NEG-RCPT-*, NEG-CFG-*, NEG-AUTH-012-016, NEG-MIG-*, NEG-ESC-011-014, NEG-ORG-013-015 |
| HEAVY freeze CPI | 8/8 | unchanged |
| HEAVY transfer-hook | 3/3 | unchanged |
| Trident P2 fuzz | 5 PASS | unchanged |
| Devnet escrow→org→dissolve | PASS | + receipt/bond smoke |

---

## 8. Explicit non-goals (v0.2)

- Yield / APY / emissions / tokenomics
- Mainnet deployment + formal third-party audit
- Multisig escrow (condition 3) — still non-functional
- Oracle escrow (condition 2) — still non-functional
- Cross-chain CRI binding, OIAP bridge, TEE attestation
- Approach B transfer-hook remaining_accounts forwarding
- `@aeon/agent-sdk` npm publish (in-repo path import only)
