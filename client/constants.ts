/**
 * AEON protocol constants — mirrors programs/aeon/src/constants.rs
 */

import { PublicKey } from "@solana/web3.js";

/** Default program id (matches declare_id! / IDL). */
export const AEON_PROGRAM_ID = new PublicKey(
  "TcZ9MKNw4eGvoe3K75e4M3zCwZCzEsb6WvrS8LqNgdm"
);

export const MAX_AUTHORITY_DEPTH = 3;
export const MAX_CATEGORIES = 8;
export const MAX_BLOCKED_RECIPIENTS = 4;
export const DEFAULT_MIN_SOLVENCY_BPS = 10_000;
export const MAX_SHARE_BPS = 10_000;

/** Authority status */
export const AUTH_STATUS = {
  ACTIVE: 0,
  REVOKED: 1,
  EXPIRED: 2,
  EXHAUSTED: 3,
} as const;

/** Escrow status */
export const ESCROW_STATUS = {
  OPEN: 0,
  RELEASED: 1,
  CANCELLED: 2,
  EXPIRED: 3,
} as const;

/** Escrow condition types */
export const CONDITION = {
  IMMEDIATE: 0,
  RECEIPT: 1,
  ORACLE: 2,
  MULTISIG: 3,
  TIMEOUT: 4,
} as const;

/** Receipt types (v0.2) */
export const RECEIPT_TYPE = {
  PAY: 0,
  ATOMIC_SPLIT: 1,
} as const;

/** Bond status (v0.2) */
export const BOND_STATUS = {
  ACTIVE: 0,
  SLASHED: 1,
} as const;

/** Org status */
export const ORG_STATUS = {
  ACTIVE: 0,
  DISSOLVING: 1,
  CLOSED: 2,
} as const;

/** Org member roles */
export const ROLE = {
  ADMIN: 0,
  MEMBER: 1,
  VIEWER: 2,
} as const;

/** PDA seed labels (UTF-8 bytes) */
export const SEEDS = {
  CONFIG: "aeon_config",
  AGENT: "agent",
  CRI: "cri",
  AUTHORITY: "authority",
  AUTHORITY_BOND: "authority_bond",
  ESCROW: "escrow",
  ESCROW_VAULT: "escrow_vault",
  ORG: "org",
  ORG_TREASURY: "org_treasury",
  ORG_MEMBER: "org_member",
  RECEIPT: "receipt",
  ORACLE_ENTRY: "oracle_entry",
} as const;

export type AuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];
export type EscrowStatus = (typeof ESCROW_STATUS)[keyof typeof ESCROW_STATUS];
export type ConditionType = (typeof CONDITION)[keyof typeof CONDITION];
export type ReceiptType = (typeof RECEIPT_TYPE)[keyof typeof RECEIPT_TYPE];
export type BondStatus = (typeof BOND_STATUS)[keyof typeof BOND_STATUS];
export type OrgStatus = (typeof ORG_STATUS)[keyof typeof ORG_STATUS];
export type Role = (typeof ROLE)[keyof typeof ROLE];
