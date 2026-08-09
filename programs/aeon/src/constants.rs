//! PDA seeds and protocol constants.

/// Max hierarchical authority depth (root depth = 0).
pub const MAX_AUTHORITY_DEPTH: u8 = 3;

/// Max category tags on an authority.
pub const MAX_CATEGORIES: usize = 8;

/// Max blocked recipients on an authority.
pub const MAX_BLOCKED_RECIPIENTS: usize = 4;

/// Default min solvency in basis points (10000 = 1.0).
pub const DEFAULT_MIN_SOLVENCY_BPS: u16 = 10_000;

/// Authority status codes.
pub const AUTH_STATUS_ACTIVE: u8 = 0;
pub const AUTH_STATUS_REVOKED: u8 = 1;
pub const AUTH_STATUS_EXPIRED: u8 = 2;
pub const AUTH_STATUS_EXHAUSTED: u8 = 3;

/// Escrow status codes.
pub const ESCROW_STATUS_OPEN: u8 = 0;
pub const ESCROW_STATUS_RELEASED: u8 = 1;
pub const ESCROW_STATUS_CANCELLED: u8 = 2;
pub const ESCROW_STATUS_EXPIRED: u8 = 3;

/// Escrow condition types.
pub const CONDITION_IMMEDIATE: u8 = 0;
pub const CONDITION_RECEIPT: u8 = 1;
pub const CONDITION_ORACLE: u8 = 2;
pub const CONDITION_MULTISIG: u8 = 3;
pub const CONDITION_TIMEOUT: u8 = 4;

/// Org status codes.
pub const ORG_STATUS_ACTIVE: u8 = 0;
pub const ORG_STATUS_DISSOLVING: u8 = 1;
pub const ORG_STATUS_CLOSED: u8 = 2;

/// Org member roles.
pub const ROLE_ADMIN: u8 = 0;
pub const ROLE_MEMBER: u8 = 1;
pub const ROLE_VIEWER: u8 = 2;

/// PDA seeds.
pub const SEED_CONFIG: &[u8] = b"aeon_config";
pub const SEED_AGENT: &[u8] = b"agent";
pub const SEED_CRI: &[u8] = b"cri";
pub const SEED_AUTHORITY: &[u8] = b"authority";
pub const SEED_ESCROW: &[u8] = b"escrow";
pub const SEED_ESCROW_VAULT: &[u8] = b"escrow_vault";
pub const SEED_ORG: &[u8] = b"org";
pub const SEED_ORG_TREASURY: &[u8] = b"org_treasury";
pub const SEED_ORG_MEMBER: &[u8] = b"org_member";
pub const SEED_RECEIPT: &[u8] = b"receipt";
