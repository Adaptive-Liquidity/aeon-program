# P2 Trident Fuzz — remaining_accounts / cascade / authority

**Status: PASS** (200 iterations × 40 flows, zero instruction panics)

## Scope

Focused harness (not full 16-ix matrix) covering:

| Flow | What it exercises |
|------|-------------------|
| `start` (init) | mint → `initialize_config` → `register_agent` → root `issue_authority` |
| `flow_issue_child` | child issue under root; adversarial parent_id / budget |
| `flow_revoke_cascade` | `revoke_authority` + mixed `remaining_accounts` (writable child, non-writable, wrong owner, program id, self) |
| `flow_revoke_adversarial_id` | revoke random/missing ids + garbage remaining |
| `flow_pay_budget` | pay with unregistered payee / overspend edges; **fail-closed spent** assert |
| `end` | `spent ≤ budget`, `depth ≤ 3`, `status ≤ 3` on known authority PDAs |

## Layout

```
trident-tests/
  Cargo.toml              # fuzz_tests workspace (trident-fuzz 0.12 + token)
  Trident.toml            # program id + path to target/deploy/aeon.so
  remaining_accounts_p2/
    test_fuzz.rs          # hand-written flows + invariants
    types.rs              # Trident-generated ix types (do not edit by hand)
    fuzz_accounts.rs      # AddressStorage registry
```

Program binary: `target/deploy/aeon.so`  
Program ID: `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn`

## Run

```bash
# from repo root
npm run test:fuzz:p2

# or
cd trident-tests && trident fuzz run remaining_accounts_p2

# CI-style exit code on invariant/panic
cd trident-tests && trident fuzz run remaining_accounts_p2 --with-exit-code
```

**Note:** Trident's config discovery requires `cwd` under `trident-tests/` (where `Trident.toml` lives). The npm script handles this.

## Sample metrics (seed `770a1bb2…`)

| Instruction | Invoked | Success | Failed | Panicked |
|-------------|---------|---------|--------|----------|
| init_mint / initialize_config / register_agent / issue_root | 200 ea | 200 | 0 | 0 |
| issue_child | 1920 | 146 | 1774 | 0 |
| revoke_cascade | 1967 | 129 | 1838 | 0 |
| revoke_adversarial | 2069 | 151 | 1918 | 0 |
| pay_budget | 2044 | 0 | 2044 | 0 |

Pay success path is intentionally limited: Trident SVM single-payer signing cannot register a second agent for a clean multi-party pay. Failures still exercise fail-closed spent (no spent bump on error).

## Invariants asserted

1. **No panics** on any instruction path (structured Anchor errors only).
2. **Fail-closed spent:** on failed `pay`, authority `spent` must not increase.
3. **Budget:** if pay succeeds, `spent ≤ budget`.
4. **End-of-iteration:** for each known authority PDA with program owner, `spent ≤ budget`, `depth ≤ 3`, `status ≤ 3`.

## Limitations / follow-ups

- Single SVM signer → no multi-agent pay success in this harness.
- Soft dual-child over-issue (`NEG-AUTH-011`) remains a documented soft-model case, not a hard reject.
- Optional next: expand types to atomic_split remaining_accounts; Token-2022 transfer-hook reject path (HEAVY).
