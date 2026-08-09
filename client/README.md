# AEON TypeScript Agent SDK

**Recommended client path for v0.1.**  
Covers all 16 instructions, PDA helpers, category encoding, and multi-level revoke planning.

| | |
|--|--|
| Import | `import { … } from "./client"` (in-repo) |
| Program ID | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| IDL | [`idl/aeon.json`](./idl/aeon.json) |
| Examples | [`examples/`](./examples/) |
| Unit tests | `npm run test:sdk` · `npm run typecheck:sdk` |

Product docs: [../docs/OVERVIEW.md](../docs/OVERVIEW.md) · [../docs/QUICKSTART.md](../docs/QUICKSTART.md) · [../docs/SECURITY_MODEL.md](../docs/SECURITY_MODEL.md)

---

## Install (in-repo)

```bash
cd aeon-program
npm install
# deps: @coral-xyz/anchor, @solana/web3.js, @solana/spl-token, bn.js
```

```ts
import { AeonClient, ROLE, CONDITION, categoryFromLabel } from "./client";
import * as anchor from "@coral-xyz/anchor";

const provider = anchor.AnchorProvider.env();
const aeon = AeonClient.fromProvider(provider);
// under anchor test:
// const aeon = AeonClient.fromWorkspace(anchor.workspace.Aeon, provider);
```

**Packaging note (v0.1):** the root package is `aeon-program` (`private: true`).  
The SDK is a **path import** (`./client`). A future `@aeon/agent-sdk` publish is optional stretch — not required for product surface.

---

## Public API (frozen for v0.1)

Import only from `client/index.ts` (or `./client`). Do not deep-import private paths in app code.

### Client

| Export | Kind | Role |
|--------|------|------|
| `AeonClient` | class | All 16 ixs + fetch + scan + `revokeTree` |
| `AeonClientOptions` | type | `provider`, optional `programId` / `idl` / `tokenProgram` |
| `AeonIdl` | type | IDL alias |

**Constructors**

- `AeonClient.fromProvider(provider, programId?, tokenProgram?)`
- `AeonClient.fromWorkspace(program, provider?, tokenProgram?)`
- `new AeonClient({ provider, programId?, idl?, tokenProgram? })`

**Instruction methods** — `initializeConfig`, `registerAgent`, `issueAuthority`, `revokeAuthority`, `pay`, `createEscrow`, `releaseEscrow`, `cancelEscrow`, `atomicSplit`, `createOrg`, `joinOrg`, `setMemberShare`, `depositToOrg`, `orgSplit`, `dissolveOrg`, `reclaimOrgResidual`

**Read helpers** — `fetchConfig`, `fetchAgent`, `fetchCri`, `fetchAuthority`, `fetchEscrow`, `fetchOrg`, `fetchOrgMember`, `nextIds`, `mintAddress`, `scanAuthorities`, `revokeTree`

**PDA address helpers on client** — `configAddress`, `agentAddress`, `criAddress`, `authorityAddress`, `escrowAddress`, `escrowVaultAddress`, `orgAddress`, `orgTreasuryAddress`, `orgMemberAddress`

### Constants

| Export | Role |
|--------|------|
| `AEON_PROGRAM_ID` | Default program pubkey |
| `MAX_AUTHORITY_DEPTH` | `3` |
| `MAX_CATEGORIES` | `8` |
| `MAX_BLOCKED_RECIPIENTS` | `4` |
| `MAX_SHARE_BPS` | `10000` |
| `DEFAULT_MIN_SOLVENCY_BPS` | config default |
| `AUTH_STATUS` | ACTIVE / REVOKED / EXPIRED / EXHAUSTED |
| `ESCROW_STATUS` | OPEN / RELEASED / CANCELLED / EXPIRED |
| `CONDITION` | IMMEDIATE / RECEIPT / ORACLE / MULTISIG / TIMEOUT |
| `ORG_STATUS` | ACTIVE / DISSOLVING / CLOSED |
| `ROLE` | ADMIN / MEMBER / VIEWER |
| `SEEDS` | PDA seed labels |

Types: `AuthStatus`, `EscrowStatus`, `ConditionType`, `OrgStatus`, `Role`

### PDAs

| Export | Role |
|--------|------|
| `pdas` | Object of address-only helpers |
| `configPda`, `agentPda`, `criPda`, `authorityPda`, `escrowPda`, `escrowVaultPda`, `orgPda`, `orgTreasuryPda`, `orgMemberPda`, `receiptPda` | `[PublicKey, bump]` tuples |
| `IdLike` | type for id args |

### Categories

| Export | Role |
|--------|------|
| `categoryFromLabel` | string → `[u8;16]` |
| `categoryToLabel` | decode helper |
| `zeroCategory` | empty category |
| `categoriesEqual` | equality |

### Revoke planning

| Export | Role |
|--------|------|
| `planRevokeTree` | deepest-first batches for a root |
| `nodesFromAuthorities` | `{ publicKey, account }[]` → nodes |
| `filterByAgent` | filter nodes by agent |
| `AuthorityNode`, `RevokeBatch` | types |

### Account / param types

`ConfigAccount`, `AgentIdentityAccount`, `CriAccount`, `AuthorityAccount`, `EscrowAccount`, `OrganizationAccount`, `OrgMemberAccount`, `IssueAuthorityParams`, `PayParams`, `CreateEscrowParams`, `CreateOrgParams`, `OrgSplitParams`, `DissolveOrgParams`, `AtomicSplitParams`, `AtomicSplitPayee`, `TxOpts`

### Examples (not re-exported from root index)

```ts
import {
  runMinimalPay,
  runEscrowLifecycle,
  runOrgSwarm,
  runRevokeTree,
  issueDepthThree,
  planRevoke,
} from "./client/examples";
```

See [`examples/README.md`](./examples/README.md).

---

## Quick start

```ts
// Bootstrap (admin once)
await aeon.initializeConfig(mint);

// Register wallet as agent
await aeon.registerAgent();

// Root authority
const { authorityId } = await aeon.issueAuthority({
  budget: 5_000_000,
  maxPerTx: 1_000_000,
  categories: [categoryFromLabel("compute")],
});

// Child authority under parent
const child = await aeon.issueAuthority({
  budget: 500_000,
  maxPerTx: 100_000,
  parentId: authorityId,
  categories: [categoryFromLabel("compute")],
});

// Pay under authority
await aeon.pay({
  amount: 10_000,
  payee,
  payerToken,
  payeeToken,
  authorityId,
  category: categoryFromLabel("compute"),
});

// Escrow lifecycle
const { escrowId } = await aeon.createEscrow({
  amount: 25_000,
  payee,
  payerToken,
  authorityId,
  conditionType: CONDITION.IMMEDIATE,
});
await aeon.releaseEscrow(escrowId, payeeToken);
// or: await aeon.cancelEscrow(escrowId, payerToken);

// Org swarm
const { orgId } = await aeon.createOrg({
  nameHash: Array(32).fill(1),
  creatorShareBps: 6000,
});
await aeon.joinOrg(orgId, memberB, ROLE.MEMBER, 3000);
await aeon.depositToOrg(orgId, 1_000_000, payerToken);
await aeon.orgSplit({
  orgId,
  amount: 100_000,
  recipient: memberB,
  recipientToken: memberBAta,
});
await aeon.dissolveOrg({
  orgId,
  adminToken: payerToken,
  memberB,
  memberBToken: memberBAta,
});
await aeon.reclaimOrgResidual(orgId, payerToken);
```

---

## Revoke tree

```ts
import { planRevokeTree, nodesFromAuthorities } from "./client";

// From scan + manual nodes, or example helper:
import { runRevokeTree, planRevoke } from "./client/examples";

const { plan, signatures } = await runRevokeTree(aeon, rootAuthorityId);

// Manual:
// const batches = planRevokeTree(nodes, rootId);
// for (const b of batches) {
//   await aeon.revokeAuthority(b.authorityId, b.children.map((c) => c.address));
// }
// or: await aeon.revokeTree(rootId, nodes);
```

Deepest-first ordering: leaves before ancestors. On-chain cascade only covers **direct** children per call.

---

## PDA helpers

```ts
import { pdas, AEON_PROGRAM_ID } from "./client";

pdas.config();
pdas.agent(wallet);
pdas.cri(wallet);
pdas.authority(1);
pdas.escrow(1);
pdas.escrowVault(1);
pdas.org(1);
pdas.orgTreasury(1);
pdas.orgMember(1, wallet);
```

---

## Token-2022

Pass `tokenProgram: TOKEN_2022_PROGRAM_ID` into the client constructor or per-call params (`pay`, `createEscrow`, `orgSplit`, …). Mint must match `config.aeonMint`.

```ts
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
const aeon = new AeonClient({
  provider,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
});
```

Hostile transfer-hook mints fail closed (spent unchanged) — see [SECURITY_MODEL](../docs/SECURITY_MODEL.md) and HEAVY hook suite.

---

## Modules

| File | Role |
|------|------|
| `aeon.ts` | `AeonClient` — all 16 ixs + fetch + scan |
| `pdas.ts` | PDA derivation |
| `constants.ts` | Status / role / seed constants |
| `category.ts` | `[u8;16]` encode/decode |
| `revokeTree.ts` | Deepest-first cascade planner |
| `types.ts` | Account + param types |
| `idl/aeon.json` | Bundled IDL |
| `index.ts` | **Public export surface (frozen)** |
| `examples/` | Composable recipes |

---

## Notes

- Client-supplied ids (`authorityId`, `escrowId`, `orgId`) default to `config.*_counter + 1`. Concurrent txs with the same id fail safely (account already in use); retry with a fresh counter.
- Soft parent budget: issuing a child does **not** reserve parent spent (NEG-AUTH-011 **ACCEPTED**).
- `org_split` is single-recipient per call (v0.1 named accounts).
- `dissolve_org` supports admin + optional second member.
- Do not regenerate the program keypair without an explicit owner decision.
