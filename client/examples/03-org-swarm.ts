/**
 * Example 03 — Org swarm: create → join → deposit → split → dissolve → reclaim
 *
 * Share_bps conservation: sum of member shares must stay ≤ 10000.
 * Dissolve requires the complete share set (admin + members in remaining accounts).
 *
 * Full localnet narrative: `npm run demo:economy` (Act 7)
 * Live: `npm run demo:devnet`
 */

import type { PublicKey, TransactionSignature } from "@solana/web3.js";
import type { AeonClient } from "../aeon";
import { ROLE } from "../constants";

export interface OrgMemberSpec {
  agent: PublicKey;
  token: PublicKey;
  /** Share in bps (1_0000 = 100%). */
  shareBps: number;
  role?: number;
}

export interface OrgSwarmInput {
  /** 32-byte name hash (padded if shorter). */
  nameHash?: number[] | Uint8Array;
  /** Creator share bps at create_org. */
  creatorShareBps: number;
  /** Additional members (admin is the client wallet). */
  members: OrgMemberSpec[];
  /** Admin/creator ATA for deposit, dissolve, reclaim. */
  adminToken: PublicKey;
  depositAmount: number;
  /** Single-recipient org_split amount (v0.1). */
  splitAmount: number;
  splitRecipient: PublicKey;
  splitRecipientToken: PublicKey;
}

export interface OrgSwarmResult {
  orgId: number;
  createSig: TransactionSignature;
  joinSigs: TransactionSignature[];
  depositSig: TransactionSignature;
  splitSig: TransactionSignature;
  dissolveSig: TransactionSignature;
  reclaimSig: TransactionSignature;
}

function padNameHash(src?: number[] | Uint8Array): number[] {
  const out = new Array(32).fill(0);
  if (!src) {
    out[0] = 1;
    return out;
  }
  const arr = Array.from(src);
  for (let i = 0; i < Math.min(32, arr.length); i++) out[i] = arr[i];
  return out;
}

/**
 * Run a full org lifecycle with one optional second member on dissolve
 * (v0.1 named accounts support admin + memberB).
 */
export async function runOrgSwarm(
  aeon: AeonClient,
  input: OrgSwarmInput
): Promise<OrgSwarmResult> {
  const totalMemberBps = input.members.reduce((s, m) => s + m.shareBps, 0);
  if (input.creatorShareBps + totalMemberBps > 10_000) {
    throw new Error(
      `share_bps sum ${input.creatorShareBps + totalMemberBps} exceeds 10000`
    );
  }

  const { orgId, signature: createSig } = await aeon.createOrg({
    nameHash: padNameHash(input.nameHash),
    creatorShareBps: input.creatorShareBps,
  });

  const joinSigs: TransactionSignature[] = [];
  for (const m of input.members) {
    const sig = await aeon.joinOrg(
      orgId,
      m.agent,
      m.role ?? ROLE.MEMBER,
      m.shareBps
    );
    joinSigs.push(sig);
  }

  const depositSig = await aeon.depositToOrg(
    orgId,
    input.depositAmount,
    input.adminToken
  );

  const splitSig = await aeon.orgSplit({
    orgId,
    amount: input.splitAmount,
    recipient: input.splitRecipient,
    recipientToken: input.splitRecipientToken,
  });

  // v0.1 dissolve: admin + optional second member
  const memberB = input.members[0];
  const dissolveSig = await aeon.dissolveOrg({
    orgId,
    adminToken: input.adminToken,
    memberB: memberB?.agent,
    memberBToken: memberB?.token,
  });

  const reclaimSig = await aeon.reclaimOrgResidual(orgId, input.adminToken);

  return {
    orgId,
    createSig,
    joinSigs,
    depositSig,
    splitSig,
    dissolveSig,
    reclaimSig,
  };
}
