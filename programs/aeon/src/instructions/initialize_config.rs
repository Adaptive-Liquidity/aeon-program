use anchor_lang::prelude::*;

use crate::constants::{DEFAULT_MIN_SOLVENCY_BPS, SEED_CONFIG};
use crate::state::Config;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>, aeon_mint: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.aeon_mint = aeon_mint;
    config.authority_counter = 0;
    config.escrow_counter = 0;
    config.org_counter = 0;
    config.receipt_counter = 0;
    config.min_solvency_bps = DEFAULT_MIN_SOLVENCY_BPS;
    config.paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}
