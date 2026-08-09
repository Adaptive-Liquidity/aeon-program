# AEON Quickstart

Land a scoped **pay** on localnet in under 10 minutes using the TypeScript Agent SDK.

**Prerequisites:** Solana CLI, Anchor 0.30.1, Node 18+, Rust toolchain (for SBF build).  
**Do not** invent a new program ID — use the repo keypair and `declare_id!`.

For product context: [OVERVIEW.md](./OVERVIEW.md).  
For invariants: [SECURITY_MODEL.md](./SECURITY_MODEL.md).  
For SDK API: [`client/README.md`](../client/README.md) · examples: [`client/examples/`](../client/examples/)

---

## 1. Clone and install

```bash
git clone https://github.com/Adaptive-Liquidity/aeon-program.git
cd aeon-program
npm install
```

---

## 2. Build the program (SBF)

Full `anchor build` IDL regeneration can fail on newer rustc (`anchor-syn` / `Span::source_file`).  
**Canonical path:**

```bash
npm run build:sbf
# → target/deploy/aeon.so
# IDL is committed: client/idl/aeon.json (address must match declare_id!)
```

Program ID (all clusters in this repo):

```
8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn
```

---

## 3. Fastest path: agent economy demo

One command boots a fresh validator, deploys `aeon.so`, and runs a 9-act SDK narrative (register → authority → pay → escrow → org → revoke):

```bash
npm run demo:economy
```

If that passes, your toolchain is good. Skip to [§6](#6-use-the-sdk-in-your-code) for embedding.

---

## 4. Positive e2e suite

```bash
npm run test:e2e
# or: anchor test --skip-build -- --grep 'aeon e2e'
```

Runs `tests/aeon.ts` against localnet via Anchor’s test harness.

---

## 5. Minimal pay (SDK sketch)

This is the shape used inside demos and tests. You need a funded wallet, a mint (or use the test harness mint), and ATAs.

```ts
import * as anchor from "@coral-xyz/anchor";
import { AeonClient, categoryFromLabel } from "./client";
// or composable recipe:
// import { runMinimalPay } from "./client/examples";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const aeon = AeonClient.fromProvider(provider);

// --- once per protocol (admin) ---
// await aeon.initializeConfig(mintPubkey);

// --- each agent wallet ---
await aeon.registerAgent();

// Root authority: budget and max-per-tx in base units of aeon_mint
const { authorityId } = await aeon.issueAuthority({
  budget: 1_000_000,
  maxPerTx: 100_000,
  categories: [categoryFromLabel("compute")],
});

// Pay under authority (payer/payee ATAs must be for config.aeon_mint)
await aeon.pay({
  amount: 1_000,
  payee,           // PublicKey
  payerToken,      // ATA of signer
  payeeToken,      // ATA of payee
  authorityId,
  category: categoryFromLabel("compute"),
});
```

### Child authority

```ts
const child = await aeon.issueAuthority({
  budget: 100_000,
  maxPerTx: 50_000,
  parentId: authorityId,
  categories: [categoryFromLabel("compute")],
});
```

Rules (enforced on-chain):

- Child depth = parent.depth + 1, and depth ≤ 3  
- Child budget ≤ parent remaining (`budget - spent`)  
- Category sets must intersect (or parent allows all)  
- Same agent as parent  

### Escrow / org / revoke recipes

```ts
import {
  runEscrowLifecycle,
  runOrgSwarm,
  runRevokeTree,
  issueDepthThree,
} from "./client/examples";

await runEscrowLifecycle(aeon, {
  payee,
  payerToken,
  payeeToken,
  authorityId,
});

// org: see client/examples/03-org-swarm.ts
// revoke: const { rootId } = await issueDepthThree(aeon);
//         await runRevokeTree(aeon, rootId);
```

---

## 6. Use the SDK in your code

| Import | Role |
|--------|------|
| `AeonClient` | All 16 instructions + fetch helpers |
| `pdas` / `pdas.*` | PDA derivation |
| `categoryFromLabel` | Encode category `[u8;16]` |
| `CONDITION`, `ROLE`, `AUTH_STATUS` | Enums matching on-chain |
| `planRevokeTree` | Offline cascade planning |

Full frozen API: [`client/README.md`](../client/README.md).

```ts
import {
  AeonClient,
  AEON_PROGRAM_ID,
  categoryFromLabel,
  CONDITION,
  ROLE,
  pdas,
} from "./client";
```

**Token-2022:** pass `tokenProgram: TOKEN_2022_PROGRAM_ID` into the client or per call. Mint must still equal `config.aeonMint`.

---

## 7. Devnet (already live)

You do **not** need to redeploy to explore the live program.

| Field | Value |
|-------|--------|
| Program | `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn` |
| Config | `JCbqqJxxCzYzfs1YK3FDD5ZvW66ZbMNq82u3gto1Pmok` |
| Mint | `CBVW7hZ14AUkZM2AUYs44J83GgzyY891ugknDSbQJpTz` |
| RPC | `https://api.devnet.solana.com` |

```bash
# Requires funded CLI wallet (~/.config/solana/id.json)
npm run smoke:devnet    # register + issue + pay (reuses config)
npm run demo:devnet     # escrow → org → dissolve end-to-end
```

Details and explorer links: [DEVNET.md](./DEVNET.md).

---

## 8. Safety checks (optional but recommended)

```bash
npm run test:sdk          # unit tests for PDAs / helpers / example planner
npm run typecheck:sdk
npm run test:negative     # full negative + HEAVY catalog (longer)
npm run test:fuzz:p2      # Trident cascade / spent (optional, heavy)
```

Catalog: [stoa/CASE_CATALOG.md](./stoa/CASE_CATALOG.md).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `anchor build` fails on IDL / `source_file` | Use `npm run build:sbf`; keep committed IDL |
| Program ID mismatch | Do not regenerate keypair; keep `8i5E3R2…` everywhere |
| `Account already in use` on issue/escrow/org | Concurrent id; retry after fetching config counters |
| Pay fails with category error | Category must be in authority’s set (use same `categoryFromLabel`) |
| Token CPI fails, spent unchanged | **Expected** fail-closed behavior — see [SECURITY_MODEL.md](./SECURITY_MODEL.md) |
| Devnet 429 | Scripts retry; wait and re-run `smoke:devnet` / `demo:devnet` |

---

## What you should not do

- Claim AEON pays yield, APY, or emissions  
- Rotate the program keypair without an explicit owner decision (breaks live devnet)  
- Treat soft dual-child overissue (NEG-AUTH-011) as a hard reject in v0.1  
- Bypass the SDK with raw account lists unless you fully understand remaining_accounts cascade rules  

Next: [OVERVIEW.md](./OVERVIEW.md) · [SECURITY_MODEL.md](./SECURITY_MODEL.md) · [client/README.md](../client/README.md)
