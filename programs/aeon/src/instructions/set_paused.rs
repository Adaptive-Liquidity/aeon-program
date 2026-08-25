use anchor_lang::prelude::*;

use crate::constants::SEED_CONFIG;
use crate::state::Config;
use crate::errors::AeonError;
use crate::events::{ConfigPaused, ConfigUnpaused};

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_CONFIG],
        bump = config.bump,
        constraint = config.admin == admin.key() @ AeonError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    if paused {
        emit!(ConfigPaused { admin: ctx.accounts.admin.key() });
    } else {
        emit!(ConfigUnpaused { admin: ctx.accounts.admin.key() });
    }
    Ok(())
}
