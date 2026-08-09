use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount as SplTokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    ORG_STATUS_ACTIVE, ORG_STATUS_CLOSED, ORG_STATUS_DISSOLVING, ROLE_ADMIN, SEED_ORG,
    SEED_ORG_MEMBER, SEED_ORG_TREASURY,
};
use crate::errors::AeonError;
use crate::events::OrgDissolved;
use crate::state::{OrgMember, Organization};

/// Dissolve and distribute by share_bps to up to two members (creator + one peer).
/// Additional residual is left for reclaim_org_residual.
#[derive(Accounts)]
#[instruction(org_id: u64)]
pub struct DissolveOrg<'info> {
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
        constraint = admin_token.owner == admin_member.agent @ AeonError::Unauthorized,
        constraint = admin_token.mint == org_treasury.mint @ AeonError::InvalidMint,
    )]
    pub admin_token: InterfaceAccount<'info, SplTokenAccount>,
    /// Optional second member.
    pub member_b: Option<Account<'info, OrgMember>>,
    #[account(mut)]
    pub member_b_token: Option<InterfaceAccount<'info, SplTokenAccount>>,
    #[account(
        mut,
        seeds = [SEED_ORG_TREASURY, &org_id.to_le_bytes()],
        bump = organization.treasury_bump,
    )]
    pub org_treasury: InterfaceAccount<'info, SplTokenAccount>,
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

fn payout_share(balance: u64, bps: u16) -> Result<u64> {
    if bps == 0 {
        return Ok(0);
    }
    Ok((balance as u128)
        .checked_mul(bps as u128)
        .ok_or(AeonError::Overflow)?
        .checked_div(10_000u128)
        .ok_or(AeonError::Overflow)? as u64)
}

pub fn handler(ctx: Context<DissolveOrg>, org_id: u64) -> Result<()> {
    ctx.accounts.organization.status = ORG_STATUS_DISSOLVING;
    let treasury_balance = ctx.accounts.org_treasury.amount;
    let org_bump = ctx.accounts.organization.bump;
    let id_bytes = org_id.to_le_bytes();
    let seeds: &[&[u8]] = &[SEED_ORG, &id_bytes, &[org_bump]];
    let signer = &[seeds];
    let decimals = ctx.accounts.aeon_mint.decimals;

    let mut total_paid: u64 = 0;

    // Admin share
    let admin_amount = payout_share(treasury_balance, ctx.accounts.admin_member.share_bps)?;
    if admin_amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.org_treasury.to_account_info(),
                    mint: ctx.accounts.aeon_mint.to_account_info(),
                    to: ctx.accounts.admin_token.to_account_info(),
                    authority: ctx.accounts.organization.to_account_info(),
                },
                signer,
            ),
            admin_amount,
            decimals,
        )?;
        total_paid = total_paid.checked_add(admin_amount).ok_or(AeonError::Overflow)?;
    }

    // Optional member B
    if let (Some(member_b), Some(token_b)) = (
        ctx.accounts.member_b.as_ref(),
        ctx.accounts.member_b_token.as_ref(),
    ) {
        require!(member_b.org_id == org_id, AeonError::Unauthorized);
        require!(token_b.owner == member_b.agent, AeonError::Unauthorized);
        require!(token_b.mint == ctx.accounts.org_treasury.mint, AeonError::InvalidMint);
        let amount = payout_share(treasury_balance, member_b.share_bps)?;
        if amount > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.org_treasury.to_account_info(),
                        mint: ctx.accounts.aeon_mint.to_account_info(),
                        to: token_b.to_account_info(),
                        authority: ctx.accounts.organization.to_account_info(),
                    },
                    signer,
                ),
                amount,
                decimals,
            )?;
            total_paid = total_paid.checked_add(amount).ok_or(AeonError::Overflow)?;
        }
    }

    require!(total_paid <= treasury_balance, AeonError::TreasuryConservation);
    ctx.accounts.organization.status = ORG_STATUS_CLOSED;
    emit!(OrgDissolved {
        org_id,
        total_distributed: total_paid,
    });
    Ok(())
}
