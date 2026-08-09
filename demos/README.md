# AEON demos

## Agent economy (`agent-economy.ts`)

SDK-driven multi-agent narrative on localnet.

```bash
npm run demo:economy
```

Boots a fresh validator, deploys `aeon.so`, runs only this suite (**9 acts**).

| Act | What it proves |
|-----|----------------|
| 1 | Mint + `initialize_config` |
| 2 | `register_agent` ×3 |
| 3 | Authority hierarchy + max_per_tx inheritance |
| 4 | `pay` under authority + CRI update |
| 5 | Escrow create → release |
| 6 | `atomic_split` dual payee |
| 7 | Org join / set_share / deposit / split / dissolve / reclaim |
| 8 | Deepest-first `revoke` tree |
| 9 | Balance + CRI scoreboard |

Uses [`../client`](../client) (`AeonClient`) — no raw account wiring in the demo body.
