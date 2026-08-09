# AEON TypeScript Agent SDK

Client library for the AEON Anchor program — all 16 instructions, PDA helpers,
authority revoke tree walk, and category utilities.

## Install (in-repo)

```bash
cd aeon-program
# deps already in package.json (@coral-xyz/anchor, @solana/web3.js, bn.js, @solana/spl-token)
```

```ts
import { AeonClient, ROLE, CONDITION, categoryFromLabel } from "./client";
import * as anchor from "@coral-xyz/anchor";

const provider = anchor.AnchorProvider.env();
const aeon = AeonClient.fromProvider(provider);
```

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
});

// Child authority under parent
const child = await aeon.issueAuthority({
  budget: 500_000,
  maxPerTx: 100_000,
  parentId: authorityId,
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

## Revoke tree

```ts
const batches = await aeon.planRevoke(rootAuthorityId);
// or build nodes yourself and call:
// const sigs = await aeon.revokeTree(rootId, nodes);
for (const b of batches) {
  await aeon.revokeAuthority(
    b.authorityId,
    b.children.map((c) => c.address)
  );
}
```

Deepest-first ordering: leaves revoked before ancestors. On-chain cascade only
covers **direct** children per call; the planner handles multi-level walks.

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

## Token-2022

Pass `tokenProgram: TOKEN_2022_PROGRAM_ID` into the client constructor or per-call
params (`pay`, `createEscrow`, `orgSplit`, …). Mint must match `config.aeonMint`.

```ts
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
const aeon = new AeonClient({
  provider,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
});
```

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

## Notes

- Client-supplied ids (`authorityId`, `escrowId`, `orgId`) default to
  `config.*_counter + 1`. Concurrent txs with the same id fail safely
  (account already in use); retry with a fresh counter.
- Soft parent budget: issuing a child does **not** reserve parent spent.
- `org_split` is single-recipient per call (v0.1 named accounts).
- `dissolve_org` supports admin + optional second member.
