use anchor_lang::prelude::*;

use crate::constants::{AUTH_STATUS_ACTIVE, AUTH_STATUS_EXPIRED, SEED_AUTHORITY};
use crate::errors::AeonError;
use crate::events::AuthorityExpired;
use crate::state::Authority;

#[derive(Accounts)]
#[instruction(authority_id: u64)]
pub struct ExpireAuthority<'info> {
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_AUTHORITY, &authority_id.to_le_bytes()],
        bump = authority.bump,
        constraint = authority.authority_id == authority_id @ AeonError::ParentIdMismatch,
        constraint = authority.agent == agent.key() @ AeonError::Unauthorized,
        constraint = authority.status == AUTH_STATUS_ACTIVE @ AeonError::AuthorityNotActive,
    )]
    pub authority: Account<'info, Authority>,
}

pub fn handler(ctx: Context<ExpireAuthority>, authority_id: u64) -> Result<()> {
    let auth = &ctx.accounts.authority;
    require!(auth.expiry_slot != 0, AeonError::AuthorityNotExpired);
    let clock = Clock::get()?;
    require!(clock.slot > auth.expiry_slot, AeonError::AuthorityNotExpired);

    let auth = &mut ctx.accounts.authority;
    auth.status = AUTH_STATUS_EXPIRED;

    emit!(AuthorityExpired {
        authority_id,
        agent: ctx.accounts.agent.key(),
        expired_slot: auth.expiry_slot,
    });
    Ok(())
}
