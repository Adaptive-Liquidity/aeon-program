use anchor_lang::prelude::*;

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
}

#[event]
pub struct AuthorityIssued {
    pub authority_id: u64,
    pub agent: Pubkey,
    pub budget: u64,
    pub parent_id: u64,
}

#[event]
pub struct AuthorityRevoked {
    pub authority_id: u64,
    pub cascade: bool,
}

#[event]
pub struct PaymentSettled {
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub authority_id: u64,
    pub category: [u8; 16],
}

#[event]
pub struct CriUpdated {
    pub agent: Pubkey,
    pub successful_settlements: u64,
    pub volume_settled: u64,
}

#[event]
pub struct EscrowCreated {
    pub escrow_id: u64,
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowReleased {
    pub escrow_id: u64,
    pub payee: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow_id: u64,
    pub payer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OrgCreated {
    pub org_id: u64,
    pub creator: Pubkey,
}

#[event]
pub struct OrgDeposited {
    pub org_id: u64,
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OrgSplitEvent {
    pub org_id: u64,
    pub total: u64,
    pub recipient_count: u16,
}

#[event]
pub struct OrgDissolved {
    pub org_id: u64,
    pub total_distributed: u64,
}

#[event]
pub struct MemberJoined {
    pub org_id: u64,
    pub agent: Pubkey,
    pub role: u8,
    pub share_bps: u16,
}

#[event]
pub struct MemberShareUpdated {
    pub org_id: u64,
    pub agent: Pubkey,
    pub old_share_bps: u16,
    pub new_share_bps: u16,
}

#[event]
pub struct OrgResidualReclaimed {
    pub org_id: u64,
    pub amount: u64,
    pub destination: Pubkey,
}
