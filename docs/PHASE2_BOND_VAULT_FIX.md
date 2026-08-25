# Phase 2 — Bond Vault Fix (reference implementation)

**Problem:** `issue_authority` transfers `bond_amount` into `bond_vault`
(`remaining_accounts[1]`) but never initializes that token account as owned by the
bond PDA. `slash_bond` constrains `bond_vault.owner == bond.key()`, so the transfer
destination is invalid and the bond path is broken end-to-end.

**Fix:** Make the bond vault an **Associated Token Account owned by the bond PDA**,
created (idempotently) before the transfer.

---

## 1. Move bond accounts out of `remaining_accounts` into named accounts

The current `issue_authority` uses `remaining_accounts` for the bond CPI, which is
fragile and not IDL-visible. Replace with named accounts.

### New accounts struct (additions to `IssueAuthority`)

```rust
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

    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [SEED_AGENT, agent.key().as_ref()],
        bump = agent_identity.bump,
        constraint = agent_identity.agent == agent.key() @ AeonError::Unauthorized,
        constraint = agent_identity.active @ AeonError::AgentNotActive,
    )]
    pub agent_identity: Account<'info, AgentIdentity>,

    pub parent_authority: Option<Account<'info, Authority>>,

    #[account(
        init,
        payer = agent,
        space = 8 + Authority::INIT_SPACE,
        seeds = [SEED_AUTHORITY, &authority_id.to_le_bytes()],
        bump
    )]
    pub authority: Account<'info, Authority>,

    // ── Bond accounts (only required when bond_amount > 0) ──
    #[account(
        init,
        payer = agent,
        space = 8 + AuthorityBond::INIT_SPACE,
        seeds = [SEED_AUTHORITY_BOND, &authority_id.to_le_bytes()],
        bump
    )]
    pub bond: Option<Account<'info, AuthorityBond>>,

    /// Agent's token account that funds the bond (source of the transfer).
    #[account(
        mut,
        constraint = agent_vault.owner == agent.key() @ AeonError::Unauthorized,
        constraint = agent_vault.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub agent_vault: Option<InterfaceAccount<'info, TokenAccount>>,

    /// Bond vault = ATA owned by the bond PDA (destination of the transfer).
    #[account(
        mut,
        constraint = bond_vault.owner == bond.key() @ AeonError::Unauthorized,
        constraint = bond_vault.mint == config.aeon_mint @ AeonError::InvalidMint,
    )]
    pub bond_vault: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = config.aeon_mint @ AeonError::InvalidMint)]
    pub aeon_mint: Option<InterfaceAccount<'info, Mint>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

    pub system_program: Program<'info, System>,
}
```

> **Note on `Option`:** Anchor requires all bond accounts to be present together when
> `bond_amount > 0`, and all `None` when `bond_amount == 0`. Enforce this in the handler
> with a single `require!` so the two cases can't be mixed.

---

## 2. Handler logic (bond branch)

Replace the `remaining_accounts` block with:

```rust
if bond_amount > 0 {
    // All bond accounts must be present together.
    let bond = ctx.accounts.bond.as_ref().ok_or(AeonError::InsufficientBond)?;
    let agent_vault = ctx.accounts.agent_vault.as_ref().ok_or(AeonError::InsufficientBond)?;
    let bond_vault = ctx.accounts.bond_vault.as_ref().ok_or(AeonError::InsufficientBond)?;
    let aeon_mint = ctx.accounts.aeon_mint.as_ref().ok_or(AeonError::InvalidMint)?;
    let token_program = ctx.accounts.token_program.as_ref().ok_or(AeonError::InvalidMint)?;
    let ata_program = ctx.accounts.associated_token_program.as_ref().ok_or(AeonError::InvalidMint)?;

    // Initialize the AuthorityBond account data.
    let bond = &mut ctx.accounts.bond;
    bond.authority_id = authority_id;
    bond.agent = ctx.accounts.agent.key();
    bond.amount = bond_amount;
    bond.status = BOND_STATUS_ACTIVE;
    bond.bump = ctx.bumps.bond;

    // Create the bond vault ATA (idempotent) owned by the bond PDA.
    let bond_pda = bond.to_account_info().key();
    let bond_vault_ata = get_associated_token_address(&bond_pda, &aeon_mint.key());

    // The bond_vault account passed in MUST be this ATA.
    require!(
        bond_vault.key() == bond_vault_ata,
        AeonError::Unauthorized
    );

    // Idempotent ATA creation (CPI to associated-token-program).
    create_associated_token_account_idempotent(
        CpiContext::new(
            ata_program.to_account_info(),
            CreateAssociatedTokenAccount {
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
```

---

## 3. Imports to add

```rust
use anchor_spl::associated_token::{
    get_associated_token_address, AssociatedToken, CreateAssociatedTokenAccount,
    create_associated_token_account_idempotent,
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};
```

---

## 4. Why this is correct

- `bond_vault` is now a real ATA owned by the bond PDA, so `slash_bond`'s existing
  constraint `bond_vault.owner == bond.key()` holds.
- ATA creation is idempotent, so re-issuing (or a failed-then-retried tx) won't double-create.
- The transfer source (`agent_vault`) is the agent's own ATA, signed by the agent.
- `slash_bond` already signs with the bond PDA seeds to move funds out — no change needed there.

---

## 5. What `slash_bond` needs (verify, likely no change)

`slash_bond` already:
- constrains `bond_vault.owner == bond.key()` ✅ (now true)
- constrains `bond_vault.mint == config.aeon_mint` ✅
- signs the transfer with `SEED_AUTHORITY_BOND` seeds ✅

No change expected in `slash_bond` beyond confirming the vault is the ATA.

---

## 6. Test impact

- `issueAuthority` SDK method must now pass the bond accounts (agent_vault, bond_vault,
  aeon_mint, token_program, associated_token_program) when `bondAmount > 0`.
- Add NEG-BOND-* tests (see BUILD_PLAN Phase 5).
