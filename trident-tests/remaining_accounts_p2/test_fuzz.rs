//! P2 Trident fuzz target: AEON remaining_accounts + authority hierarchy.
//!
//! Focus (from docs/HEAVY_REVIEW + NEGATIVE_E2E_STRATEGIES):
//! - `revoke_authority` cascade via remaining_accounts
//! - adversarial remaining metas (non-writable, wrong owner, wrong parent)
//! - authority issue depth / budget edges
//! - conservation-style end invariants (spent ≤ budget; no panics)
//!
//! Run: `trident fuzz run remaining_accounts_p2` from repo root (or via npm script).

use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::aeon;

const PROGRAM_ID: Pubkey = pubkey!("8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn");
const SYSTEM_PROGRAM: Pubkey = pubkey!("11111111111111111111111111111111");
const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/// Anchor account discriminator size.
const DISC: usize = 8;

/// Minimal Authority layout fields we assert on (must match state.rs order after disc).
#[derive(Debug, BorshDeserialize)]
#[allow(dead_code)]
struct AuthorityView {
    authority_id: u64,
    agent: Pubkey,
    parent_id: u64,
    depth: u8,
    budget: u64,
    spent: u64,
    max_per_tx: u64,
    max_total: u64,
    // rest ignored by Borsh if we stop early — deserialize full via skip fields
    category_count: u8,
    categories: [[u8; 16]; 8],
    blocked_count: u8,
    blocked_recipients: [Pubkey; 4],
    require_min_reserve: u64,
    expiry_slot: u64,
    status: u8,
    bump: u8,
}

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
    /// Monotonic authority id issued this iteration (starts at 0; first issue → 1).
    next_authority_id: u64,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
            next_authority_id: 0,
        }
    }

    /// Bootstrap mint + config + agent + root authority (id=1).
    #[init]
    fn start(&mut self) {
        let payer = self.trident.payer().pubkey();
        self.trident.airdrop(&payer, 100 * LAMPORTS_PER_SOL);

        // --- Mint (classic SPL) ---
        let mint = self.fuzz_accounts.aeon_mint.insert(&mut self.trident, None);
        let mint_ixs = self
            .trident
            .initialize_mint(&payer, &mint, 6, &payer, Some(&payer));
        let r = self.trident.process_transaction(&mint_ixs, Some("init_mint"));
        if !r.is_success() {
            // Can't continue this iteration meaningfully
            return;
        }

        // --- Config PDA ---
        let (config, _) = self
            .trident
            .find_program_address(&[b"aeon_config"], &PROGRAM_ID);
        self.fuzz_accounts.config.insert_with_address(config);

        let ix = aeon::InitializeConfigInstruction::data(aeon::InitializeConfigInstructionData::new(
            mint,
        ))
        .accounts(aeon::InitializeConfigInstructionAccounts::new(
            payer,
            config,
            SYSTEM_PROGRAM,
        ))
        .instruction();
        let r = self
            .trident
            .process_transaction(&[ix], Some("initialize_config"));
        if !r.is_success() {
            return;
        }

        // --- Register agent (payer) ---
        let (agent_identity, _) = self
            .trident
            .find_program_address(&[b"agent", payer.as_ref()], &PROGRAM_ID);
        let (cri, _) = self
            .trident
            .find_program_address(&[b"cri", payer.as_ref()], &PROGRAM_ID);
        self.fuzz_accounts
            .agent_identity
            .insert_with_address(agent_identity);
        self.fuzz_accounts.cri.insert_with_address(cri);
        self.fuzz_accounts.agent.insert_with_address(payer);

        let ix = aeon::RegisterAgentInstruction::data(aeon::RegisterAgentInstructionData {})
            .accounts(aeon::RegisterAgentInstructionAccounts::new(
                payer,
                config,
                agent_identity,
                cri,
                SYSTEM_PROGRAM,
            ))
            .instruction();
        let r = self
            .trident
            .process_transaction(&[ix], Some("register_agent"));
        if !r.is_success() {
            return;
        }

        // --- Root authority #1 ---
        let root_id: u64 = 1;
        let root_id_bytes = root_id.to_le_bytes();
        let (authority, _) = self
            .trident
            .find_program_address(&[b"authority", &root_id_bytes], &PROGRAM_ID);
        self.fuzz_accounts.authority.insert_with_address(authority);

        // Optional parent = None → pass program id (Anchor optional convention)
        let ix = aeon::IssueAuthorityInstruction::data(aeon::IssueAuthorityInstructionData::new(
            root_id,
            1_000_000, // budget
            100_000,   // max_per_tx
            1_000_000, // max_total
            vec![],    // unrestricted categories
            0,         // parent_id root
            0,         // never expires
        ))
        .accounts(aeon::IssueAuthorityInstructionAccounts::new(
            payer,
            config,
            agent_identity,
            PROGRAM_ID, // parent_authority None
            authority,
            SYSTEM_PROGRAM,
        ))
        .instruction();
        let r = self
            .trident
            .process_transaction(&[ix], Some("issue_root_authority"));
        if r.is_success() {
            self.next_authority_id = 1;
        }
    }

    /// Issue a child authority under root (or random existing parent).
    #[flow]
    fn flow_issue_child(&mut self) {
        if self.next_authority_id == 0 {
            return;
        }
        let payer = self.trident.payer().pubkey();
        let config = match self.fuzz_accounts.config.get(&mut self.trident) {
            Some(c) => c,
            None => return,
        };
        let agent_identity = match self.fuzz_accounts.agent_identity.get(&mut self.trident) {
            Some(a) => a,
            None => return,
        };
        let parent = match self.fuzz_accounts.authority.get(&mut self.trident) {
            Some(p) => p,
            None => return,
        };

        let child_id = self.next_authority_id + 1;
        let child_bytes = child_id.to_le_bytes();
        let (child_pda, _) = self
            .trident
            .find_program_address(&[b"authority", &child_bytes], &PROGRAM_ID);

        // Randomize budget relative to parent (may fail ChildBudgetExceedsParent — ok)
        let budget = self.trident.random_from_range(1u64..=1_500_000);
        let max_per_tx = self.trident.random_from_range(1u64..=budget);

        // parent_id: usually 1 (root) — sometimes random garbage to exercise ParentIdMismatch
        let use_valid_parent = self.trident.random_bool();
        let (parent_id, parent_account) = if use_valid_parent {
            // Prefer root id=1 if parent is the root PDA we created
            (1u64, parent)
        } else {
            // Wrong parent_id with real parent account → mismatch path
            (self.trident.random_from_range(2u64..=99), parent)
        };

        let ix = aeon::IssueAuthorityInstruction::data(aeon::IssueAuthorityInstructionData::new(
            child_id,
            budget,
            max_per_tx,
            budget,
            vec![],
            parent_id,
            0,
        ))
        .accounts(aeon::IssueAuthorityInstructionAccounts::new(
            payer,
            config,
            agent_identity,
            parent_account,
            child_pda,
            SYSTEM_PROGRAM,
        ))
        .instruction();

        let r = self
            .trident
            .process_transaction(&[ix], Some("issue_child"));
        if r.is_success() {
            self.next_authority_id = child_id;
            self.fuzz_accounts.authority.insert_with_address(child_pda);
        }
        // Failures are expected under adversarial parent_id/budget — no panic is the win.
    }

    /// Revoke with remaining_accounts cascade — mix valid and adversarial metas.
    #[flow]
    fn flow_revoke_cascade(&mut self) {
        if self.next_authority_id == 0 {
            return;
        }
        let payer = self.trident.payer().pubkey();
        let config = match self.fuzz_accounts.config.get(&mut self.trident) {
            Some(c) => c,
            None => return,
        };

        // Prefer revoking root (id=1) so cascade of children is meaningful.
        let root_id: u64 = 1;
        let root_bytes = root_id.to_le_bytes();
        let (root_pda, _) = self
            .trident
            .find_program_address(&[b"authority", &root_bytes], &PROGRAM_ID);

        // Build remaining_accounts set — 0..3 metas of mixed quality
        let n = self.trident.random_from_range(0usize..=3);
        let mut remaining: Vec<AccountMeta> = Vec::with_capacity(n);
        for _ in 0..n {
            let mode = self.trident.random_from_range(0u8..=4);
            match mode {
                // Valid writable child PDA (if any child exists beyond root)
                0 if self.next_authority_id > 1 => {
                    let cid = self
                        .trident
                        .random_from_range(2u64..=self.next_authority_id);
                    let cb = cid.to_le_bytes();
                    let (c_pda, _) = self
                        .trident
                        .find_program_address(&[b"authority", &cb], &PROGRAM_ID);
                    remaining.push(AccountMeta::new(c_pda, false));
                }
                // Non-writable child (must fail InvalidCascadeChild)
                1 if self.next_authority_id > 1 => {
                    let cid = self
                        .trident
                        .random_from_range(2u64..=self.next_authority_id);
                    let cb = cid.to_le_bytes();
                    let (c_pda, _) = self
                        .trident
                        .find_program_address(&[b"authority", &cb], &PROGRAM_ID);
                    remaining.push(AccountMeta::new_readonly(c_pda, false));
                }
                // Wrong owner (system program account / random funded account)
                2 => {
                    let junk = self.trident.random_pubkey();
                    self.trident.airdrop(&junk, LAMPORTS_PER_SOL);
                    remaining.push(AccountMeta::new(junk, false));
                }
                // Program id as remaining (wrong owner)
                3 => {
                    remaining.push(AccountMeta::new(PROGRAM_ID, false));
                }
                // Root itself as cascade child (parent_id mismatch for self)
                _ => {
                    remaining.push(AccountMeta::new(root_pda, false));
                }
            }
        }

        let ix = aeon::RevokeAuthorityInstruction::data(aeon::RevokeAuthorityInstructionData::new(
            root_id,
        ))
        .accounts(aeon::RevokeAuthorityInstructionAccounts::new(
            payer, config, root_pda,
        ))
        .remaining_accounts(remaining)
        .instruction();

        // Success or structured error only — never panic.
        let _ = self
            .trident
            .process_transaction(&[ix], Some("revoke_cascade"));
    }

    /// Adversarial remaining_accounts-only probe: revoke already-revoked / random id.
    #[flow]
    fn flow_revoke_adversarial_id(&mut self) {
        if self.next_authority_id == 0 {
            return;
        }
        let payer = self.trident.payer().pubkey();
        let config = match self.fuzz_accounts.config.get(&mut self.trident) {
            Some(c) => c,
            None => return,
        };

        // Random authority id that may or may not exist
        let aid = self
            .trident
            .random_from_range(1u64..=self.next_authority_id.saturating_add(3));
        let ab = aid.to_le_bytes();
        let (auth_pda, _) = self
            .trident
            .find_program_address(&[b"authority", &ab], &PROGRAM_ID);

        // Sometimes attach garbage remaining
        let mut remaining = Vec::new();
        if self.trident.random_bool() {
            remaining.push(AccountMeta::new(self.trident.random_pubkey(), false));
        }

        let ix = aeon::RevokeAuthorityInstruction::data(aeon::RevokeAuthorityInstructionData::new(
            aid,
        ))
        .accounts(aeon::RevokeAuthorityInstructionAccounts::new(
            payer, config, auth_pda,
        ))
        .remaining_accounts(remaining)
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[ix], Some("revoke_adversarial"));
    }

    /// Pay path budget edges (spent conservation on success).
    #[flow]
    fn flow_pay_budget(&mut self) {
        if self.next_authority_id == 0 {
            return;
        }
        let payer = self.trident.payer().pubkey();
        let config = match self.fuzz_accounts.config.get(&mut self.trident) {
            Some(c) => c,
            None => return,
        };
        let mint = match self.fuzz_accounts.aeon_mint.get(&mut self.trident) {
            Some(m) => m,
            None => return,
        };
        let payer_cri = match self.fuzz_accounts.cri.get(&mut self.trident) {
            Some(c) => c,
            None => return,
        };

        // Ensure payer ATA funded
        let payer_ata_ix =
            self.trident
                .initialize_associated_token_account(&payer, &mint, &payer);
        let _ = self
            .trident
            .process_transaction(&[payer_ata_ix], Some("ata_payer"));
        let payer_ata =
            self.trident
                .get_associated_token_address(&mint, &payer, &TOKEN_PROGRAM);
        // mint tokens
        let mint_ix = self
            .trident
            .mint_to(&payer_ata, &mint, &payer, 10_000_000);
        let _ = self
            .trident
            .process_transaction(&[mint_ix], Some("mint_to_payer"));

        // Second agent as payee — create ephemeral key as only-pubkey account + ATA
        // Use a deterministic secondary: hash of "payee"
        let payee = self.trident.random_pubkey();
        self.trident.airdrop(&payee, LAMPORTS_PER_SOL);

        // Register payee requires payee to sign — can't with random pubkey.
        // Use payer as self-pay should fail Unauthorized; for success path we need
        // a second registered agent. With single-signer SVM, skip true multi-agent pay.
        // Instead exercise pay with authority gates (overspend) using payee = random
        // (will fail CRI seeds unless we init CRI PDA — which requires register).
        //
        // Practical P2 scope: call pay with mismatched accounts / overspend and
        // assert no panic + spent conservation when authority still Active.
        let root_id = 1u64;
        let root_bytes = root_id.to_le_bytes();
        let (auth_pda, _) = self
            .trident
            .find_program_address(&[b"authority", &root_bytes], &PROGRAM_ID);

        // Fake payee CRI/identity PDAs (uninitialized) → expect fail closed
        let (payee_cri, _) = self
            .trident
            .find_program_address(&[b"cri", payee.as_ref()], &PROGRAM_ID);
        let payee_ata_ix =
            self.trident
                .initialize_associated_token_account(&payer, &mint, &payee);
        let _ = self
            .trident
            .process_transaction(&[payee_ata_ix], Some("ata_payee"));
        let payee_ata =
            self.trident
                .get_associated_token_address(&mint, &payee, &TOKEN_PROGRAM);

        let amount = self.trident.random_from_range(1u64..=2_000_000);
        let spent_before = self
            .load_authority(&auth_pda)
            .map(|a| a.spent)
            .unwrap_or(0);

        let ix = aeon::PayInstruction::data(aeon::PayInstructionData::new(
            amount,
            root_id,
            [0u8; 16],
        ))
        .accounts(aeon::PayInstructionAccounts::new(
            payer,
            payee,
            config,
            auth_pda,
            payer_cri,
            payee_cri,
            payer_ata,
            payee_ata,
            mint,
            TOKEN_PROGRAM,
        ))
        .instruction();

        let r = self.trident.process_transaction(&[ix], Some("pay_budget"));

        // Invariant: if pay failed, spent must not increase (fail-closed spent).
        if r.is_error() {
            if let Some(auth) = self.load_authority(&auth_pda) {
                if auth.spent > spent_before {
                    panic!(
                        "FAIL-CLOSED VIOLATION: spent increased on failed pay ({} → {})",
                        spent_before, auth.spent
                    );
                }
            }
        } else if let Some(auth) = self.load_authority(&auth_pda) {
            // spent ≤ budget always
            if auth.spent > auth.budget {
                panic!(
                    "BUDGET VIOLATION: spent {} > budget {}",
                    auth.spent, auth.budget
                );
            }
        }
    }

    /// End-of-iteration conservation checks on all known authority PDAs.
    #[end]
    fn end(&mut self) {
        if self.next_authority_id == 0 {
            return;
        }
        for id in 1..=self.next_authority_id {
            let bytes = id.to_le_bytes();
            let (pda, _) = self
                .trident
                .find_program_address(&[b"authority", &bytes], &PROGRAM_ID);
            if let Some(auth) = self.load_authority(&pda) {
                // Core economic invariants
                if auth.spent > auth.budget {
                    panic!(
                        "INV spent<=budget failed id={} spent={} budget={}",
                        id, auth.spent, auth.budget
                    );
                }
                if auth.depth > 3 {
                    panic!("INV depth<=3 failed id={} depth={}", id, auth.depth);
                }
                if auth.status > 3 {
                    panic!("INV status valid failed id={} status={}", id, auth.status);
                }
            }
        }
    }

    fn load_authority(&mut self, key: &Pubkey) -> Option<AuthorityView> {
        let acc = self.trident.get_account(key);
        if acc.data().len() <= DISC {
            return None;
        }
        // Owner must be program for a real Authority account
        if acc.owner() != &PROGRAM_ID {
            return None;
        }
        AuthorityView::try_from_slice(&acc.data()[DISC..]).ok()
    }
}

fn main() {
    // iterations, flows-per-iteration — keep short for CI; scale up locally
    FuzzTest::fuzz(200, 40);
}
