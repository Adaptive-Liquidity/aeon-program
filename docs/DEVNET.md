# AEON Devnet Deploy

## Live deployment (v0.2)

| Field | Value |
|-------|--------|
| **Program ID** | `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm` |
| **Cluster** | `https://api.devnet.solana.com` |
| **Upgrade authority** | `4bpiP5ddQhEbYxtJJL1qTecvMzzqw38NafoqfUF6R6CY` (Windows CLI wallet `C:\Users\Benna\.config\solana\id.json`) |
| **ProgramData** | `HeoQJtZRv3MYBGnEjzzAnhxLq34ALPkZJb2UkHRNp6JP` |
| **Data length** | 690200 bytes |
| **Explorer** | https://explorer.solana.com/address/TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm?cluster=devnet |
| **Deploy artifact** | `target/devnet/deployment.json` |
| **Smoke artifact** | `target/devnet/smoke.json` |
| **v0.2 smoke artifact** | `target/devnet/smoke-v02.json` |
| **Extended demo artifact** | `target/devnet/demo-escrow-org.json` |

Deploy tx (v0.2, 2026-08-23): `2r3FfJAwxgS1xww1MH8jiMpioU5gedox7u2BRoU6n4dVwLxvFXytFY5oPUngpCvmY3cLFmQX7Shnip1qHYJX823U`

### History: old program ID (locked)

The original v0.1 devnet deployment at `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` is
**abandoned** — its upgrade-authority wallet (`8XWzMqaQQzcXVSS5Q52D3vTnx6VgVBua8bJ273mYrP1F`)
was lost. The old program cannot be upgraded or admin-controlled. The v0.2
deployment above uses a new program ID and a fresh config/mint/PDAs, and its
upgrade authority is a wallet under our control.

## Smoke-initialized protocol state (v0.2)

| Account | Address / value |
|---------|-----------------|
| **Config PDA** | `3oFvpSfXS6A4Bpotor2cqbcpwyhbeXPiaAXBnDExkPmp` |
| **AEON mint** | `DaXLutwYNUJNsHRSwhYLefWgWFfDqm5J5g2vp4xhEVrS` |
| **Admin** | `4bpiP5ddQhEbYxtJJL1qTecvMzzqw38NafoqfUF6R6CY` |
| **Receipt counter** | 9 (receipts #1–#9 chained) |
| **Authorities** | #1 (v0.1 smoke pay), #2–#6 (v0.2 smoke), #6 bond slashed |
| **Pay tx** | [explorer](https://explorer.solana.com/tx/5y6UGJMUyN4bFVLxriWMiP9gPJVZs8qM6XcbZ5tLa47s38wP9kyxvc2jnEwc6eApj5GZWkhmqNY53BFFuLMue7Sz?cluster=devnet) |

### v0.1 path verified (smoke)

mint → `initialize_config` → `register_agent` ×2 → `issue_authority` → `pay`.

```bash
npm run smoke:devnet   # re-runnable; reuses config if present
```

### v0.2 path verified (v0.2 smoke)

```text
create_receipt #8 → #9           (CRI chain: #9.prev_hash == #8.hash)
set_paused(true)  → pay blocked with Paused
set_paused(false) → pay succeeds
issue_authority (bond 50)        (AuthorityBond ACTIVE, vault funded)
slash_bond                        (bond SLASHED, 50 AEON → destination)
```

```bash
node -r ts-node/register/transpile-only scripts/devnet-smoke-v02.ts
```

## Extended demo (escrow → org → dissolve)

**Runner:** `npm run demo:devnet`
**Artifact:** `target/devnet/demo-escrow-org.json`
**Last run:** 2026-08-09 (against the old, abandoned program ID — rerun against the new ID when needed)

Verified path on public devnet (v0.1 surface, unchanged in v0.2):

```text
config (reuse) → register A/B/C → issue_authority
  → create_escrow → release_escrow
  → create_escrow → cancel_escrow          (net-zero path)
  → create_org → join×2 → set_member_share×2
  → deposit_to_org → org_split
  → dissolve_org → reclaim_org_residual
```

Requires admin wallet ≥ ~0.4 SOL + mint authority (CLI wallet default `~/.config/solana/id.json`).

## Upgrade

```bash
cd aeon-program
npm run build:sbf
SOLANA_WALLET=/mnt/c/Users/Benna/.config/solana/id.json npm run deploy:devnet
```

> **Keep the upgrade-authority wallet backed up.** It is
> `C:\Users\Benna\.config\solana\id.json` (pubkey `4bpiP5dd…`). Losing it locks
> this deployment exactly like the old `8XWzMqa…` wallet locked the v0.1 one.

## Client usage

```ts
import { Connection } from "@solana/web3.js";
import { AeonClient } from "./client";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
// Config + mint already live after smoke — fetch via aeon.fetchConfig()
```
