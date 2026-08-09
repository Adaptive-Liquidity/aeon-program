use anchor_lang::prelude::*;

use crate::constants::{AUTH_STATUS_ACTIVE, AUTH_STATUS_REVOKED, SEED_AUTHORITY, SEED_CONFIG};
use crate::errors::AeonError;
use crate::events::AuthorityRevoked;
use crate::state::{Authority, Config};

#[derive(Accounts)]
#[instruction(authority_id: u64)]
pub struct RevokeAuthority<'info> {
    pub agent: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [SEED_AUTHORITY, &authority_id.to_le_bytes()],
        bump = authority.bump,
        constraint = authority.authority_id == authority_id @ AeonError::Unauthorized,
        constraint = authority.agent == agent.key() @ AeonError::AuthorityAgentMismatch,
    )]
    pub authority: Account<'info, Authority>,
}

pub fn handler(ctx: Context<RevokeAuthority>, authority_id: u64) -> Result<()> {
    require!(
        ctx.accounts.authority.status == AUTH_STATUS_ACTIVE,
        AeonError::AuthorityAlreadyRevoked
    );

    let cascade = !ctx.remaining_accounts.is_empty();
    let agent_key = ctx.accounts.agent.key();
    let program_id = *ctx.program_id;

    for i in 0..ctx.remaining_accounts.len() {
        let acc_info = &ctx.remaining_accounts[i];
        require!(acc_info.is_writable, AeonError::InvalidCascadeChild);
        require_keys_eq!(*acc_info.owner, program_id, AeonError::InvalidCascadeChild);

        let mut data = acc_info.try_borrow_mut_data()?;
        let mut slice: &[u8] = &data;
        let mut child = Authority::try_deserialize(&mut slice)
            .map_err(|_| error!(AeonError::InvalidCascadeChild))?;
        require!(child.parent_id == authority_id, AeonError::InvalidCascadeChild);
        require!(child.agent == agent_key, AeonError::InvalidCascadeChild);
        if child.status == AUTH_STATUS_ACTIVE {
            child.status = AUTH_STATUS_REVOKED;
        }
        {
            let mut cursor = std::io::Cursor::new(&mut data[8..]);
            child.try_serialize(&mut cursor)?;
        }
    }

    ctx.accounts.authority.status = AUTH_STATUS_REVOKED;
    emit!(AuthorityRevoked { authority_id, cascade });
    Ok(())
}
