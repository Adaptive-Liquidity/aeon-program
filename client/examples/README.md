# AEON SDK examples

Composable TypeScript recipes over `AeonClient`. They **typecheck** with the SDK
and are meant to be imported — not run as a standalone CLI.

| File | Recipe |
|------|--------|
| [`01-minimal-pay.ts`](./01-minimal-pay.ts) | Issue root authority → `pay` |
| [`02-escrow-lifecycle.ts`](./02-escrow-lifecycle.ts) | `create_escrow` → release or cancel |
| [`03-org-swarm.ts`](./03-org-swarm.ts) | create → join → deposit → split → dissolve → reclaim |
| [`04-revoke-tree.ts`](./04-revoke-tree.ts) | depth-3 issue + deepest-first revoke plan/execute |

```ts
import { AeonClient } from "../index";
import { runMinimalPay, runEscrowLifecycle, runOrgSwarm, runRevokeTree } from "./index";

const aeon = AeonClient.fromProvider(provider);
// ensure registerAgent + funded ATAs first
const { authorityId } = await runMinimalPay(aeon, { payee, payerToken, payeeToken });
await runEscrowLifecycle(aeon, { payee, payerToken, payeeToken, authorityId });
```

## Full narratives (validator)

| Command | What it runs |
|---------|----------------|
| `npm run demo:economy` | Localnet 9-act demo using the SDK |
| `npm run demo:devnet` | Live devnet escrow → org → dissolve |
| `npm run test:e2e` | Positive e2e suite |

## Notes

- Examples do **not** bootstrap mint/config — pass a ready `AeonClient` and ATAs.
- Org dissolve in v0.1 supports admin + optional second member named accounts.
- Revoke cascade is one hop on-chain; use `planRevoke` / `runRevokeTree` for multi-level trees.
- Soft dual-child overissue (NEG-AUTH-011) is ACCEPTED — see `docs/SECURITY_MODEL.md`.
