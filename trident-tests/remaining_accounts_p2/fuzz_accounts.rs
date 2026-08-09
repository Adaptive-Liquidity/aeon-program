#![allow(dead_code)]
use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub admin: AddressStorage,

    pub config: AddressStorage,

    pub system_program: AddressStorage,

    pub agent: AddressStorage,

    pub agent_identity: AddressStorage,

    pub cri: AddressStorage,

    pub parent_authority: AddressStorage,

    pub authority: AddressStorage,

    pub payer: AddressStorage,

    pub payee: AddressStorage,

    pub payer_cri: AddressStorage,

    pub payee_cri: AddressStorage,

    pub payer_token: AddressStorage,

    pub payee_token: AddressStorage,

    pub aeon_mint: AddressStorage,

    pub token_program: AddressStorage,

    pub escrow: AddressStorage,

    pub escrow_vault: AddressStorage,

    pub rent: AddressStorage,

    pub releaser: AddressStorage,

    pub canceller: AddressStorage,

    pub payee_a: AddressStorage,

    pub payee_b: AddressStorage,

    pub payee_a_token: AddressStorage,

    pub payee_b_token: AddressStorage,

    pub payee_a_cri: AddressStorage,

    pub payee_b_cri: AddressStorage,

    pub creator: AddressStorage,

    pub creator_identity: AddressStorage,

    pub organization: AddressStorage,

    pub org_treasury: AddressStorage,

    pub creator_member: AddressStorage,

    pub member: AddressStorage,

    pub org_member: AddressStorage,

    pub member_token: AddressStorage,

    pub admin_member: AddressStorage,

    pub recipient_member: AddressStorage,

    pub recipient_token: AddressStorage,

    pub admin_token: AddressStorage,

    pub member_b: AddressStorage,

    pub member_b_token: AddressStorage,

    pub new_agent: AddressStorage,

    pub new_member: AddressStorage,

    pub target_member: AddressStorage,

    pub authority_member: AddressStorage,

    pub destination: AddressStorage,
}
