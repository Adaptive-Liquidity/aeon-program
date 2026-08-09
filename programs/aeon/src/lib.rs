#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn");

#[program]
pub mod aeon {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, aeon_mint: Pubkey) -> Result<()> {
        instructions::initialize_config::handler(ctx, aeon_mint)
    }

    pub fn register_agent(ctx: Context<RegisterAgent>) -> Result<()> {
        instructions::register_agent::handler(ctx)
    }

    pub fn issue_authority(
        ctx: Context<IssueAuthority>,
        authority_id: u64,
        budget: u64,
        max_per_tx: u64,
        max_total: u64,
        categories: Vec<[u8; 16]>,
        parent_id: u64,
        expiry_slot: u64,
    ) -> Result<()> {
        instructions::issue_authority::handler(
            ctx, authority_id, budget, max_per_tx, max_total, categories, parent_id, expiry_slot,
        )
    }

    pub fn revoke_authority(ctx: Context<RevokeAuthority>, authority_id: u64) -> Result<()> {
        instructions::revoke_authority::handler(ctx, authority_id)
    }

    pub fn pay(
        ctx: Context<Pay>,
        amount: u64,
        authority_id: u64,
        category: [u8; 16],
    ) -> Result<()> {
        instructions::pay::handler(ctx, amount, authority_id, category)
    }

    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        escrow_id: u64,
        amount: u64,
        authority_id: u64,
        category: [u8; 16],
        condition_type: u8,
        condition_data: [u8; 64],
        expiry_slot: u64,
    ) -> Result<()> {
        instructions::create_escrow::handler(
            ctx, escrow_id, amount, authority_id, category, condition_type, condition_data, expiry_slot,
        )
    }

    pub fn release_escrow(
        ctx: Context<ReleaseEscrow>,
        escrow_id: u64,
        witness: [u8; 64],
    ) -> Result<()> {
        instructions::release_escrow::handler(ctx, escrow_id, witness)
    }

    pub fn cancel_escrow(ctx: Context<CancelEscrow>, escrow_id: u64) -> Result<()> {
        instructions::cancel_escrow::handler(ctx, escrow_id)
    }

    pub fn atomic_split(
        ctx: Context<AtomicSplit>,
        authority_id: u64,
        amounts: Vec<u64>,
        category: [u8; 16],
    ) -> Result<()> {
        instructions::atomic_split::handler(ctx, authority_id, amounts, category)
    }

    pub fn create_org(
        ctx: Context<CreateOrg>,
        org_id: u64,
        name_hash: [u8; 32],
        creator_share_bps: u16,
    ) -> Result<()> {
        instructions::create_org::handler(ctx, org_id, name_hash, creator_share_bps)
    }

    pub fn deposit_to_org(ctx: Context<DepositToOrg>, org_id: u64, amount: u64) -> Result<()> {
        instructions::deposit_to_org::handler(ctx, org_id, amount)
    }

    pub fn org_split(ctx: Context<OrgSplit>, org_id: u64, amounts: Vec<u64>) -> Result<()> {
        instructions::org_split::handler(ctx, org_id, amounts)
    }

    pub fn dissolve_org(ctx: Context<DissolveOrg>, org_id: u64) -> Result<()> {
        instructions::dissolve_org::handler(ctx, org_id)
    }

    pub fn join_org(ctx: Context<JoinOrg>, org_id: u64, role: u8, share_bps: u16) -> Result<()> {
        instructions::join_org::handler(ctx, org_id, role, share_bps)
    }

    pub fn set_member_share(
        ctx: Context<SetMemberShare>,
        org_id: u64,
        new_share_bps: u16,
    ) -> Result<()> {
        instructions::set_member_share::handler(ctx, org_id, new_share_bps)
    }

    pub fn reclaim_org_residual(ctx: Context<ReclaimOrgResidual>, org_id: u64) -> Result<()> {
        instructions::reclaim_org_residual::handler(ctx, org_id)
    }
}
