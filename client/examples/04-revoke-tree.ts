/**
 * Example 04 — Hierarchical authority revoke (deepest-first)
 *
 * On-chain `revoke_authority` cascades to **direct children only** via
 * remaining_accounts. Multi-level trees need a client plan:
 *   planRevokeTree → revokeAuthority(parent, childAddresses)
 * or AeonClient.revokeTree(rootId, nodes).
 *
 * Full localnet narrative: `npm run demo:economy` (Act 8)
 */

import type { PublicKey, TransactionSignature } from "@solana/web3.js";
import type { AeonClient } from "../aeon";
import { categoryFromLabel } from "../category";
import {
  planRevokeTree,
  type AuthorityNode,
  type RevokeBatch,
} from "../revokeTree";
import type { AuthorityAccount } from "../types";

export interface IssueHierarchyInput {
  /** Root budget (base units). */
  rootBudget?: number;
  childBudget?: number;
  grandBudget?: number;
  categoryLabel?: string;
}

export interface IssueHierarchyResult {
  rootId: number;
  childId: number;
  grandId: number;
}

/**
 * Issue root → child → grandchild (depth 0/1/2) for revoke demos.
 */
export async function issueDepthThree(
  aeon: AeonClient,
  input: IssueHierarchyInput = {}
): Promise<IssueHierarchyResult> {
  const cat = categoryFromLabel(input.categoryLabel ?? "compute");
  const rootBudget = input.rootBudget ?? 1_000_000;
  const childBudget = input.childBudget ?? 200_000;
  const grandBudget = input.grandBudget ?? 50_000;

  const root = await aeon.issueAuthority({
    budget: rootBudget,
    maxPerTx: rootBudget,
    categories: [cat],
  });
  const child = await aeon.issueAuthority({
    budget: childBudget,
    maxPerTx: childBudget,
    parentId: root.authorityId,
    categories: [cat],
  });
  const grand = await aeon.issueAuthority({
    budget: grandBudget,
    maxPerTx: grandBudget,
    parentId: child.authorityId,
    categories: [cat],
  });

  return {
    rootId: root.authorityId,
    childId: child.authorityId,
    grandId: grand.authorityId,
  };
}

/**
 * Map fetched authority accounts + derived PDAs into planner nodes.
 * (`nodesFromAuthorities` expects `{ publicKey, account }` program-account pairs;
 *  `scanAuthorities` returns bare accounts — use this helper instead.)
 */
export function authorityAccountsToNodes(
  aeon: AeonClient,
  accounts: AuthorityAccount[]
): AuthorityNode[] {
  return accounts.map((account) => {
    const authorityId =
      typeof account.authorityId === "number"
        ? account.authorityId
        : Number(account.authorityId.toString(10));
    const parentId =
      typeof account.parentId === "number"
        ? account.parentId
        : Number(account.parentId.toString(10));
    return {
      authorityId,
      parentId,
      depth: account.depth,
      status: account.status,
      address: aeon.authorityAddress(authorityId),
      agent: account.agent,
    };
  });
}

/**
 * Offline plan only — no RPC. Useful for unit tests and dry-runs.
 */
export function planRevoke(
  nodes: AuthorityNode[],
  rootId: number
): RevokeBatch[] {
  return planRevokeTree(nodes, rootId);
}

/**
 * Execute deepest-first revoke for a root subtree.
 */
export async function runRevokeTree(
  aeon: AeonClient,
  rootId: number,
  /** Inclusive max authority id to scan (defaults to rootId + 16). */
  scanMaxId?: number
): Promise<{ plan: RevokeBatch[]; signatures: TransactionSignature[] }> {
  const maxId = scanMaxId ?? rootId + 16;
  const accounts = await aeon.scanAuthorities(maxId, aeon.walletPubkey);
  const nodes = authorityAccountsToNodes(aeon, accounts);
  const plan = planRevokeTree(nodes, rootId);
  const signatures = await aeon.revokeTree(rootId, nodes);
  return { plan, signatures };
}

/** Re-export planner types for example consumers. */
export type { AuthorityNode, RevokeBatch, PublicKey };
