use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount as SplTokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    ORG_STATUS_ACTIVE, ROLE_ADMIN, ROLE_VIEWER, SEED_ORG, SEED_ORG_MEMBER, SEED_ORG_TREASURY,
};
use crate::errors::AeonError;
use crate::events::OrgSplitEvent;
use crate::state::{OrgMember, Organization};

/// Admin-gated single-recipient treasury split.
/// Multi-recipient can be done via multiple org_split calls (conservation per call).
#[derive(Accounts)]
#[instruction(org_id: u64)]
pub struct OrgSplit<'info> {
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
        seeds = [SEED_ORG_MEMBER, &org_id.to_le_bytes(), recipient_member.agent.as_ref()],
        bump = recipient_member.bump,
        constraint = recipient_member.org_id == org_id @ AeonError::Unauthorized,
        constraint = recipient_member.role != ROLE_VIEWER @ AeonError::Unauthorized,
    )]
    pub recipient_member: Account<'info, OrgMember>,
    #[account(
        mut,
        constraint = recipient_token.owner == recipient_member.agent @ AeonError::Unauthorized,
        constraint = recipient_token.mint == org_treasury.mint @ AeonError::InvalidMint,
    )]
    pub recipient_token: InterfaceAccount<'info, SplTokenAccount>,
    #[account(
        mut,
        seeds = [SEED_ORG_TREASURY, &org_id.to_le_bytes()],
        bump = organization.treasury_bump,
    )]
    pub org_treasury: InterfaceAccount<'info, SplTokenAccount>,
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<OrgSplit>, org_id: u64, amounts: Vec<u64>) -> Result<()> {
    // v0.1: one recipient per call (named accounts). amounts must be len 1.
    require!(amounts.len() == 1, AeonError::InvalidRemainingAccounts);
    let amount = amounts[0];
    require!(amount > 0, AeonError::InvalidAmount);
    require!(
        amount <= ctx.accounts.org_treasury.amount,
        AeonError::TreasuryConservation
    );

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
                to: ctx.accounts.recipient_token.to_account_info(),
                authority: ctx.accounts.organization.to_account_info(),
            },
            signer,
        ),
        amount,
        decimals,
    )?;

    emit!(OrgSplitEvent {
        org_id,
        total: amount,
        recipient_count: 1,
    });
    Ok(())
}
