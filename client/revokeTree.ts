/**
 * Client-side multi-level revoke tree walk.
 *
 * On-chain revoke_authority can soft-revoke a target and optionally cascade to
 * **direct children** via remaining_accounts. Deeper descendants need another
 * call. This helper:
 *  1. Discovers authorities for an agent (by scanning known IDs or provided list)
 *  2. Builds the parent→children tree
 *  3. Returns deepest-first revoke batches (each batch = one parent + its children)
 *
 * Usage with AeonClient.revokeAuthority(..., remainingChildren).
 */

import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import { AUTH_STATUS } from "./constants";
import type { AuthorityAccount } from "./types";

export interface AuthorityNode {
  authorityId: number;
  parentId: number;
  depth: number;
  status: number;
  address: PublicKey;
  agent: PublicKey;
}

export interface RevokeBatch {
  /** Target to revoke (parent of this cascade level). */
  authorityId: number;
  address: PublicKey;
  /** Direct Active children to pass as remaining_accounts. */
  children: { authorityId: number; address: PublicKey }[];
}

function idNum(id: BN | number): number {
  return typeof id === "number" ? id : Number(id.toString(10));
}

/**
 * Build a deepest-first revoke plan for a root authority.
 * Children of depth N are revoked before their ancestors.
 *
 * Example tree: root(1) → child(2) → grand(3)
 * Plan:
 *   1. revoke 2 with remaining=[3]
 *   2. revoke 1 with remaining=[2]  (2 already revoked — cascade skips non-Active)
 *
 * Or more efficiently (deepest first leaves):
 *   1. revoke 3 (no children)
 *   2. revoke 2 (children empty or already revoked)
 *   3. revoke 1
 *
 * This implementation uses **leaf-up**: revoke deepest Active nodes first so
 * a single soft cascade level is enough when remaining is empty, OR you can
 * pass direct children for one-hop cascade.
 */
export function planRevokeTree(
  nodes: AuthorityNode[],
  rootAuthorityId: number
): RevokeBatch[] {
  const byId = new Map<number, AuthorityNode>();
  const childrenOf = new Map<number, AuthorityNode[]>();

  for (const n of nodes) {
    byId.set(n.authorityId, n);
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    if (n.parentId !== 0) {
      childrenOf.get(n.parentId)!.push(n);
    }
  }

  if (!byId.has(rootAuthorityId)) {
    throw new Error(`Root authority ${rootAuthorityId} not in node set`);
  }

  // Collect subtree under root (inclusive).
  const subtree: AuthorityNode[] = [];
  const stack = [rootAuthorityId];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    subtree.push(node);
    for (const c of childrenOf.get(id) ?? []) {
      stack.push(c.authorityId);
    }
  }

  // Deepest first, then by id for stability.
  subtree.sort((a, b) => b.depth - a.depth || b.authorityId - a.authorityId);

  const batches: RevokeBatch[] = [];
  for (const node of subtree) {
    if (node.status !== AUTH_STATUS.ACTIVE) continue;
    const kids = (childrenOf.get(node.authorityId) ?? [])
      .filter((c) => c.status === AUTH_STATUS.ACTIVE)
      .map((c) => ({ authorityId: c.authorityId, address: c.address }));
    batches.push({
      authorityId: node.authorityId,
      address: node.address,
      children: kids,
    });
  }
  return batches;
}

/**
 * Convert fetched Anchor Authority accounts into AuthorityNode list.
 */
export function nodesFromAuthorities(
  accounts: { publicKey: PublicKey; account: AuthorityAccount }[]
): AuthorityNode[] {
  return accounts.map(({ publicKey, account }) => ({
    authorityId: idNum(account.authorityId),
    parentId: idNum(account.parentId),
    depth: account.depth,
    status: account.status,
    address: publicKey,
    agent: account.agent,
  }));
}

/**
 * Filter nodes belonging to one agent.
 */
export function filterByAgent(
  nodes: AuthorityNode[],
  agent: PublicKey
): AuthorityNode[] {
  const key = agent.toBase58();
  return nodes.filter((n) => n.agent.toBase58() === key);
}
