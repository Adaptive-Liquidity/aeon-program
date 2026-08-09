/**
 * AEON protocol constants — mirrors programs/aeon/src/constants.rs
 */

import { PublicKey } from "@solana/web3.js";

/** Default program id (matches declare_id! / IDL). */
export const AEON_PROGRAM_ID = new PublicKey(
  "8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn"
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
  ESCROW: "escrow",
  ESCROW_VAULT: "escrow_vault",
  ORG: "org",
  ORG_TREASURY: "org_treasury",
  ORG_MEMBER: "org_member",
  RECEIPT: "receipt",
} as const;

export type AuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];
export type EscrowStatus = (typeof ESCROW_STATUS)[keyof typeof ESCROW_STATUS];
export type ConditionType = (typeof CONDITION)[keyof typeof CONDITION];
export type OrgStatus = (typeof ORG_STATUS)[keyof typeof ORG_STATUS];
export type Role = (typeof ROLE)[keyof typeof ROLE];
