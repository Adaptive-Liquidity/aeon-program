use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{
    AUTH_STATUS_ACTIVE, AUTH_STATUS_EXHAUSTED, CONDITION_TIMEOUT, ESCROW_STATUS_OPEN, SEED_AUTHORITY,
    SEED_CONFIG, SEED_ESCROW, SEED_ESCROW_VAULT,
};
use crate::errors::AeonError;
use crate::events::EscrowCreated;
use crate::state::{Authority, Config, Escrow};

#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: payee identity
    pub payee: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [SEED_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Option<Account<'info, Authority>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [SEED_ESCROW, &escrow_id.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        init,
        payer = payer,
        token::mint = aeon_mint,
        token::authority = escrow,
        token::token_program = token_program,
        seeds = [SEED_ESCROW_VAULT, &escrow_id.to_le_bytes()],
        bump
    )]
    pub escrow_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = payer_token.owner == payer.key() @ AeonError::Unauthorized,
        constraint = payer_token.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub payer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.aeon_mint @ AeonError::InvalidMint)]
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Fail-closed spent: validate → vault transfer CPI → commit spent + escrow state.
pub fn handler(
    ctx: Context<CreateEscrow>,
    escrow_id: u64,
    amount: u64,
    authority_id: u64,
    category: [u8; 16],
    condition_type: u8,
    condition_data: [u8; 64],
    expiry_slot: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);
    require!(amount > 0, AeonError::InvalidAmount);
    let expected_id = ctx.accounts.config.escrow_counter.checked_add(1).ok_or(AeonError::Overflow)?;
    require!(escrow_id == expected_id, AeonError::EscrowIdMismatch);
    require!(condition_type <= CONDITION_TIMEOUT, AeonError::EscrowConditionFailed);

    let payer_key = ctx.accounts.payer.key();
    let payee_key = ctx.accounts.payee.key();
    require!(payer_key != payee_key, AeonError::Unauthorized);

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
                to: ctx.accounts.escrow_vault.to_account_info(),
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

    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;
    escrow.escrow_id = escrow_id;
    escrow.payer = payer_key;
    escrow.payee = payee_key;
    escrow.amount = amount;
    escrow.authority_id = authority_id;
    escrow.category = category;
    escrow.condition_type = condition_type;
    escrow.condition_data = condition_data;
    escrow.status = ESCROW_STATUS_OPEN;
    escrow.created_slot = clock.slot;
    escrow.expiry_slot = expiry_slot;
    escrow.vault_bump = ctx.bumps.escrow_vault;
    escrow.bump = ctx.bumps.escrow;

    ctx.accounts.config.escrow_counter = escrow_id;

    emit!(EscrowCreated {
        escrow_id,
        payer: payer_key,
        payee: payee_key,
        amount,
    });
    Ok(())
}
