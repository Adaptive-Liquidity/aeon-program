# AEON v0.2.0 — Release Notes

**Date:** 2026-08-25  
**Tag:** `v0.2.0`  
**Codename:** Provenance & teeth  

AEON is the **economic control plane for autonomous AI agents** on Solana — not a yield product.

---

## Headline

v0.2 turns v0.1's scoped-spend surface into a full agent-economy stack with provenance,
operational safety controls, and economic consequences:

- **20 on-chain instructions** (+4): receipts, authority expiry, pause kill switch, bond slashing  
- **Hash-chained receipts** bound to each agent's CRI — tamper-evident action provenance computed by the program  
- **Slashable bonds** — authorities can carry collateral that fails closed when slashed  
- **Pause + expiry** — admin kill switch and scheduled authority sunset without account closes  
- **Fresh devnet deployment** under a new program ID (the v0.1 upgrade-authority wallet was lost)  
- **Safety evidence**: 68+ negative PASS · HEAVY CPI 8/8 · HEAVY hook 3/3 · Trident fuzz 200×40, 0 panics · v0.2 smoke suite PASS  

Full changelog: [`CHANGELOG.md`](../CHANGELOG.md)

---

## Coordinates (all environments)

| | |
|--|--|
| Program ID | `TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm` |
| Devnet config | `3oFvpSfXS6A4Bpotor2cqbcpwyhbeXPiaAXBnDExkPmp` |
| Devnet mint | `DaXLutwYNUJNsHRSwhYLefWgWFfDqm5J5g2vp4xhEVrS` |
| Upgrade authority | `4bpiP5ddQhEbYxtJJL1qTecvMzzqw38NafoqfUF6R6CY` |
| Cluster | `https://api.devnet.solana.com` |

> **Breaking:** `Authority` and `Cri` layouts changed → devnet was wiped and redeployed.
> There is no state migration from v0.1 deployments.

---

## What's new on-chain

| Instruction | What it does | Money path |
|-------------|--------------|------------|
| `create_receipt` | Hash-chained provenance receipt: `prev_hash` read from CRI, hash program-computed, sequence enforced | No |
| `expire_authority` | Scheduled expiry; preserves child/escrow/CRI anchors | No |
| `set_paused` | Admin pause/unpause; emits `ConfigPaused` / `ConfigUnpaused` | No |
| `slash_bond` | Slash an authority bond to a destination, fail-closed CPI | Yes |

State additions: `Authority.bond_amount`, `Cri.last_receipt_hash` / `receipt_count`,
new `AuthorityBond` account. `issue_authority` now accepts `bond_amount` and optionally
creates the bond + vault.

---

## Known limitations (do not overclaim)

- The four v0.2 instructions are implemented, fuzzed, and smoke-tested; their dedicated
  NEG-* catalog entries (~21 cases) are still landing. Receipts/bonds are **not**
  production-audited yet.
- Bond vault ATA initialization fix is tracked in
  [`PHASE2_BOND_VAULT_FIX.md`](./PHASE2_BOND_VAULT_FIX.md).
- Soft model unchanged: dual-child overissue (NEG-AUTH-011) remains ACCEPTED.
- Mainnet readiness and formal audit remain deferred stretch work.

Claim rules: [`SECURITY_MODEL.md §9`](./SECURITY_MODEL.md).

---

## Try it

```bash
npm run smoke:devnet    # register + issue + pay against the live v0.2 program
npm run demo:devnet     # escrow → org → dissolve end-to-end
```

Docs: [OVERVIEW](./OVERVIEW.md) · [QUICKSTART](./QUICKSTART.md) · [SECURITY_MODEL](./SECURITY_MODEL.md) · [FINAL_ARCHITECTURE](./FINAL_ARCHITECTURE.md)
