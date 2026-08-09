use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    AUTH_STATUS_ACTIVE, AUTH_STATUS_EXHAUSTED, SEED_AUTHORITY, SEED_CONFIG, SEED_CRI,
};
use crate::errors::AeonError;
use crate::events::{CriUpdated, PaymentSettled};
use crate::state::{Authority, Config, Cri};

#[derive(Accounts)]
#[instruction(amount: u64, authority_id: u64)]
pub struct Pay<'info> {
    pub payer: Signer<'info>,
    /// CHECK: payee identity
    pub payee: UncheckedAccount<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Option<Account<'info, Authority>>,
    #[account(
        mut,
        seeds = [SEED_CRI, payer.key().as_ref()],
        bump = payer_cri.bump,
        constraint = payer_cri.agent == payer.key() @ AeonError::Unauthorized,
    )]
    pub payer_cri: Account<'info, Cri>,
    #[account(
        mut,
        seeds = [SEED_CRI, payee.key().as_ref()],
        bump = payee_cri.bump,
        constraint = payee_cri.agent == payee.key() @ AeonError::Unauthorized,
    )]
    pub payee_cri: Account<'info, Cri>,
    #[account(
        mut,
        constraint = payer_token.owner == payer.key() @ AeonError::Unauthorized,
        constraint = payer_token.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub payer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = payee_token.owner == payee.key() @ AeonError::Unauthorized,
        constraint = payee_token.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub payee_token: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.aeon_mint @ AeonError::InvalidMint)]
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Fail-closed spent: validate → transfer CPI → commit spent/CRI.
/// Never write `authority.spent` before `transfer_checked` succeeds.
pub fn handler(ctx: Context<Pay>, amount: u64, authority_id: u64, category: [u8; 16]) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);
    require!(amount > 0, AeonError::InvalidAmount);
    let payer_key = ctx.accounts.payer.key();
    let payee_key = ctx.accounts.payee.key();
    require!(payer_key != payee_key, AeonError::Unauthorized);

    // Staged commit only — not written until after CPI.
    let mut commit_spent: Option<(u64, bool)> = None;

    if authority_id != 0 {
        let authority = ctx.accounts.authority.as_ref().ok_or(AeonError::AuthorityRequired)?;
        let (expected_pda, _) = Pubkey::find_program_address(
            &[SEED_AUTHORITY, &authority_id.to_le_bytes()],
            ctx.program_id,
        );
        require!(authority.to_account_info().key() == expected_pda, AeonError::Unauthorized);
        require!(authority.authority_id == authority_id, AeonError::Unauthorized);
        require!(authority.agent == payer_key, AeonError::AuthorityAgentMismatch);
        let clock = Clock::get()?;
        if authority.expiry_slot != 0 && clock.slot > authority.expiry_slot {
            return err!(AeonError::AuthorityExpired);
        }
        require!(authority.status == AUTH_STATUS_ACTIVE, AeonError::AuthorityNotActive);
        require!(amount <= authority.max_per_tx, AeonError::ExceedsMaxPerTx);
        let new_spent = authority.spent.checked_add(amount).ok_or(AeonError::Overflow)?;
        require!(new_spent <= authority.max_total, AeonError::ExceedsMaxTotal);
        require!(new_spent <= authority.budget, AeonError::InsufficientBudget);
        require!(authority.category_allowed(&category), AeonError::CategoryNotAllowed);
        require!(!authority.recipient_blocked(&payee_key), AeonError::RecipientBlocked);
        let pre = ctx.accounts.payer_token.amount;
        require!(pre >= amount, AeonError::InsufficientBudget);
        require!(
            pre.saturating_sub(amount) >= authority.require_min_reserve,
            AeonError::InsufficientBudget
        );
        commit_spent = Some((new_spent, new_spent >= authority.budget));
    } else {
        require!(ctx.accounts.authority.is_none(), AeonError::Unauthorized);
    }

    let decimals = ctx.accounts.aeon_mint.decimals;
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.payer_token.to_account_info(),
                mint: ctx.accounts.aeon_mint.to_account_info(),
                to: ctx.accounts.payee_token.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        amount,
        decimals,
    )?;

    if let Some((new_spent, exhaust)) = commit_spent {
        let authority = ctx.accounts.authority.as_mut().ok_or(AeonError::AuthorityRequired)?;
        authority.spent = new_spent;
        if exhaust {
            authority.status = AUTH_STATUS_EXHAUSTED;
        }
    }

    let slot = Clock::get()?.slot;
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

    emit!(PaymentSettled {
        payer: payer_key,
        payee: payee_key,
        amount,
        authority_id,
        category,
    });
    emit!(CriUpdated {
        agent: payer_key,
        successful_settlements: ctx.accounts.payer_cri.successful_settlements,
        volume_settled: ctx.accounts.payer_cri.volume_settled,
    });
    emit!(CriUpdated {
        agent: payee_key,
        successful_settlements: ctx.accounts.payee_cri.successful_settlements,
        volume_settled: ctx.accounts.payee_cri.volume_settled,
    });
    Ok(())
}
