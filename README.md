<div align="center">

# AEON

**The economic control plane for autonomous AI agents on Solana**

Scoped spending authorities · fail-closed accounting · hash-chained provenance · multi-agent organizations

[Program ID](#devnet) · [Quickstart](#quickstart) · [Security model](docs/SECURITY_MODEL.md) · [SDK](client/README.md)

`Anchor 0.30.1` · `20 instructions` · `Live on Devnet`

</div>

---

## Why AEON exists

Autonomous agents are starting to hold and move real money — paying APIs, hiring other agents, settling work. Today that authority lives in a **hot private key**. One prompt injection, one hallucinated planner step, one buggy retry loop, and the wallet is drained. Off-chain guardrails (rate limiters, allowlists, "responsible prompts") are suggestions. Nothing *enforces* them.

AEON moves enforcement on-chain. An agent never holds open-ended spend power — it holds a **scoped authority**: a budgeted, category-limited, depth-capped, expirable grant whose every debit is accounted for by the program itself. If the token transfer fails, the ledger does not move. If a delegate misbehaves, its branch is revoked in a cascade and its bond is slashed. Every action leaves a tamper-evident, hash-chained receipt bound to the agent's identity.

**The core insight:** an agent's spending power should be a *verifiable object on-chain* — not a secret in an environment variable.

---

## What it is

| | |
|--|--|
| **Program** | Anchor 0.30.1 · 20 instructions · [`programs/aeon`](programs/aeon) |
| **Client** | TypeScript Agent SDK → [`client/`](client) · [examples](client/examples) |
| **Cluster (live)** | [Devnet](docs/DEVNET.md) |
| **Safety surface** | [SECURITY_MODEL.md](docs/SECURITY_MODEL.md) · [CASE_CATALOG](docs/stoa/CASE_CATALOG.md) |

Not a yield product. Not emissions or APY. Enforcement-first primitives for agent economies.

### The six primitives

1. **Identity** — each agent registers an identity plus a non-transferable **CRI** (Cryptographic Reputation Index) account that accumulates volume and commitments.
2. **Scoped authority** — hierarchical spending grants: `budget`, `max_per_tx`, `max_total`, category whitelist, expiry slot, delegation **depth ≤ 3**. Children inherit no more than the parent has left.
3. **Fail-closed spend** — `pay` / `atomic_split` / escrow follow a strict order: *validate policy → move tokens via CPI → then commit `spent`*. A hostile or frozen mint can make money not move — it can never make the ledger lie.
4. **Escrow** — conditional locks (immediate / oracle / timeout) with release and cancel paths.
5. **Organizations** — multi-agent swarms with share-based treasury claims; dissolution requires the *complete* share set, so no member can be silently siphoned out.
6. **Provenance & teeth** *(v0.2)* — hash-chained **receipts** bound to CRI, admin **pause** kill switch, scheduled authority **expiry**, and **slashable bonds** attached to authorities.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Agent runtimes (consumers)                     │
│     ElizaOS · LangGraph · custom · Nexus-sandboxed agents   │
└──────────────────────────┬──────────────────────────────────┘
                           │  TypeScript Agent SDK (AeonClient)
┌──────────────────────────▼──────────────────────────────────┐
│  PDAs · revokeTree planning · categories · IDL wrappers     │
└──────────────────────────┬──────────────────────────────────┘
                           │  Anchor instructions
┌──────────────────────────▼──────────────────────────────────┐
│                 AEON program (20 ixs)                       │
│  Config · AgentIdentity · CRI · Authority · AuthorityBond   │
│  Escrow · Org/Treasury/Member · Receipt · OracleEntry       │
│  Fail-closed order: policy → transfer_checked → commit      │
└──────────────────────────┬──────────────────────────────────┘
                           │  Token interface
┌──────────────────────────▼──────────────────────────────────┐
│        SPL Token  ·  Token-2022 (freeze, hooks, extensions) │
└─────────────────────────────────────────────────────────────┘
```

Higher layers (AEON-IQ memory, Nexus sandboxing, operator panels) **consume** this surface; they cannot weaken it. Changing the fail-closed order or relaxing depth/share rules is treated as a breaking security change.

### Instruction surface

| Group | Instructions | Notes |
|-------|--------------|-------|
| Protocol | `initialize_config` | Admin binds the protocol mint |
| Identity | `register_agent` | Identity + CRI |
| Authority | `issue_authority` · `revoke_authority` · `expire_authority` ᵛ⁰·² | Cascade revoke; expiry without close |
| Money | `pay` · `atomic_split` · `create_escrow` · `release_escrow` · `cancel_escrow` | **Fail-closed money paths** |
| Orgs | `create_org` · `join_org` · `set_member_share` · `deposit_to_org` · `org_split` · `dissolve_org` · `reclaim_org_residual` | Share conservation ≤ 10000 bps |
| Provenance & control | `create_receipt` ᵛ⁰·² · `set_paused` ᵛ⁰·² · `slash_bond` ᵛ⁰·² | CRI-bound chain; kill switch; slashing |

Full table with money-path flags: [OVERVIEW.md](docs/OVERVIEW.md#instruction-surface).

### Hard invariants

These are protocol law — violations are bugs ([full treatment](docs/SECURITY_MODEL.md)):

| # | Invariant |
|---|-----------|
| H1 | **Spent-after-CPI** — `spent` / CRI counters write only after token CPI returns `Ok` |
| H2 | **Depth & parent** — child depth ≤ 3; budget ≤ parent remaining; same agent; category intersection |
| H3 | **Cascade correctness** — revoke remaining accounts must be direct children, canonical PDAs |
| H4 | **Org conservation** — Σ share_bps ≤ 10000; dissolve requires the exact complete set |
| H5 | **Mint binding** — all token accounts use `config.aeon_mint`; SPL and Token-2022 both accepted |
| H6 | **Receipt chain integrity** ᵛ⁰·² — `prev_hash` read from CRI, hash program-computed, sequence enforced |
| H7 | **Bond fail-closed** ᵛ⁰·² — validate state before CPI; commit status after transfer |

---

## Quickstart

```bash
git clone https://github.com/Adaptive-Liquidity/aeon-program.git
cd aeon-program && npm install
npm run demo:economy     # boots localnet, deploys, runs a 9-act SDK narrative
```

Minimal scoped pay in your own code:

```ts
import { AeonClient, categoryFromLabel } from "./client";

const aeon = AeonClient.fromProvider(provider);

await aeon.registerAgent();
const { authorityId } = await aeon.issueAuthority({
  budget: 1_000_000,
  maxPerTx: 100_000,
  categories: [categoryFromLabel("compute")],
});

await aeon.pay({
  amount: 1_000,
  payee,
  payerToken,
  payeeToken,
  authorityId,
  category: categoryFromLabel("compute"),
});
// if this throws, nothing moved — spent unchanged, balances unchanged
```

Full walkthrough: [QUICKSTART.md](docs/QUICKSTART.md) · recipes: [client/examples](client/examples) (minimal pay, escrow lifecycle, org swarm, revoke tree).

---

## Verification

Safety here means evidence, not vibes:

| Suite | Command | Status |
|-------|---------|--------|
| Positive e2e (9 paths) | `npm run test:e2e` | PASS |
| Negative catalog (70 cases) | `npm run test:negative` | **70 PASS + 1 ACCEPTED** |
| HEAVY freeze CPI-fail (hostile mint) | `npm run test:heavy-cpi` | **8/8 PASS** |
| HEAVY transfer-hook deny | `npm run test:heavy-hook` | **3/3 PASS** |
| Trident fuzz (cascade / remaining_accounts) | `npm run test:fuzz:p2` | PASS — 200×40, 0 panics |
| SDK offline units + typecheck | `npm run test:sdk` | 6/6 PASS |

The HEAVY suites prove the headline property directly: a frozen ATA or a rejecting transfer-hook makes the transaction fail **after policy passes**, and `authority.spent`, CRI counters, and vault balances are provably untouched.

> **v0.2 honesty note:** the four new instructions (`create_receipt`, `expire_authority`, `set_paused`, `slash_bond`) are implemented, fuzzed, and live on devnet, but their dedicated NEG-* catalog entries are still landing. Do not treat receipts/bonds as production-audited until they do — see [SECURITY_MODEL §6](docs/SECURITY_MODEL.md).

---

## Devnet

| Field | Value |
|-------|-------|
| **Program ID** | `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm` |
| Config | `3oFvpSfXS6A4Bpotor2cqbcpwyhbeXPiaAXBnDExkPmp` |
| Mint | `DaXLutwYNUJNsHRSwhYLefWgWFfDqm5J5g2vp4xhEVrS` |
| Cluster | `https://api.devnet.solana.com` |
| Explorer | [program ↗](https://explorer.solana.com/address/TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm?cluster=devnet) |

```bash
npm run smoke:devnet    # register + issue + pay against live program
npm run demo:devnet     # escrow → org → dissolve end-to-end on devnet
```

The original v0.1 ID (`8i5E3R2…`) was abandoned after its upgrade-authority wallet was lost; v0.2 redeployed fresh under this ID.

---

## Documentation map

| Doc | Purpose |
|-----|---------|
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | What AEON is / is not, full instruction + PDA tables |
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Build, localnet, first scoped pay |
| [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | Hard invariants H1–H7, threat posture, claim checklist |
| [docs/FINAL_ARCHITECTURE.md](docs/FINAL_ARCHITECTURE.md) | v0.2 architecture decisions |
| [docs/stoa/CASE_CATALOG.md](docs/stoa/CASE_CATALOG.md) | Living NEG-*/FUZZ-* case checklist |
| [docs/stoa/CPI_SPENT_INVARIANCE.md](docs/stoa/CPI_SPENT_INVARIANCE.md) | Fail-closed spent closeout |
| [client/README.md](client/README.md) | Frozen SDK public API |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

---

## Release

**v0.2.0** — 20-instruction surface: receipts, bonds, pause, expiry; fresh program ID; live on devnet.
Changelog: [`CHANGELOG.md`](CHANGELOG.md) · notes: [`docs/RELEASE_NOTES_v0.2.0.md`](docs/RELEASE_NOTES_v0.2.0.md)

### Roadmap (stretch)

Multi-signer pay path · Approach B transfer-hook forwarding · nightly fuzz seed archive · AEON-IQ / Nexus integration notes · optional npm publish of the SDK · mainnet + formal audit.

---

## Non-goals (permanent)

- Yield, APY, emissions framing — this is infrastructure, not a returns product
- Replacing the TypeScript SDK as the primary client
- Relaxing fail-closed spent, depth, or org-share invariants

---

Adaptive Liquidity Labs (`@all4aeon`) · [Adaptive-Liquidity/aeon-program](https://github.com/Adaptive-Liquidity/aeon-program)
