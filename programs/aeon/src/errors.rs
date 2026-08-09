use anchor_lang::prelude::*;

#[error_code]
pub enum AeonError {
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Agent already registered")]
    AgentAlreadyRegistered,
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Invalid budget")]
    InvalidBudget,
    #[msg("Max delegation depth exceeded")]
    MaxDelegationDepth,
    #[msg("Parent authority is not active")]
    ParentNotActive,
    #[msg("Child budget exceeds parent remaining")]
    ChildBudgetExceedsParent,
    #[msg("Authority is not active")]
    AuthorityNotActive,
    #[msg("Authority has expired")]
    AuthorityExpired,
    #[msg("Invalid category count (max 8)")]
    InvalidCategoryCount,
    #[msg("Invalid blocked recipient count (max 4)")]
    InvalidBlockedCount,
    #[msg("Parent authority not provided")]
    ParentRequired,
    #[msg("Parent authority id mismatch")]
    ParentIdMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Exceeds max per transaction")]
    ExceedsMaxPerTx,
    #[msg("Exceeds max total")]
    ExceedsMaxTotal,
    #[msg("Insufficient authority budget")]
    InsufficientBudget,
    #[msg("Category not allowed")]
    CategoryNotAllowed,
    #[msg("Recipient is blocked")]
    RecipientBlocked,
    #[msg("Authority required for this spend")]
    AuthorityRequired,
    #[msg("Authority agent mismatch")]
    AuthorityAgentMismatch,
    #[msg("Category intersection empty under parent policy")]
    EmptyCategoryIntersection,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Token transfer failed")]
    TokenTransferFailed,
    #[msg("Authority already revoked")]
    AuthorityAlreadyRevoked,
    #[msg("Invalid cascade child account")]
    InvalidCascadeChild,
    #[msg("Escrow is not open")]
    EscrowNotOpen,
    #[msg("Escrow condition not satisfied")]
    EscrowConditionFailed,
    #[msg("Escrow has expired")]
    EscrowExpired,
    #[msg("Only payer may cancel this escrow")]
    EscrowCancelUnauthorized,
    #[msg("Escrow id mismatch")]
    EscrowIdMismatch,
    #[msg("Organization is not active")]
    OrgNotActive,
    #[msg("Treasury conservation violated")]
    TreasuryConservation,
    #[msg("Invalid remaining accounts layout")]
    InvalidRemainingAccounts,
    #[msg("Invalid share_bps")]
    InvalidShareBps,
    #[msg("share_bps sum would exceed 10000")]
    ShareBpsExceedsMax,
    #[msg("Organization is not closed")]
    OrgNotClosed,
}
