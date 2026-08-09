/**
 * Lightweight account shapes (camelCase as returned by Anchor account fetch).
 */

import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";

export interface ConfigAccount {
  admin: PublicKey;
  aeonMint: PublicKey;
  authorityCounter: BN;
  escrowCounter: BN;
  orgCounter: BN;
  receiptCounter: BN;
  minSolvencyBps: number;
  paused: boolean;
  bump: number;
}

export interface AgentIdentityAccount {
  agent: PublicKey;
  createdSlot: BN;
  active: boolean;
  metadataUriHash: number[];
  bump: number;
}

export interface CriAccount {
  agent: PublicKey;
  successfulSettlements: BN;
  failedSettlements: BN;
  successfulCommitments: BN;
  failedCommitments: BN;
  volumeSettled: BN;
  lastActiveSlot: BN;
  createdSlot: BN;
  bump: number;
}

export interface AuthorityAccount {
  authorityId: BN;
  agent: PublicKey;
  parentId: BN;
  depth: number;
  budget: BN;
  spent: BN;
  maxPerTx: BN;
  maxTotal: BN;
  categoryCount: number;
  categories: number[][];
  blockedCount: number;
  blockedRecipients: PublicKey[];
  requireMinReserve: BN;
  expirySlot: BN;
  status: number;
  bump: number;
}

export interface EscrowAccount {
  escrowId: BN;
  payer: PublicKey;
  payee: PublicKey;
  amount: BN;
  authorityId: BN;
  category: number[];
  conditionType: number;
  conditionData: number[];
  status: number;
  createdSlot: BN;
  expirySlot: BN;
  vaultBump: number;
  bump: number;
}

export interface OrganizationAccount {
  orgId: BN;
  nameHash: number[];
  creator: PublicKey;
  memberCount: number;
  totalShareBps: number;
  status: number;
  createdSlot: BN;
  treasuryBump: number;
  bump: number;
}

export interface OrgMemberAccount {
  orgId: BN;
  agent: PublicKey;
  role: number;
  shareBps: number;
  bump: number;
}

export interface IssueAuthorityParams {
  /** Omit or 0 to auto-use config.authorityCounter + 1 */
  authorityId?: number | BN;
  budget: number | BN;
  maxPerTx: number | BN;
  maxTotal?: number | BN;
  categories?: number[][];
  parentId?: number | BN;
  expirySlot?: number | BN;
}

export interface PayParams {
  amount: number | BN;
  payee: PublicKey;
  payerToken: PublicKey;
  payeeToken: PublicKey;
  /** 0 = no authority gate */
  authorityId?: number | BN;
  category?: number[];
  aeonMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface CreateEscrowParams {
  amount: number | BN;
  payee: PublicKey;
  payerToken: PublicKey;
  escrowId?: number | BN;
  authorityId?: number | BN;
  category?: number[];
  conditionType?: number;
  conditionData?: number[];
  expirySlot?: number | BN;
  aeonMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface CreateOrgParams {
  nameHash: number[] | Uint8Array;
  creatorShareBps?: number;
  orgId?: number | BN;
  aeonMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface OrgSplitParams {
  orgId: number | BN;
  amount: number | BN;
  recipient: PublicKey;
  recipientToken: PublicKey;
  aeonMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface DissolveOrgParams {
  orgId: number | BN;
  adminToken: PublicKey;
  /** Optional second member + ATA (v0.1 supports up to 2 named members) */
  memberB?: PublicKey;
  memberBToken?: PublicKey;
  aeonMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface AtomicSplitPayee {
  payee: PublicKey;
  token: PublicKey;
  amount: number | BN;
}

export interface AtomicSplitParams {
  payees: AtomicSplitPayee[];
  payerToken: PublicKey;
  authorityId?: number | BN;
  category?: number[];
  aeonMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface TxOpts {
  /** Extra signers (agent keypairs that are not the provider wallet). */
  signers?: import("@solana/web3.js").Signer[];
  skipPreflight?: boolean;
}
