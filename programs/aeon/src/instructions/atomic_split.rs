use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount as SplTokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    AUTH_STATUS_ACTIVE, AUTH_STATUS_EXHAUSTED, SEED_AUTHORITY, SEED_CONFIG, SEED_CRI,
};
use crate::errors::AeonError;
use crate::events::{CriUpdated, PaymentSettled};
use crate::state::{Authority, Config, Cri};

/// Atomic split to 1–2 named payees (authority gate on total).
#[derive(Accounts)]
#[instruction(authority_id: u64)]
pub struct AtomicSplit<'info> {
    pub payer: Signer<'info>,
    /// CHECK: payee A
    pub payee_a: UncheckedAccount<'info>,
    /// CHECK: optional payee B
    pub payee_b: Option<UncheckedAccount<'info>>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Option<Account<'info, Authority>>,
    #[account(
        mut,
        constraint = payer_token.owner == payer.key() @ AeonError::Unauthorized,
        constraint = payer_token.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub payer_token: InterfaceAccount<'info, SplTokenAccount>,
    #[account(
        mut,
        constraint = payee_a_token.owner == payee_a.key() @ AeonError::Unauthorized,
        constraint = payee_a_token.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub payee_a_token: InterfaceAccount<'info, SplTokenAccount>,
    #[account(mut)]
    pub payee_b_token: Option<InterfaceAccount<'info, SplTokenAccount>>,
    #[account(
        mut,
        seeds = [SEED_CRI, payer.key().as_ref()],
        bump = payer_cri.bump,
        constraint = payer_cri.agent == payer.key() @ AeonError::Unauthorized,
    )]
    pub payer_cri: Account<'info, Cri>,
    #[account(
        mut,
        seeds = [SEED_CRI, payee_a.key().as_ref()],
        bump = payee_a_cri.bump,
        constraint = payee_a_cri.agent == payee_a.key() @ AeonError::Unauthorized,
    )]
    pub payee_a_cri: Account<'info, Cri>,
    #[account(mut)]
    pub payee_b_cri: Option<Account<'info, Cri>>,
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Fail-closed multi-leg: both transfer CPIs must succeed before spent/CRI commit.
pub fn handler(
    ctx: Context<AtomicSplit>,
    authority_id: u64,
    amounts: Vec<u64>,
    category: [u8; 16],
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);
    require!(!amounts.is_empty() && amounts.len() <= 2, AeonError::InvalidAmount);
    if amounts.len() == 2 {
        require!(ctx.accounts.payee_b.is_some(), AeonError::InvalidRemainingAccounts);
        require!(ctx.accounts.payee_b_token.is_some(), AeonError::InvalidRemainingAccounts);
        require!(ctx.accounts.payee_b_cri.is_some(), AeonError::InvalidRemainingAccounts);
    }

    let mut total: u64 = 0;
    for a in amounts.iter() {
        require!(*a > 0, AeonError::InvalidAmount);
        total = total.checked_add(*a).ok_or(AeonError::Overflow)?;
    }

    let payer_key = ctx.accounts.payer.key();
    let payee_a_key = ctx.accounts.payee_a.key();
    require!(payer_key != payee_a_key, AeonError::Unauthorized);

    // Staged only — commit after *all* transfer legs succeed.
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
        require!(total <= authority.max_per_tx, AeonError::ExceedsMaxPerTx);
        let new_spent = authority.spent.checked_add(total).ok_or(AeonError::Overflow)?;
        require!(new_spent <= authority.max_total, AeonError::ExceedsMaxTotal);
        require!(new_spent <= authority.budget, AeonError::InsufficientBudget);
        require!(authority.category_allowed(&category), AeonError::CategoryNotAllowed);
        require!(!authority.recipient_blocked(&payee_a_key), AeonError::RecipientBlocked);
        if let Some(pb) = ctx.accounts.payee_b.as_ref() {
            require!(!authority.recipient_blocked(&pb.key()), AeonError::RecipientBlocked);
        }
        let pre = ctx.accounts.payer_token.amount;
        require!(pre >= total, AeonError::InsufficientBudget);
        require!(
            pre.saturating_sub(total) >= authority.require_min_reserve,
            AeonError::InsufficientBudget
        );
        commit_spent = Some((new_spent, new_spent >= authority.budget));
    } else {
        require!(ctx.accounts.authority.is_none(), AeonError::Unauthorized);
    }

    let decimals = ctx.accounts.aeon_mint.decimals;

    // Transfer A
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.payer_token.to_account_info(),
                mint: ctx.accounts.aeon_mint.to_account_info(),
                to: ctx.accounts.payee_a_token.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        amounts[0],
        decimals,
    )?;

    if amounts.len() == 2 {
        let token_b = ctx.accounts.payee_b_token.as_ref().unwrap();
        let payee_b = ctx.accounts.payee_b.as_ref().unwrap();
        require!(token_b.owner == payee_b.key(), AeonError::Unauthorized);
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payer_token.to_account_info(),
                    mint: ctx.accounts.aeon_mint.to_account_info(),
                    to: token_b.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amounts[1],
            decimals,
        )?;
    }

    // Commit only after every leg's CPI returned Ok.
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
        c.volume_settled = c.volume_settled.checked_add(total).ok_or(AeonError::Overflow)?;
        c.last_active_slot = slot;
    }
    {
        let c = &mut ctx.accounts.payee_a_cri;
        c.successful_settlements = c.successful_settlements.checked_add(1).ok_or(AeonError::Overflow)?;
        c.volume_settled = c.volume_settled.checked_add(amounts[0]).ok_or(AeonError::Overflow)?;
        c.last_active_slot = slot;
    }
    emit!(PaymentSettled {
        payer: payer_key,
        payee: payee_a_key,
        amount: amounts[0],
        authority_id,
        category,
    });

    if amounts.len() == 2 {
        if let (Some(pb), Some(cri_b)) = (
            ctx.accounts.payee_b.as_ref(),
            ctx.accounts.payee_b_cri.as_mut(),
        ) {
            require!(cri_b.agent == pb.key(), AeonError::Unauthorized);
            cri_b.successful_settlements = cri_b.successful_settlements.checked_add(1).ok_or(AeonError::Overflow)?;
            cri_b.volume_settled = cri_b.volume_settled.checked_add(amounts[1]).ok_or(AeonError::Overflow)?;
            cri_b.last_active_slot = slot;
            emit!(PaymentSettled {
                payer: payer_key,
                payee: pb.key(),
                amount: amounts[1],
                authority_id,
                category,
            });
            emit!(CriUpdated {
                agent: pb.key(),
                successful_settlements: cri_b.successful_settlements,
                volume_settled: cri_b.volume_settled,
            });
        }
    }

    emit!(CriUpdated {
        agent: payee_a_key,
        successful_settlements: ctx.accounts.payee_a_cri.successful_settlements,
        volume_settled: ctx.accounts.payee_a_cri.volume_settled,
    });
    Ok(())
}
