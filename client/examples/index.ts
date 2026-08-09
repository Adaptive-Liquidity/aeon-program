/**
 * AEON Agent SDK — example recipes (typed, composable).
 *
 * These are not mocha suites. Import into demos/tests/agent runtimes:
 *
 *   import { runMinimalPay } from "./client/examples";
 *
 * Full end-to-end narratives:
 *   npm run demo:economy   # localnet
 *   npm run demo:devnet    # live escrow → org → dissolve
 */

export { runMinimalPay } from "./01-minimal-pay";
export type { MinimalPayInput, MinimalPayResult } from "./01-minimal-pay";

export { runEscrowLifecycle } from "./02-escrow-lifecycle";
export type {
  EscrowLifecycleInput,
  EscrowLifecycleResult,
} from "./02-escrow-lifecycle";

export { runOrgSwarm } from "./03-org-swarm";
export type { OrgMemberSpec, OrgSwarmInput, OrgSwarmResult } from "./03-org-swarm";

export {
  issueDepthThree,
  authorityAccountsToNodes,
  planRevoke,
  runRevokeTree,
} from "./04-revoke-tree";
export type {
  IssueHierarchyInput,
  IssueHierarchyResult,
} from "./04-revoke-tree";
