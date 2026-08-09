use anchor_lang::prelude::*;

use crate::constants::{SEED_AGENT, SEED_CONFIG, SEED_CRI};
use crate::errors::AeonError;
use crate::events::AgentRegistered;
use crate::state::{AgentIdentity, Config, Cri};

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        seeds = [SEED_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = agent,
        space = 8 + AgentIdentity::INIT_SPACE,
        seeds = [SEED_AGENT, agent.key().as_ref()],
        bump
    )]
    pub agent_identity: Account<'info, AgentIdentity>,

    #[account(
        init,
        payer = agent,
        space = 8 + Cri::INIT_SPACE,
        seeds = [SEED_CRI, agent.key().as_ref()],
        bump
    )]
    pub cri: Account<'info, Cri>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterAgent>) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);

    let slot = Clock::get()?.slot;
    let agent_key = ctx.accounts.agent.key();

    let identity = &mut ctx.accounts.agent_identity;
    identity.agent = agent_key;
    identity.created_slot = slot;
    identity.active = true;
    identity.metadata_uri_hash = [0u8; 32];
    identity.bump = ctx.bumps.agent_identity;

    let cri = &mut ctx.accounts.cri;
    cri.agent = agent_key;
    cri.successful_settlements = 0;
    cri.failed_settlements = 0;
    cri.successful_commitments = 0;
    cri.failed_commitments = 0;
    cri.volume_settled = 0;
    cri.last_active_slot = slot;
    cri.created_slot = slot;
    cri.bump = ctx.bumps.cri;

    emit!(AgentRegistered { agent: agent_key });
    Ok(())
}
