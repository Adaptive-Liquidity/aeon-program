use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};

use crate::constants::{BOND_STATUS_ACTIVE, BOND_STATUS_SLASHED, SEED_AUTHORITY, SEED_AUTHORITY_BOND, SEED_CONFIG};
use crate::errors::AeonError;
use crate::events::BondSlashed;
use crate::state::{Authority, AuthorityBond, Config};

#[derive(Accounts)]
#[instruction(authority_id: u64)]
pub struct SlashBond<'info> {
    pub slasher: Signer<'info>,

    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [SEED_AUTHORITY, &authority_id.to_le_bytes()],
        bump = authority.bump,
        constraint = authority.authority_id == authority_id @ AeonError::ParentIdMismatch,
        constraint = authority.agent == slasher.key() @ AeonError::Unauthorized,
        constraint = authority.bond_amount > 0 @ AeonError::InsufficientBond,
    )]
    pub authority: Account<'info, Authority>,

    #[account(
        mut,
        seeds = [SEED_AUTHORITY_BOND, &authority_id.to_le_bytes()],
        bump = bond.bump,
        constraint = bond.authority_id == authority_id @ AeonError::ParentIdMismatch,
        constraint = bond.status == BOND_STATUS_ACTIVE @ AeonError::BondNotActive,
    )]
    pub bond: Account<'info, AuthorityBond>,

    #[account(
        mut,
        constraint = bond_vault.owner == bond.key() @ AeonError::Unauthorized,
        constraint = bond_vault.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = destination.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    #[account(address = config.aeon_mint @ AeonError::InvalidMint)]
    pub aeon_mint: InterfaceAccount<'info, Mint>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<SlashBond>, authority_id: u64) -> Result<()> {
    let bond = &mut ctx.accounts.bond;
    require!(bond.status == BOND_STATUS_ACTIVE, AeonError::BondNotActive);
    
    bond.status = BOND_STATUS_SLASHED;

    let authority_id_bytes = authority_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_AUTHORITY_BOND,
        authority_id_bytes.as_ref(),
        &[bond.bump],
    ]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.bond_vault.to_account_info(),
        mint: ctx.accounts.aeon_mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: bond.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    // Using decimals=6 as a common default for SPL tokens, or pulling from mint.
    // To be perfectly robust, we use the mint's decimals.
    transfer_checked(cpi_ctx, bond.amount, ctx.accounts.aeon_mint.decimals)?;

    emit!(BondSlashed {
        authority_id,
        amount: bond.amount,
        slasher: ctx.accounts.slasher.key(),
    });

    Ok(())
}
