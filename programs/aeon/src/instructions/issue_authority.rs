use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::associated_token::{
    get_associated_token_address, AssociatedToken, Create, create_idempotent,
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};

use crate::constants::{
    AUTH_STATUS_ACTIVE, BOND_STATUS_ACTIVE, MAX_AUTHORITY_DEPTH, MAX_BLOCKED_RECIPIENTS, MAX_CATEGORIES, SEED_AGENT,
    SEED_AUTHORITY, SEED_AUTHORITY_BOND, SEED_CONFIG,
};
use crate::errors::AeonError;
use crate::events::AuthorityIssued;
use crate::state::{AgentIdentity, Authority, AuthorityBond, Config};

#[derive(Accounts)]
#[instruction(
    authority_id: u64,
    budget: u64,
    max_per_tx: u64,
    max_total: u64,
    categories: Vec<[u8; 16]>,
    parent_id: u64,
    expiry_slot: u64,
    bond_amount: u64
)]
pub struct IssueAuthority<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_CONFIG],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        seeds = [SEED_AGENT, agent.key().as_ref()],
        bump = agent_identity.bump,
        constraint = agent_identity.agent == agent.key() @ AeonError::Unauthorized,
        constraint = agent_identity.active @ AeonError::AgentNotActive,
    )]
    pub agent_identity: Box<Account<'info, AgentIdentity>>,

    /// Parent authority account — pass only when parent_id != 0.
    pub parent_authority: Option<Box<Account<'info, Authority>>>,

    #[account(
        init,
        payer = agent,
        space = 8 + Authority::INIT_SPACE,
        seeds = [SEED_AUTHORITY, &authority_id.to_le_bytes()],
        bump
    )]
    pub authority: Box<Account<'info, Authority>>,

    // ── Bond accounts (only required when bond_amount > 0) ──
    #[account(
        init,
        payer = agent,
        space = 8 + AuthorityBond::INIT_SPACE,
        seeds = [SEED_AUTHORITY_BOND, &authority_id.to_le_bytes()],
        bump
    )]
    pub bond: Option<Box<Account<'info, AuthorityBond>>>,

    /// Agent's token account that funds the bond (source of the transfer).
    #[account(
        mut,
        constraint = agent_vault.owner == agent.key() @ AeonError::Unauthorized,
        constraint = agent_vault.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub agent_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    /// Bond vault = ATA owned by the bond PDA (destination of the transfer).
    #[account(
        mut,
        constraint = bond_vault.owner == bond.as_ref().map(|b| b.key()).unwrap_or_default() @ AeonError::Unauthorized,
        constraint = bond_vault.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub bond_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(address = config.aeon_mint @ AeonError::InvalidMint)]
    pub aeon_mint: Option<Box<InterfaceAccount<'info, Mint>>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

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
    bond_amount: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);
    require!(budget > 0, AeonError::InvalidBudget);
    require!(
        categories.len() <= MAX_CATEGORIES,
        AeonError::InvalidCategoryCount
    );

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

        final_max_per_tx = final_max_per_tx.min(parent.max_per_tx);
        final_max_total = final_max_total.min(parent.max_total);

        if parent.category_count > 0 {
            let mut intersected = [[0u8; 16]; MAX_CATEGORIES];
            let mut count: u8 = 0;
            if final_category_count == 0 {
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
            if parent.category_count > 0 && final_category_count == 0 && categories.len() > 0 {
                return err!(AeonError::EmptyCategoryIntersection);
            }
        }
    } else {
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
    authority.bond_amount = bond_amount;
    authority.bump = ctx.bumps.authority;

    // Handle optional bond accounts
    if bond_amount > 0 {
        // All bond accounts must be present together.
        let bond = ctx.accounts.bond.as_mut().ok_or(AeonError::InsufficientBond)?;
        let agent_vault = ctx.accounts.agent_vault.as_ref().ok_or(AeonError::InsufficientBond)?;
        let bond_vault = ctx.accounts.bond_vault.as_ref().ok_or(AeonError::InsufficientBond)?;
        let aeon_mint = ctx.accounts.aeon_mint.as_ref().ok_or(AeonError::InvalidMint)?;
        let token_program = ctx.accounts.token_program.as_ref().ok_or(AeonError::InvalidMint)?;
        let ata_program = ctx.accounts.associated_token_program.as_ref().ok_or(AeonError::InvalidMint)?;

        // Initialize the AuthorityBond account data.
        bond.authority_id = authority_id;
        bond.agent = ctx.accounts.agent.key();
        bond.amount = bond_amount;
        bond.status = BOND_STATUS_ACTIVE;
        bond.bump = ctx.bumps.bond.unwrap_or(0);

        // Create the bond vault ATA (idempotent) owned by the bond PDA.
        let bond_pda = bond.to_account_info().key();
        let bond_vault_ata = get_associated_token_address(&bond_pda, &aeon_mint.key());

        // The bond_vault account passed in MUST be this ATA.
        require!(
            bond_vault.key() == bond_vault_ata,
            AeonError::Unauthorized
        );

        // Idempotent ATA creation (CPI to associated-token-program).
        create_idempotent(
            CpiContext::new(
                ata_program.to_account_info(),
                Create {
                    payer: ctx.accounts.agent.to_account_info(),
                    associated_token: bond_vault.to_account_info(),
                    authority: bond.to_account_info(),
                    mint: aeon_mint.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: token_program.to_account_info(),
                },
            ),
        )?;

        // Transfer bond_amount from agent_vault -> bond_vault.
        let cpi_accounts = TransferChecked {
            from: agent_vault.to_account_info(),
            mint: aeon_mint.to_account_info(),
            to: bond_vault.to_account_info(),
            authority: ctx.accounts.agent.to_account_info(),
        };
        transfer_checked(
            CpiContext::new(token_program.to_account_info(), cpi_accounts),
            bond_amount,
            aeon_mint.decimals,
        )?;
    } else {
        // bond_amount == 0: all bond accounts must be None.
        require!(ctx.accounts.bond.is_none(), AeonError::Unauthorized);
        require!(ctx.accounts.agent_vault.is_none(), AeonError::Unauthorized);
        require!(ctx.accounts.bond_vault.is_none(), AeonError::Unauthorized);
        require!(ctx.accounts.aeon_mint.is_none(), AeonError::Unauthorized);
        require!(ctx.accounts.token_program.is_none(), AeonError::Unauthorized);
        require!(ctx.accounts.associated_token_program.is_none(), AeonError::Unauthorized);
    }

    emit!(AuthorityIssued {
        authority_id,
        agent: ctx.accounts.agent.key(),
        budget,
        parent_id,
    });

    Ok(())
}
