# Changelog

All notable changes to the AEON Solana program and Agent SDK are documented here.

Format inspired by [Keep a Changelog](https://keepachangelog.com/).  
Versioning: program + in-repo SDK share the same release cut.

---

## [0.2.0] — 2026-08-25 (release cut — tag + GitHub Release publication pending merge)

**Status:** Rust implemented; IDL/SDK/tests/docs done; **v0.2 live on devnet (new program ID)**.

### Added — on-chain (4 new instructions, 20 total)

- `create_receipt` — hash-chained provenance receipt, CRI-bound (`prev_hash` read from CRI, program-computed hash, sequence enforced)
- `expire_authority` — scheduled authority expiry (no account close; preserves child/escrow/CRI anchors)
- `set_paused` — admin pause/unpause kill switch (emits `ConfigPaused` / `ConfigUnpaused`)
- `slash_bond` — slash authority bond → destination (fail-closed CPI)

### Added — state

- `Authority.bond_amount: u64`
- `Cri.last_receipt_hash: [u8; 32]` + `Cri.receipt_count: u64`
- New account `AuthorityBond` (authority_id, agent, amount, status, bump)

### Added — constants / errors / events

- `SEED_AUTHORITY_BOND`, `RECEIPT_DOMAIN_SEPARATOR`, `RECEIPT_TYPE_*`, `BOND_STATUS_*`
- Errors: `InvalidPayload`, `ReceiptIdMismatch`, `ReceiptChainMismatch`, `InsufficientBond`, `AuthorityNotSlashed`, `AuthorityNotExpired`
- Events: `ReceiptCreated`, `ConfigPaused`, `ConfigUnpaused`, `AuthorityExpired`, `BondSlashed`

### Changed

- `issue_authority` now accepts `bond_amount` (9th arg) and optionally creates an `AuthorityBond` + bond vault.

### Program ID (v0.2 — all environments)

```
TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm
```

> The v0.1.0 ID (`8i5E3R2…`) is abandoned: its devnet upgrade-authority wallet was
> lost. v0.2 redeployed fresh under the new ID (see `docs/DEVNET.md`).

### Devnet (live, v0.2)

| Field | Value |
|-------|--------|
| Program | `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm` |
| Upgrade authority | `4bpiP5ddQhEbYxtJJL1qTecvMzzqw38NafoqfUF6R6CY` |
| Config | `3oFvpSfXS6A4Bpotor2cqbcpwyhbeXPiaAXBnDExkPmp` |
| Mint | `DaXLutwYNUJNsHRSwhYLefWgWFfDqm5J5g2vp4xhEVrS` |
| Cluster | `https://api.devnet.solana.com` |

### Verification (2026-08-23)

- Negative e2e: **68 PASS** + Token-2022 **4** + HEAVY freeze **8** + HEAVY hook **3** (`npm run test:negative`)
- Trident P2 fuzz: **exit 0, 0 panics** (`npm run test:fuzz:p2`)
- SDK: 6/6 offline unit + `typecheck:sdk` exit 0
- Devnet smoke v0.2: receipt chain (#8→#9), pause blocks pay, bond issue→slash — **PASS**

---

## [0.1.0] — 2026-08-09

First **product-surface** release of AEON: agent economic control plane on Solana  
(Anchor 0.30.1), with TypeScript Agent SDK, safety catalog, live devnet, and CI.

### Program ID (all environments in this cut)

```
8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn
```

### Devnet (live)

| Field | Value |
|-------|--------|
| Program | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| Config | `JCbqqJxxCzYzfs1YK3FDD5ZvW66ZbMNq82u3gto1Pmok` |
| Mint | `CBVW7hZ14AUkZM2AUYs44J83GgzyY891ugknDSbQJpTz` |
| Cluster | `https://api.devnet.solana.com` |

Details: [`docs/DEVNET.md`](docs/DEVNET.md)

### Added — on-chain (16 instructions)

- Config bootstrap (`initialize_config`) with mint binding  
- Agent identity + non-transferable CRI (`register_agent`)  
- Hierarchical authorities (`issue_authority`, `revoke_authority` + direct-child cascade)  
  - depth ≤ 3, parent remaining budget, category intersection  
- Fail-closed money paths: `pay`, `create_escrow`, `atomic_split`  
  - order: **validate policy → token CPI → commit spent**  
- Escrow lifecycle: `create_escrow` / `release_escrow` / `cancel_escrow`  
- Organizations: `create_org`, `join_org`, `set_member_share`, `deposit_to_org`,  
  `org_split`, `dissolve_org` (complete share set), `reclaim_org_residual`  
- Token interface: classic SPL **and** Token-2022  

### Added — TypeScript Agent SDK (`client/`)

- `AeonClient` covering all 16 instructions + fetch/scan helpers  
- PDA helpers, category encode/decode, deepest-first `planRevokeTree` / `revokeTree`  
- Bundled IDL (`client/idl/aeon.json`)  
- Composable examples: minimal pay, escrow, org swarm, revoke tree (`client/examples/`)  
- Frozen public export surface documented in `client/README.md`  
- Offline unit tests: `npm run test:sdk` · typecheck: `npm run typecheck:sdk`  

### Added — safety surface

- Negative e2e catalog: **70 PASS** + **1 ACCEPTED** soft + **2 SKIP**  
  - runner: `npm run test:negative`  
  - living list: [`docs/stoa/CASE_CATALOG.md`](docs/stoa/CASE_CATALOG.md)  
- HEAVY CPI-fail spent (freeze): **8/8 PASS** — `npm run test:heavy-cpi`  
- HEAVY transfer-hook deny (Approach A): **3/3 PASS** — `npm run test:heavy-hook`  
- Soft model **NEG-AUTH-011** dual-child overissue: **ACCEPTED** (no parent.spent reservation on issue)  
- Trident P2 fuzz (remaining_accounts / cascade / spent): **PASS** (200×40, 0 panics)  
  - `npm run test:fuzz:p2` · [`docs/stoa/TRIDENT_P2.md`](docs/stoa/TRIDENT_P2.md)  
- Security model + claim checklist: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)  
- CPI spent closeout: [`docs/stoa/CPI_SPENT_INVARIANCE.md`](docs/stoa/CPI_SPENT_INVARIANCE.md)  

### Added — demos & product docs

- Localnet agent economy demo (9 acts): `npm run demo:economy`  
- Devnet smoke + extended escrow → org → dissolve: `npm run smoke:devnet` / `demo:devnet`  
- Product docs: [`OVERVIEW`](docs/OVERVIEW.md) · [`QUICKSTART`](docs/QUICKSTART.md) · [`SECURITY_MODEL`](docs/SECURITY_MODEL.md)  
- CI docs: [`docs/CI.md`](docs/CI.md)  

### Added — CI

- Push/PR workflow: SDK unit + typecheck, SBF build, localnet e2e, full negative suite  
  - [`.github/workflows/ci.yml`](.github/workflows/ci.yml)  
- Nightly Trident P2 fuzz: [`.github/workflows/fuzz-nightly.yml`](.github/workflows/fuzz-nightly.yml)  
- Toolchain helpers: `scripts/ci-install-toolchain.sh`, `scripts/ci-prepare-deploy.sh`  
- Canonical build path: **`npm run build:sbf`** + committed IDL (not full `anchor build` IDL regen)

### Hard invariants (must hold)

1. Spent-after-CPI (fail-closed)  
2. Authority depth ≤ 3 and parent constraints  
3. Revoke cascade remaining_accounts correctness  
4. Org share_bps conservation + complete dissolve set  
5. Mint binding to `config.aeon_mint`  

### Explicit non-goals (v0.1)

- Yield, APY, emissions, or tokenomics / buyback framing  
- Mainnet deployment and formal third-party audit  
- On-chain Receipt instruction surface (PDA/struct only)  
- Approach B: forward remaining_accounts for full transfer-hook Execute  
- Multi-signer success paths in Trident (single-payer SVM limit)  
- npm publish of `@aeon/agent-sdk` (in-repo path import is the supported client)

### Deferred / known limits

| Item | Notes |
|------|--------|
| NEG-PAY-004 / NEG-PAY-015 | SKIP — blocked recipients unsettable; min_reserve always 0 |
| NEG-AUTH-011 | ACCEPTED soft dual-child overissue |
| `anchor build` IDL on rustc ≥1.97 | Use `build:sbf` + committed IDL |
| Program keypair in `keys/` | Devnet upgrade authority — not for mainnet governance |

### Upgrade notes

- From pre-0.1 scaffolds: replace placeholder program IDs with `8i5E3R2…`; do **not** generate a new keypair if you intend to talk to the live devnet deployment.  
- Clients should import from `./client` (see `client/README.md`).  

---

## Links

- Overview: [docs/OVERVIEW.md](docs/OVERVIEW.md)  
- Quickstart: [docs/QUICKSTART.md](docs/QUICKSTART.md)  
- Security: [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md)  
- Devnet: [docs/DEVNET.md](docs/DEVNET.md)  
- Handoff / stretch: [docs/PRODUCT_SURFACE_HANDOFF.md](docs/PRODUCT_SURFACE_HANDOFF.md)
