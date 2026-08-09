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

Deploy tx (initial): `4xQcNLM2MQtRHnooZRjr7dEVR1SPXtDDjLLhbt3sAGrkuvF3gsq9eMjhfAAPBFtV4sdsqSWGkg39FojrYAuP1FsZ`

## Smoke-initialized protocol state

| Account | Address / value |
|---------|-----------------|
| **Config PDA** | `JCbqqJxxCzYzfs1YK3FDD5ZvW66ZbMNq82u3gto1Pmok` |
| **AEON mint** | `CBVW7hZ14AUkZM2AUYs44J83GgzyY891ugknDSbQJpTz` |
| **Admin** | `8XWzMqaQQzcXVSS5Q52D3vTnx6VgVBua8bJ273mYrP1F` |
| **Authority** | `#1` (budget 100, spent 10 after smoke pay) |
| **Pay tx** | [explorer](https://explorer.solana.com/tx/61oymSSi495ESUvgHnH6KE6rNyANnsMM41Yxr5v9bpDvQyKDWPyNd8D5UJzMFqku3TwREWq1QT2wjyLo4Cuo3GzQ?cluster=devnet) |

Path verified: mint → `initialize_config` → `register_agent` ×2 → `issue_authority` → `pay` (token balances + spent invariant).

```bash
npm run smoke:devnet   # re-runnable; reuses config if present
```

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
