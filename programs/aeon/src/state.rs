use anchor_lang::prelude::*;

use crate::constants::{MAX_BLOCKED_RECIPIENTS, MAX_CATEGORIES};

/// Global protocol configuration.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub aeon_mint: Pubkey,
    pub authority_counter: u64,
    pub escrow_counter: u64,
    pub org_counter: u64,
    pub receipt_counter: u64,
    pub min_solvency_bps: u16,
    pub paused: bool,
    pub bump: u8,
}

/// On-chain agent registry entry.
#[account]
#[derive(InitSpace)]
pub struct AgentIdentity {
    pub agent: Pubkey,
    pub created_slot: u64,
    pub active: bool,
    pub metadata_uri_hash: [u8; 32],
    pub bump: u8,
}

/// Cryptographic Reputation Index — non-transferable, bound to agent.
#[account]
#[derive(InitSpace)]
pub struct Cri {
    pub agent: Pubkey,
    pub successful_settlements: u64,
    pub failed_settlements: u64,
    pub successful_commitments: u64,
    pub failed_commitments: u64,
    pub volume_settled: u64,
    pub last_active_slot: u64,
    pub created_slot: u64,
    pub bump: u8,
}

/// Scoped spending authority with hierarchical delegation.
#[account]
#[derive(InitSpace)]
pub struct Authority {
    pub authority_id: u64,
    pub agent: Pubkey,
    /// 0 = root (no parent).
    pub parent_id: u64,
    /// Root depth = 0; max = 3.
    pub depth: u8,
    pub budget: u64,
    pub spent: u64,
    pub max_per_tx: u64,
    pub max_total: u64,
    pub category_count: u8,
    pub categories: [[u8; 16]; MAX_CATEGORIES],
    pub blocked_count: u8,
    pub blocked_recipients: [Pubkey; MAX_BLOCKED_RECIPIENTS],
    pub require_min_reserve: u64,
    /// 0 = never expires.
    pub expiry_slot: u64,
    /// 0=Active 1=Revoked 2=Expired 3=Exhausted.
    pub status: u8,
    pub bump: u8,
}

impl Authority {
    pub fn remaining(&self) -> Option<u64> {
        self.budget.checked_sub(self.spent)
    }

    /// Empty category set = all allowed.
    pub fn category_allowed(&self, category: &[u8; 16]) -> bool {
        if self.category_count == 0 {
            return true;
        }
        for i in 0..(self.category_count as usize) {
            if &self.categories[i] == category {
                return true;
            }
        }
        false
    }

    pub fn recipient_blocked(&self, recipient: &Pubkey) -> bool {
        for i in 0..(self.blocked_count as usize) {
            if &self.blocked_recipients[i] == recipient {
                return true;
            }
        }
        false
    }
}

/// Conditional payment lock metadata.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub escrow_id: u64,
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    /// 0 = no authority required.
    pub authority_id: u64,
    pub category: [u8; 16],
    /// 0=immediate 1=receipt 2=oracle 3=multisig 4=timeout.
    pub condition_type: u8,
    pub condition_data: [u8; 64],
    /// 0=Open 1=Released 2=Cancelled 3=Expired.
    pub status: u8,
    pub created_slot: u64,
    /// 0 = no expiry.
    pub expiry_slot: u64,
    pub vault_bump: u8,
    pub bump: u8,
}

/// Multi-agent organization / swarm.
#[account]
#[derive(InitSpace)]
pub struct Organization {
    pub org_id: u64,
    pub name_hash: [u8; 32],
    pub creator: Pubkey,
    pub member_count: u16,
    /// Sum of all member share_bps; must stay ≤ 10000.
    pub total_share_bps: u16,
    /// 0=Active 1=Dissolving 2=Closed.
    pub status: u8,
    pub created_slot: u64,
    pub treasury_bump: u8,
    pub bump: u8,
}

/// Membership record inside an organization.
#[account]
#[derive(InitSpace)]
pub struct OrgMember {
    pub org_id: u64,
    pub agent: Pubkey,
    /// 0=Admin 1=Member 2=Viewer.
    pub role: u8,
    /// Residual share on dissolve; sum across members ≤ 10000.
    pub share_bps: u16,
    pub bump: u8,
}

/// Optional high-value provenance receipt.
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub receipt_id: u64,
    pub receipt_type: u8,
    pub actor: Pubkey,
    pub slot: u64,
    pub payload_hash: [u8; 32],
    pub prev_hash: [u8; 32],
    pub hash: [u8; 32],
    pub bump: u8,
}
