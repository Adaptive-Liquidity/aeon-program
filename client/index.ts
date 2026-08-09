/**
 * @aeon/agent-sdk — TypeScript Agent SDK for the AEON Solana program.
 *
 * @example
 * ```ts
 * import { AeonClient, ROLE, categoryFromLabel, CONDITION } from "../client";
 *
 * const aeon = AeonClient.fromProvider(provider);
 * await aeon.registerAgent();
 * const { authorityId } = await aeon.issueAuthority({
 *   budget: 1_000_000,
 *   maxPerTx: 100_000,
 *   categories: [categoryFromLabel("compute")],
 * });
 * await aeon.pay({
 *   amount: 1_000,
 *   payee,
 *   payerToken,
 *   payeeToken,
 *   authorityId,
 *   category: categoryFromLabel("compute"),
 * });
 * ```
 */

export { AeonClient } from "./aeon";
export type { AeonClientOptions, AeonIdl } from "./aeon";

export {
  AEON_PROGRAM_ID,
  MAX_AUTHORITY_DEPTH,
  MAX_CATEGORIES,
  MAX_BLOCKED_RECIPIENTS,
  MAX_SHARE_BPS,
  DEFAULT_MIN_SOLVENCY_BPS,
  AUTH_STATUS,
  ESCROW_STATUS,
  CONDITION,
  ORG_STATUS,
  ROLE,
  SEEDS,
} from "./constants";
export type {
  AuthStatus,
  EscrowStatus,
  ConditionType,
  OrgStatus,
  Role,
} from "./constants";

export {
  configPda,
  agentPda,
  criPda,
  authorityPda,
  escrowPda,
  escrowVaultPda,
  orgPda,
  orgTreasuryPda,
  orgMemberPda,
  receiptPda,
  pdas,
} from "./pdas";
export type { IdLike } from "./pdas";

export {
  zeroCategory,
  categoryFromLabel,
  categoriesEqual,
  categoryToLabel,
} from "./category";

export {
  planRevokeTree,
  nodesFromAuthorities,
  filterByAgent,
} from "./revokeTree";
export type { AuthorityNode, RevokeBatch } from "./revokeTree";

export type {
  ConfigAccount,
  AgentIdentityAccount,
  CriAccount,
  AuthorityAccount,
  EscrowAccount,
  OrganizationAccount,
  OrgMemberAccount,
  IssueAuthorityParams,
  PayParams,
  CreateEscrowParams,
  CreateOrgParams,
  OrgSplitParams,
  DissolveOrgParams,
  AtomicSplitParams,
  AtomicSplitPayee,
  TxOpts,
} from "./types";
