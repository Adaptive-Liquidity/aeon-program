# AEON Devnet Deploy

## Live deployment

| Field | Value |
|-------|--------|
| **Program ID** | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| **Cluster** | `https://api.devnet.solana.com` |
| **Upgrade authority** | `8XWzMqaQQzcXVSS5Q52D3vTnx6VgVBua8bJ273mYrP1F` |
| **ProgramData** | `9zax6S7GK2G8kTCjRaZcn8y4XE3vjdfU3mgQeA3c4W4r` |
| **Data length** | 560792 bytes |
| **Explorer** | https://explorer.solana.com/address/8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn?cluster=devnet |
| **Deploy artifact** | `target/devnet/deployment.json` |
| **Smoke artifact** | `target/devnet/smoke.json` |
| **Extended demo artifact** | `target/devnet/demo-escrow-org.json` |

Deploy tx (initial): `4xQcNLM2MQtRHnooZRjr7dEVR1SPXtDDjLLhbt3sAGrkuvF3gsq9eMjhfAAPBFtV4sdsqSWGkg39FojrYAuP1FsZ`

## Smoke-initialized protocol state

| Account | Address / value |
|---------|-----------------|
| **Config PDA** | `JCbqqJxxCzYzfs1YK3FDD5ZvW66ZbMNq82u3gto1Pmok` |
| **AEON mint** | `CBVW7hZ14AUkZM2AUYs44J83GgzyY891ugknDSbQJpTz` |
| **Admin** | `8XWzMqaQQzcXVSS5Q52D3vTnx6VgVBua8bJ273mYrP1F` |
| **Authority** | `#1` (budget 100, spent 10 after smoke pay) |
| **Pay tx** | [explorer](https://explorer.solana.com/tx/61oymSSi495ESUvgHnH6KE6rNyANnsMM41Yxr5v9bpDvQyKDWPyNd8D5UJzMFqku3TwREWq1QT2wjyLo4Cuo3GzQ?cluster=devnet) |

Path verified (smoke): mint → `initialize_config` → `register_agent` ×2 → `issue_authority` → `pay`.

```bash
npm run smoke:devnet   # re-runnable; reuses config if present
```

## Extended demo (escrow → org → dissolve)

**Runner:** `npm run demo:devnet`  
**Artifact:** `target/devnet/demo-escrow-org.json`  
**Last run:** 2026-08-09 (authority `#2`, escrow `#1` RELEASED + `#2` CANCELLED, org `#1` CLOSED)

Verified path on public devnet:

```text
config (reuse) → register A/B/C → issue_authority
  → create_escrow → release_escrow
  → create_escrow → cancel_escrow          (net-zero path)
  → create_org → join×2 → set_member_share×2
  → deposit_to_org → org_split
  → dissolve_org → reclaim_org_residual
```

| Step | Result (sample run) |
|------|---------------------|
| Escrow release | 25 AEON → C, status=RELEASED, authority spent += 25 |
| Escrow cancel | 10 AEON net-zero, status=CANCELLED |
| Org shares | A 5000 / B 3500 / C 1500 bps |
| Deposit / split | 100 in, 20 → B, treasury 80 |
| Dissolve | A+40, B+28, residual 12 (C share) |
| Reclaim | residual → A, treasury 0, status=CLOSED |

Example dissolve tx: [explorer](https://explorer.solana.com/tx/4GCWMq7LbUwEDojzadsbexVWGduBmnnfb47Co94AUaEBdbN3gVzP3fm44KonFQsocCFhtXdgCFujCuKSd1ZH2bp?cluster=devnet)

Requires admin wallet ≥ ~0.4 SOL + mint authority (CLI wallet default `~/.config/solana/id.json`).

## Upgrade

```bash
cd aeon-program
npm run build:sbf
npm run deploy:devnet
```

## Client usage

```ts
import { Connection } from "@solana/web3.js";
import { AeonClient } from "./client";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
// Config + mint already live after smoke — fetch via aeon.fetchConfig()
```
