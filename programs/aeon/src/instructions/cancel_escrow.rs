use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    ESCROW_STATUS_CANCELLED, ESCROW_STATUS_EXPIRED, ESCROW_STATUS_OPEN, SEED_CRI, SEED_ESCROW,
    SEED_ESCROW_VAULT,
};
use crate::errors::AeonError;
use crate::events::EscrowCancelled;
use crate::state::{Cri, Escrow};

#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct CancelEscrow<'info> {
    pub canceller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ESCROW, &escrow_id.to_le_bytes()],
        bump = escrow.bump,
        constraint = escrow.escrow_id == escrow_id @ AeonError::EscrowIdMismatch,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        seeds = [SEED_ESCROW_VAULT, &escrow_id.to_le_bytes()],
        bump = escrow.vault_bump,
    )]
    pub escrow_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = payer_token.owner == escrow.payer @ AeonError::Unauthorized,
        constraint = payer_token.mint == escrow_vault.mint @ AeonError::InvalidMint,
    )]
    pub payer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [SEED_CRI, escrow.payer.as_ref()],
        bump = payer_cri.bump,
        constraint = payer_cri.agent == escrow.payer @ AeonError::Unauthorized,
    )]
    pub payer_cri: Account<'info, Cri>,
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<CancelEscrow>, escrow_id: u64) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.status == ESCROW_STATUS_OPEN, AeonError::EscrowNotOpen);
    let clock = Clock::get()?;
    let expired = escrow.expiry_slot != 0 && clock.slot > escrow.expiry_slot;
    let is_payer = ctx.accounts.canceller.key() == escrow.payer;
    require!(is_payer || expired, AeonError::EscrowCancelUnauthorized);
    require!(
        ctx.accounts.aeon_mint.key() == ctx.accounts.escrow_vault.mint,
        AeonError::InvalidMint
    );

    let amount = escrow.amount;
    let payer = escrow.payer;
    let bump = escrow.bump;
    let id_bytes = escrow_id.to_le_bytes();
    let decimals = ctx.accounts.aeon_mint.decimals;
    let seeds: &[&[u8]] = &[SEED_ESCROW, &id_bytes, &[bump]];
    let signer = &[seeds];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.escrow_vault.to_account_info(),
                mint: ctx.accounts.aeon_mint.to_account_info(),
                to: ctx.accounts.payer_token.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer,
        ),
        amount,
        decimals,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.status = if expired && !is_payer {
        ESCROW_STATUS_EXPIRED
    } else {
        ESCROW_STATUS_CANCELLED
    };

    let c = &mut ctx.accounts.payer_cri;
    c.failed_commitments = c.failed_commitments.checked_add(1).ok_or(AeonError::Overflow)?;
    c.last_active_slot = clock.slot;

    emit!(EscrowCancelled { escrow_id, payer, amount });
    Ok(())
}
