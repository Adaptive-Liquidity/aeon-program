# AEON Overview

**AEON** is an on-chain **agent economic control plane** for Solana.  
Agents get identity, scoped spending power, conditional locks, and multi-agent organizations — without emissions, yield framing, or tokenomics schemes.

| | |
|--|--|
| **Program** | Anchor 0.30.1 · 20 instructions |
| **Program ID** | `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm` |
| **Client** | TypeScript Agent SDK (`client/`) |
| **Cluster (live)** | [Devnet](./DEVNET.md) |
| **Safety surface** | [SECURITY_MODEL.md](./SECURITY_MODEL.md) · [stoa/CASE_CATALOG.md](./stoa/CASE_CATALOG.md) |

---

## What it is

AEON enforces **economic policy on-chain** so autonomous agents (ElizaOS, LangGraph, custom runtimes, Nexus-sandboxed agents) can:

1. **Identity** — register an agent and a non-transferable **CRI** (Cryptographic Reputation Index) account  
2. **Scoped power** — issue hierarchical **authorities** with budget, max-per-tx, categories, expiry, and depth limit  
3. **Fail-closed spend** — `pay` and multi-leg `atomic_split` that never mark `spent` if the token CPI fails  
4. **Conditional lock** — **escrow** with condition types and witness / timeout release  
5. **Swarm / org** — multi-agent organizations with share-based residual claims and treasury conservation  
6. **Token-2022 native** — classic SPL and Token-2022 (including transfer-hook denials under Approach A)  
7. **Provenance** — hash-chained **receipts** bound to CRI (v0.2)  
8. **Operational safety** — admin **pause** kill switch + scheduled authority **expiry** (v0.2)  
9. **Economic teeth** — slashable authority **bonds** (v0.2)

Higher layers (AEON-IQ memory, Nexus capability/sandbox, control-panel tools) **consume** this surface. They do not redefine it.

---

## What it is not

| Non-goal | Why |
|----------|-----|
| Yield / APY / emissions product | No guaranteed returns; not a savings or farming program |
| Tokenomics / buyback / lock boosters | Belongs in separate launch or control-panel systems |
| Full agent runtime | AEON is the economic layer; runtimes live off-chain |
| Cross-chain bridge or DEX | Mint-bound token moves only via SPL / Token-2022 CPIs |

If a design doc sounds like a fixed-return product, it is **out of scope** for this program.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Agent runtimes (consumers)                     │
│     ElizaOS · LangGraph · custom · Nexus-sandboxed agents   │
└──────────────────────────┬──────────────────────────────────┘
                           │  TypeScript Agent SDK (AeonClient)
┌──────────────────────────▼──────────────────────────────────┐
│  PDAs · revokeTree · categories · IDL wrappers              │
└──────────────────────────┬──────────────────────────────────┘
                           │  Anchor instructions
┌──────────────────────────▼──────────────────────────────────┐
│                 AEON program (20 ixs)                       │
│  Config · AgentIdentity · CRI · Authority · AuthorityBond   │
│  Escrow · Org* · Receipt · OracleEntry                      │
│  Fail-closed: validate policy → transfer_checked → commit   │
└──────────────────────────┬──────────────────────────────────┘
                           │  Token interface
┌──────────────────────────▼──────────────────────────────────┐
│        SPL Token  ·  Token-2022 (extensions, freeze, hooks) │
└─────────────────────────────────────────────────────────────┘
```

---

## Instruction surface

| # | Instruction | Role | Money path? |
|---|-------------|------|-------------|
| 1 | `initialize_config` | Admin binds protocol mint | — |
| 2 | `register_agent` | Agent identity + CRI | — |
| 3 | `issue_authority` | Root or child scoped budget (+ optional bond) | — (bond CPI) |
| 4 | `revoke_authority` | Direct revoke + child cascade | — |
| 5 | `pay` | Single transfer under authority | **Yes — fail-closed** |
| 6 | `create_escrow` | Lock to vault under authority | **Yes — fail-closed** |
| 7 | `release_escrow` | Vault → payee | Yes |
| 8 | `cancel_escrow` | Vault → payer | Yes |
| 9 | `atomic_split` | Multi-leg transfer, one spent commit | **Yes — fail-closed** |
| 10 | `create_org` | Org + treasury + creator member | — |
| 11 | `join_org` | Admin admits member | — |
| 12 | `set_member_share` | Adjust share_bps | — |
| 13 | `deposit_to_org` | Fund treasury | Yes |
| 14 | `org_split` | Treasury → member | Yes |
| 15 | `dissolve_org` | Complete share set required | Yes |
| 16 | `reclaim_org_residual` | Closed-org residual | Yes |
| 17 | `create_receipt` | Hash-chained provenance receipt (CRI-bound) | — |
| 18 | `expire_authority` | Scheduled authority expiry (no account close) | — |
| 19 | `set_paused` | Scoped pause gate over register/issue/pay/split/escrow/org/receipt entry points | — |
| 20 | `slash_bond` | Slash authority bond → destination | **Yes — fail-closed** |

**PDA seeds (canonical):**

```
config          = ["aeon_config"]
agent_identity  = ["agent", agent]
cri             = ["cri", agent]
authority       = ["authority", id_le]
authority_bond  = ["authority_bond", id_le]   // v0.2
escrow          = ["escrow", id_le]
escrow_vault    = ["escrow_vault", id_le]
org             = ["org", id_le]
org_treasury    = ["org_treasury", id_le]
org_member      = ["org_member", id_le, agent]
receipt         = ["receipt", id_le]
oracle_entry    = ["oracle_entry", ...]
```

---

## Hard invariants (summary)

These must always hold. Full treatment: [SECURITY_MODEL.md](./SECURITY_MODEL.md).

1. **Spent-after-CPI** — `authority.spent` and CRI counters write only after token CPI returns `Ok`  
2. **Depth & parent** — child depth ≤ 3; child budget ≤ parent remaining; same agent; category intersection  
3. **Cascade correctness** — revoke remaining accounts are direct children, same agent, canonical PDAs, writable  
4. **Org conservation** — Σ `share_bps` ≤ 10000; dissolve set covers total shares (no omitted-member siphon)  
5. **Mint binding** — token accounts use `config.aeon_mint`; classic and Token-2022 program IDs accepted via interface  
6. **Receipt chain integrity** (v0.2) — `prev_hash` read from CRI, hash program-computed, sequence enforced  
7. **Bond fail-closed** (v0.2) — slash validates state before CPI; Solana atomicity rolls back status + transfer together on failure  

---

## Soft / accepted model (v0.1)

Not every edge is a hard program reject. Documented soft behavior:

| Case | Behavior | Status |
|------|----------|--------|
| **NEG-AUTH-011** dual-child overissue | Both children may receive `budget = parent.remaining`; issue does **not** reserve parent spent | **ACCEPTED** |

See [stoa/CASE_CATALOG.md](./stoa/CASE_CATALOG.md).

---

## Proof surface (what “safe” means here)

| Proof | Runner / location | Status |
|-------|-------------------|--------|
| Positive e2e (9 paths) | `npm run test:e2e` | PASS |
| Negative catalog | `npm run test:negative` | **70 PASS** + 1 ACCEPTED |
| HEAVY freeze CPI-fail | `npm run test:heavy-cpi` | **8/8** |
| HEAVY transfer-hook deny | `npm run test:heavy-hook` | **3/3** (Approach A) |
| Trident remaining_accounts / cascade | `npm run test:fuzz:p2` | PASS (200×40, 0 panics) |
| Live escrow → org → dissolve | `npm run demo:devnet` | PASS |

> **v0.2 note:** the four new instructions (`create_receipt`, `expire_authority`,
> `set_paused`, `slash_bond`) are implemented but their NEG-* test surface is **pending**
> (see BUILD_PLAN Phase 5). Do not claim v0.2 safety coverage until those tests land.

Safety claims in marketing or integration docs should **cite** this surface — not invent stronger guarantees.

---

## Client path

The **only recommended client** is the in-repo TypeScript SDK:

```ts
import { AeonClient, categoryFromLabel, CONDITION, ROLE } from "./client";
```

- Hides PDA derivation, next-id counters, and multi-level revoke planning  
- Supports classic SPL and Token-2022 via `tokenProgram`  
- v0.2 adds `createReceipt`, `expireAuthority`, `setPaused`, `slashBond`, and the `bondAmount` param on `issueAuthority`  
- Docs: [`client/README.md`](../client/README.md) · start here: [QUICKSTART.md](./QUICKSTART.md)

---

## Related layers (out of this repo)

| Layer | Role vs AEON |
|-------|----------------|
| **AEON-IQ** | Memory / indexing of authorities and CRI (read-side consumer) |
| **Nexus** | WASM sandbox / capability gating **before** on-chain issue/pay |
| **Control panel** | Operator UX; must not weaken on-chain invariants |
| **SPX402** | Reputation indexer consuming AEON receipts/events |
| **Flok** | Product surface (Hire Hall) gated by SPX402 |

Integration notes are deferred stretch work; they must not change program semantics.

---

## Where to go next

| Goal | Doc |
|------|-----|
| Land a pay in minutes | [QUICKSTART.md](./QUICKSTART.md) |
| Understand failure modes | [SECURITY_MODEL.md](./SECURITY_MODEL.md) |
| Devnet addresses + explorer | [DEVNET.md](./DEVNET.md) |
| Case-level checklist | [stoa/CASE_CATALOG.md](./stoa/CASE_CATALOG.md) |
| Spent-on-CPI-fail review | [stoa/CPI_SPENT_INVARIANCE.md](./stoa/CPI_SPENT_INVARIANCE.md) |
| v0.2 architecture | [FINAL_ARCHITECTURE.md](./FINAL_ARCHITECTURE.md) |
| v0.2 build plan | [BUILD_PLAN.md](./BUILD_PLAN.md) |
| Remaining packaging / CI | [PRODUCT_SURFACE_HANDOFF.md](./PRODUCT_SURFACE_HANDOFF.md) |
