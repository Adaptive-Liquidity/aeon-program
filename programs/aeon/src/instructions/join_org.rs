use anchor_lang::prelude::*;

use crate::constants::{
    ORG_STATUS_ACTIVE, ROLE_ADMIN, ROLE_MEMBER, ROLE_VIEWER, SEED_AGENT, SEED_ORG, SEED_ORG_MEMBER,
};
use crate::errors::AeonError;
use crate::events::MemberJoined;
use crate::state::{AgentIdentity, OrgMember, Organization};

#[derive(Accounts)]
#[instruction(org_id: u64, role: u8, share_bps: u16)]
pub struct JoinOrg<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: new agent pubkey
    pub new_agent: UncheckedAccount<'info>,
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
        seeds = [SEED_AGENT, new_agent.key().as_ref()],
        bump = agent_identity.bump,
        constraint = agent_identity.agent == new_agent.key() @ AeonError::Unauthorized,
        constraint = agent_identity.active @ AeonError::AgentNotActive,
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = admin,
        space = 8 + OrgMember::INIT_SPACE,
        seeds = [SEED_ORG_MEMBER, &org_id.to_le_bytes(), new_agent.key().as_ref()],
        bump
    )]
    pub new_member: Account<'info, OrgMember>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JoinOrg>, org_id: u64, role: u8, share_bps: u16) -> Result<()> {
    require!(
        role == ROLE_ADMIN || role == ROLE_MEMBER || role == ROLE_VIEWER,
        AeonError::Unauthorized
    );
    require!(share_bps <= 10_000, AeonError::InvalidShareBps);
    let org = &mut ctx.accounts.organization;
    let new_total = org.total_share_bps.checked_add(share_bps).ok_or(AeonError::Overflow)?;
    require!(new_total <= 10_000, AeonError::ShareBpsExceedsMax);
    org.total_share_bps = new_total;
    org.member_count = org.member_count.checked_add(1).ok_or(AeonError::Overflow)?;

    let agent_key = ctx.accounts.new_agent.key();
    let member = &mut ctx.accounts.new_member;
    member.org_id = org_id;
    member.agent = agent_key;
    member.role = role;
    member.share_bps = share_bps;
    member.bump = ctx.bumps.new_member;

    emit!(MemberJoined {
        org_id,
        agent: agent_key,
        role,
        share_bps,
    });
    Ok(())
}
