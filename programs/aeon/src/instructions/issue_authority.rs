use anchor_lang::prelude::*;

use crate::constants::{
    AUTH_STATUS_ACTIVE, MAX_AUTHORITY_DEPTH, MAX_BLOCKED_RECIPIENTS, MAX_CATEGORIES, SEED_AGENT,
    SEED_AUTHORITY, SEED_CONFIG,
};
use crate::errors::AeonError;
use crate::events::AuthorityIssued;
use crate::state::{AgentIdentity, Authority, Config};

#[derive(Accounts)]
#[instruction(
    authority_id: u64,
    budget: u64,
    max_per_tx: u64,
    max_total: u64,
    categories: Vec<[u8; 16]>,
    parent_id: u64,
    expiry_slot: u64
)]
pub struct IssueAuthority<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [SEED_AGENT, agent.key().as_ref()],
        bump = agent_identity.bump,
        constraint = agent_identity.agent == agent.key() @ AeonError::Unauthorized,
        constraint = agent_identity.active @ AeonError::AgentNotActive,
    )]
    pub agent_identity: Account<'info, AgentIdentity>,

    /// Parent authority account — pass only when parent_id != 0.
    /// Handler validates authority_id match, Active status, depth, budget, and policy.
    pub parent_authority: Option<Account<'info, Authority>>,

    #[account(
        init,
        payer = agent,
        space = 8 + Authority::INIT_SPACE,
        seeds = [SEED_AUTHORITY, &authority_id.to_le_bytes()],
        bump
    )]
    pub authority: Account<'info, Authority>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<IssueAuthority>,
    authority_id: u64,
    budget: u64,
    max_per_tx: u64,
    max_total: u64,
    categories: Vec<[u8; 16]>,
    parent_id: u64,
    expiry_slot: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);
    require!(budget > 0, AeonError::InvalidBudget);
    require!(
        categories.len() <= MAX_CATEGORIES,
        AeonError::InvalidCategoryCount
    );

    // Client must pass authority_id = config.authority_counter + 1 (avoids fragile seed unwrap).
    let expected_id = ctx
        .accounts
        .config
        .authority_counter
        .checked_add(1)
        .ok_or(AeonError::Overflow)?;
    require!(authority_id == expected_id, AeonError::Unauthorized);

    let mut depth: u8 = 0;
    let mut final_max_per_tx = max_per_tx;
    let mut final_max_total = max_total;
    let mut final_categories = [[0u8; 16]; MAX_CATEGORIES];
    let mut final_category_count: u8 = categories.len() as u8;

    for (i, cat) in categories.iter().enumerate() {
        final_categories[i] = *cat;
    }

    if parent_id != 0 {
        let parent = ctx
            .accounts
            .parent_authority
            .as_ref()
            .ok_or(AeonError::ParentRequired)?;

        require!(
            parent.authority_id == parent_id,
            AeonError::ParentIdMismatch
        );
        require!(
            parent.status == AUTH_STATUS_ACTIVE,
            AeonError::ParentNotActive
        );

        // Parent must belong to the same agent (no cross-agent delegation in v0.1).
        require!(
            parent.agent == ctx.accounts.agent.key(),
            AeonError::Unauthorized
        );

        let next_depth = parent
            .depth
            .checked_add(1)
            .ok_or(AeonError::MaxDelegationDepth)?;
        require!(
            next_depth <= MAX_AUTHORITY_DEPTH,
            AeonError::MaxDelegationDepth
        );
        depth = next_depth;

        let parent_remaining = parent
            .budget
            .checked_sub(parent.spent)
            .ok_or(AeonError::Overflow)?;
        require!(budget <= parent_remaining, AeonError::ChildBudgetExceedsParent);

        // Child policy must be stricter or equal.
        final_max_per_tx = final_max_per_tx.min(parent.max_per_tx);
        final_max_total = final_max_total.min(parent.max_total);

        // Category intersection when parent has categories.
        if parent.category_count > 0 {
            let mut intersected = [[0u8; 16]; MAX_CATEGORIES];
            let mut count: u8 = 0;
            if final_category_count == 0 {
                // Empty child categories → inherit parent set.
                for i in 0..(parent.category_count as usize) {
                    intersected[i] = parent.categories[i];
                }
                count = parent.category_count;
            } else {
                for i in 0..(final_category_count as usize) {
                    let cat = final_categories[i];
                    for j in 0..(parent.category_count as usize) {
                        if parent.categories[j] == cat {
                            intersected[count as usize] = cat;
                            count = count.saturating_add(1);
                            break;
                        }
                    }
                }
            }
            final_categories = intersected;
            final_category_count = count;
            // Non-empty parent policy + empty intersection is a hard fail (not "all allowed").
            if parent.category_count > 0 && final_category_count == 0 && categories.len() > 0 {
                return err!(AeonError::EmptyCategoryIntersection);
            }
        }
    } else {
        // Root: parent account must not be supplied (defense in depth).
        require!(
            ctx.accounts.parent_authority.is_none(),
            AeonError::Unauthorized
        );
    }

    let config = &mut ctx.accounts.config;
    config.authority_counter = authority_id;

    if final_max_total > budget {
        final_max_total = budget;
    }

    let authority = &mut ctx.accounts.authority;
    authority.authority_id = authority_id;
    authority.agent = ctx.accounts.agent.key();
    authority.parent_id = parent_id;
    authority.depth = depth;
    authority.budget = budget;
    authority.spent = 0;
    authority.max_per_tx = final_max_per_tx;
    authority.max_total = final_max_total;
    authority.category_count = final_category_count;
    authority.categories = final_categories;
    authority.blocked_count = 0;
    authority.blocked_recipients = [Pubkey::default(); MAX_BLOCKED_RECIPIENTS];
    authority.require_min_reserve = 0;
    authority.expiry_slot = expiry_slot;
    authority.status = AUTH_STATUS_ACTIVE;
    authority.bump = ctx.bumps.authority;

    emit!(AuthorityIssued {
        authority_id,
        agent: ctx.accounts.agent.key(),
        budget,
        parent_id,
    });

    Ok(())
}
