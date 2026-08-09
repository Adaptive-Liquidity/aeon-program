use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{ORG_STATUS_ACTIVE, SEED_ORG, SEED_ORG_MEMBER, SEED_ORG_TREASURY};
use crate::errors::AeonError;
use crate::events::OrgDeposited;
use crate::state::{OrgMember, Organization};

#[derive(Accounts)]
#[instruction(org_id: u64, amount: u64)]
pub struct DepositToOrg<'info> {
    pub member: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ORG, &org_id.to_le_bytes()],
        bump = organization.bump,
        constraint = organization.org_id == org_id @ AeonError::Unauthorized,
        constraint = organization.status == ORG_STATUS_ACTIVE @ AeonError::OrgNotActive,
    )]
    pub organization: Account<'info, Organization>,
    #[account(
        seeds = [SEED_ORG_MEMBER, &org_id.to_le_bytes(), member.key().as_ref()],
        bump = org_member.bump,
        constraint = org_member.agent == member.key() @ AeonError::Unauthorized,
        constraint = org_member.org_id == org_id @ AeonError::Unauthorized,
    )]
    pub org_member: Account<'info, OrgMember>,
    #[account(
        mut,
        seeds = [SEED_ORG_TREASURY, &org_id.to_le_bytes()],
        bump = organization.treasury_bump,
    )]
    pub org_treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = member_token.owner == member.key() @ AeonError::Unauthorized,
        constraint = member_token.mint == org_treasury.mint @ AeonError::InvalidMint,
    )]
    pub member_token: InterfaceAccount<'info, TokenAccount>,
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<DepositToOrg>, org_id: u64, amount: u64) -> Result<()> {
    require!(amount > 0, AeonError::InvalidAmount);
    require!(
        ctx.accounts.aeon_mint.key() == ctx.accounts.org_treasury.mint,
        AeonError::InvalidMint
    );
    let decimals = ctx.accounts.aeon_mint.decimals;
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.member_token.to_account_info(),
                mint: ctx.accounts.aeon_mint.to_account_info(),
                to: ctx.accounts.org_treasury.to_account_info(),
                authority: ctx.accounts.member.to_account_info(),
            },
        ),
        amount,
        decimals,
    )?;
    emit!(OrgDeposited {
        org_id,
        agent: ctx.accounts.member.key(),
        amount,
    });
    Ok(())
}
