use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    CONDITION_IMMEDIATE, CONDITION_ORACLE, CONDITION_RECEIPT, CONDITION_TIMEOUT,
    ESCROW_STATUS_OPEN, ESCROW_STATUS_RELEASED, SEED_CRI, SEED_ESCROW, SEED_ESCROW_VAULT,
};
use crate::errors::AeonError;
use crate::events::{CriUpdated, EscrowReleased};
use crate::state::{Cri, Escrow};

#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct ReleaseEscrow<'info> {
    pub releaser: Signer<'info>,
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
        constraint = payee_token.owner == escrow.payee @ AeonError::Unauthorized,
        constraint = payee_token.mint == escrow_vault.mint @ AeonError::InvalidMint,
    )]
    pub payee_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [SEED_CRI, escrow.payer.as_ref()],
        bump = payer_cri.bump,
        constraint = payer_cri.agent == escrow.payer @ AeonError::Unauthorized,
    )]
    pub payer_cri: Account<'info, Cri>,
    #[account(
        mut,
        seeds = [SEED_CRI, escrow.payee.as_ref()],
        bump = payee_cri.bump,
        constraint = payee_cri.agent == escrow.payee @ AeonError::Unauthorized,
    )]
    pub payee_cri: Account<'info, Cri>,
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<ReleaseEscrow>, escrow_id: u64, witness: [u8; 64]) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.status == ESCROW_STATUS_OPEN, AeonError::EscrowNotOpen);
    let clock = Clock::get()?;
    if escrow.condition_type != CONDITION_TIMEOUT
        && escrow.expiry_slot != 0
        && clock.slot > escrow.expiry_slot
    {
        return err!(AeonError::EscrowExpired);
    }
    match escrow.condition_type {
        CONDITION_IMMEDIATE => {}
        CONDITION_TIMEOUT => {
            require!(escrow.expiry_slot != 0, AeonError::EscrowConditionFailed);
            require!(clock.slot >= escrow.expiry_slot, AeonError::EscrowConditionFailed);
        }
        CONDITION_RECEIPT => {
            require!(
                witness[..32] == escrow.condition_data[..32],
                AeonError::EscrowConditionFailed
            );
        }
        CONDITION_ORACLE | _ => return err!(AeonError::EscrowConditionFailed),
    }
    require!(
        ctx.accounts.aeon_mint.key() == ctx.accounts.escrow_vault.mint,
        AeonError::InvalidMint
    );

    let amount = escrow.amount;
    let payee = escrow.payee;
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
                to: ctx.accounts.payee_token.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer,
        ),
        amount,
        decimals,
    )?;

    ctx.accounts.escrow.status = ESCROW_STATUS_RELEASED;
    let slot = clock.slot;
    {
        let c = &mut ctx.accounts.payer_cri;
        c.successful_commitments = c.successful_commitments.checked_add(1).ok_or(AeonError::Overflow)?;
        c.volume_settled = c.volume_settled.checked_add(amount).ok_or(AeonError::Overflow)?;
        c.last_active_slot = slot;
    }
    {
        let c = &mut ctx.accounts.payee_cri;
        c.successful_settlements = c.successful_settlements.checked_add(1).ok_or(AeonError::Overflow)?;
        c.volume_settled = c.volume_settled.checked_add(amount).ok_or(AeonError::Overflow)?;
        c.last_active_slot = slot;
    }
    emit!(EscrowReleased { escrow_id, payee, amount });
    emit!(CriUpdated {
        agent: payer,
        successful_settlements: ctx.accounts.payer_cri.successful_settlements,
        volume_settled: ctx.accounts.payer_cri.volume_settled,
    });
    emit!(CriUpdated {
        agent: payee,
        successful_settlements: ctx.accounts.payee_cri.successful_settlements,
        volume_settled: ctx.accounts.payee_cri.volume_settled,
    });
    Ok(())
}
