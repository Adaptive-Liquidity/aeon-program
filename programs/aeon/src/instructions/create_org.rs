use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{
    ORG_STATUS_ACTIVE, ROLE_ADMIN, SEED_AGENT, SEED_CONFIG, SEED_ORG, SEED_ORG_MEMBER,
    SEED_ORG_TREASURY,
};
use crate::errors::AeonError;
use crate::events::OrgCreated;
use crate::state::{AgentIdentity, Config, OrgMember, Organization};

#[derive(Accounts)]
#[instruction(org_id: u64, name_hash: [u8; 32], creator_share_bps: u16)]
pub struct CreateOrg<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [SEED_AGENT, creator.key().as_ref()],
        bump = creator_identity.bump,
        constraint = creator_identity.agent == creator.key() @ AeonError::Unauthorized,
        constraint = creator_identity.active @ AeonError::AgentNotActive,
    )]
    pub creator_identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = creator,
        space = 8 + Organization::INIT_SPACE,
        seeds = [SEED_ORG, &org_id.to_le_bytes()],
        bump
    )]
    pub organization: Account<'info, Organization>,
    #[account(
        init,
        payer = creator,
        seeds = [SEED_ORG_TREASURY, &org_id.to_le_bytes()],
        bump,
        token::mint = aeon_mint,
        token::authority = organization,
        token::token_program = token_program,
    )]
    pub org_treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + OrgMember::INIT_SPACE,
        seeds = [SEED_ORG_MEMBER, &org_id.to_le_bytes(), creator.key().as_ref()],
        bump
    )]
    pub creator_member: Account<'info, OrgMember>,
    #[account(address = config.aeon_mint @ AeonError::InvalidMint)]
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateOrg>,
    org_id: u64,
    name_hash: [u8; 32],
    creator_share_bps: u16,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);
    require!(creator_share_bps <= 10_000, AeonError::InvalidShareBps);
    let expected_id = ctx.accounts.config.org_counter.checked_add(1).ok_or(AeonError::Overflow)?;
    require!(org_id == expected_id, AeonError::Unauthorized);

    let share = if creator_share_bps == 0 { 10_000 } else { creator_share_bps };
    let clock = Clock::get()?;
    let creator_key = ctx.accounts.creator.key();

    let org = &mut ctx.accounts.organization;
    org.org_id = org_id;
    org.name_hash = name_hash;
    org.creator = creator_key;
    org.member_count = 1;
    org.total_share_bps = share;
    org.status = ORG_STATUS_ACTIVE;
    org.created_slot = clock.slot;
    org.treasury_bump = ctx.bumps.org_treasury;
    org.bump = ctx.bumps.organization;

    let member = &mut ctx.accounts.creator_member;
    member.org_id = org_id;
    member.agent = creator_key;
    member.role = ROLE_ADMIN;
    member.share_bps = share;
    member.bump = ctx.bumps.creator_member;

    ctx.accounts.config.org_counter = org_id;
    emit!(OrgCreated { org_id, creator: creator_key });
    Ok(())
}
