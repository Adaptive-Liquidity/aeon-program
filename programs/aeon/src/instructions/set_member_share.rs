use anchor_lang::prelude::*;

use crate::constants::{ORG_STATUS_ACTIVE, ROLE_ADMIN, SEED_ORG, SEED_ORG_MEMBER};
use crate::errors::AeonError;
use crate::events::MemberShareUpdated;
use crate::state::{OrgMember, Organization};

#[derive(Accounts)]
#[instruction(org_id: u64, new_share_bps: u16)]
pub struct SetMemberShare<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ORG, &org_id.to_le_bytes()],
        bump = organization.bump,
        constraint = organization.org_id == org_id @ AeonError::Unauthorized,
        constraint = organization.status == ORG_STATUS_ACTIVE @ AeonError::OrgNotActive,
    )]
    pub organization: Account<'info, Organization>,
    #[account(
        seeds = [SEED_ORG_MEMBER, &org_id.to_le_bytes(), admin.key().as_ref()],
        bump = admin_member.bump,
        constraint = admin_member.agent == admin.key() @ AeonError::Unauthorized,
        constraint = admin_member.role == ROLE_ADMIN @ AeonError::Unauthorized,
    )]
    pub admin_member: Account<'info, OrgMember>,
    #[account(
        mut,
        seeds = [SEED_ORG_MEMBER, &org_id.to_le_bytes(), target_member.agent.as_ref()],
        bump = target_member.bump,
        constraint = target_member.org_id == org_id @ AeonError::Unauthorized,
    )]
    pub target_member: Account<'info, OrgMember>,
}

pub fn handler(ctx: Context<SetMemberShare>, org_id: u64, new_share_bps: u16) -> Result<()> {
    require!(new_share_bps <= 10_000, AeonError::InvalidShareBps);
    let old = ctx.accounts.target_member.share_bps;
    let org = &mut ctx.accounts.organization;
    let without_old = org.total_share_bps.checked_sub(old).ok_or(AeonError::Overflow)?;
    let new_total = without_old.checked_add(new_share_bps).ok_or(AeonError::Overflow)?;
    require!(new_total <= 10_000, AeonError::ShareBpsExceedsMax);
    org.total_share_bps = new_total;
    ctx.accounts.target_member.share_bps = new_share_bps;
    emit!(MemberShareUpdated {
        org_id,
        agent: ctx.accounts.target_member.agent,
        old_share_bps: old,
        new_share_bps,
    });
    Ok(())
}
