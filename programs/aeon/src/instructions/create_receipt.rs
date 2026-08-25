use anchor_lang::prelude::*;

use crate::constants::{RECEIPT_DOMAIN_SEPARATOR, SEED_CONFIG, SEED_CRI, SEED_RECEIPT};
use crate::errors::AeonError;
use crate::events::ReceiptCreated;
use crate::state::{Config, Cri, Receipt};

#[derive(Accounts)]
#[instruction(receipt_id: u64, receipt_type: u8, payload: Vec<u8>)]
pub struct CreateReceipt<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,

    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SEED_CRI, actor.key().as_ref()],
        bump = cri.bump,
        constraint = cri.agent == actor.key() @ AeonError::Unauthorized,
    )]
    pub cri: Account<'info, Cri>,

    #[account(
        init,
        payer = actor,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [SEED_RECEIPT, &receipt_id.to_le_bytes()],
        bump,
    )]
    pub receipt: Account<'info, Receipt>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateReceipt>,
    receipt_id: u64,
    receipt_type: u8,
    payload: Vec<u8>,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AeonError::Paused);
    require!(!payload.is_empty() && payload.len() <= 1024, AeonError::InvalidPayload);

    // Sequence enforcement
    let expected_id = ctx.accounts.config.receipt_counter
        .checked_add(1).ok_or(AeonError::Overflow)?;
    require!(receipt_id == expected_id, AeonError::ReceiptIdMismatch);

    let actor_key = ctx.accounts.actor.key();
    let slot = Clock::get()?.slot;

    // Program-computed hashes — actor cannot influence them
    let payload_hash = anchor_lang::solana_program::hash::hash(&payload).to_bytes();
    let prev_hash = ctx.accounts.cri.last_receipt_hash;

    let mut hasher = anchor_lang::solana_program::hash::Hasher::default();
    hasher.hash(RECEIPT_DOMAIN_SEPARATOR);
    hasher.hash(receipt_id.to_le_bytes().as_ref());
    hasher.hash(receipt_type.to_le_bytes().as_ref());
    hasher.hash(actor_key.as_ref());
    hasher.hash(slot.to_le_bytes().as_ref());
    hasher.hash(payload_hash.as_ref());
    hasher.hash(prev_hash.as_ref());
    let hash = hasher.result().to_bytes();

    // Write receipt PDA
    let receipt = &mut ctx.accounts.receipt;
    receipt.receipt_id = receipt_id;
    receipt.receipt_type = receipt_type;
    receipt.actor = actor_key;
    receipt.slot = slot;
    receipt.payload_hash = payload_hash;
    receipt.prev_hash = prev_hash;
    receipt.hash = hash;
    receipt.bump = ctx.bumps.receipt;

    // Update CRI
    let cri = &mut ctx.accounts.cri;
    require!(cri.last_receipt_hash == prev_hash, AeonError::ReceiptChainMismatch);
    cri.last_receipt_hash = hash;
    cri.receipt_count = cri.receipt_count.checked_add(1).ok_or(AeonError::Overflow)?;
    cri.last_active_slot = slot;

    // Advance counter
    ctx.accounts.config.receipt_counter = receipt_id;

    emit!(ReceiptCreated { receipt_id, actor: actor_key, receipt_type, prev_hash, hash, slot });
    Ok(())
}
