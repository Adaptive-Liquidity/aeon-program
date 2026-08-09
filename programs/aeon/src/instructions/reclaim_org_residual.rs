use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    ORG_STATUS_CLOSED, ROLE_ADMIN, SEED_ORG, SEED_ORG_MEMBER, SEED_ORG_TREASURY,
};
use crate::errors::AeonError;
use crate::events::OrgResidualReclaimed;
use crate::state::{OrgMember, Organization};

#[derive(Accounts)]
#[instruction(org_id: u64)]
pub struct ReclaimOrgResidual<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ORG, &org_id.to_le_bytes()],
        bump = organization.bump,
        constraint = organization.org_id == org_id @ AeonError::Unauthorized,
        constraint = organization.status == ORG_STATUS_CLOSED @ AeonError::OrgNotClosed,
    )]
    pub organization: Account<'info, Organization>,
    #[account(
        seeds = [SEED_ORG_MEMBER, &org_id.to_le_bytes(), authority.key().as_ref()],
        bump = authority_member.bump,
        constraint = authority_member.agent == authority.key() @ AeonError::Unauthorized,
        constraint = authority_member.org_id == org_id @ AeonError::Unauthorized,
    )]
    pub authority_member: Account<'info, OrgMember>,
    #[account(
        mut,
        seeds = [SEED_ORG_TREASURY, &org_id.to_le_bytes()],
        bump = organization.treasury_bump,
    )]
    pub org_treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = destination.mint == org_treasury.mint @ AeonError::InvalidMint,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<ReclaimOrgResidual>, org_id: u64) -> Result<()> {
    let is_creator = ctx.accounts.authority.key() == ctx.accounts.organization.creator;
    let is_admin = ctx.accounts.authority_member.role == ROLE_ADMIN;
    require!(is_creator || is_admin, AeonError::Unauthorized);
    let amount = ctx.accounts.org_treasury.amount;
    require!(amount > 0, AeonError::InvalidAmount);

    let org_bump = ctx.accounts.organization.bump;
    let id_bytes = org_id.to_le_bytes();
    let seeds: &[&[u8]] = &[SEED_ORG, &id_bytes, &[org_bump]];
    let signer = &[seeds];
    let decimals = ctx.accounts.aeon_mint.decimals;

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.org_treasury.to_account_info(),
                mint: ctx.accounts.aeon_mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.organization.to_account_info(),
            },
            signer,
        ),
        amount,
        decimals,
    )?;

    emit!(OrgResidualReclaimed {
        org_id,
        amount,
        destination: ctx.accounts.destination.key(),
    });
    Ok(())
}
