# AEON CI

GitHub Actions workflows for the product surface.

| Workflow | Trigger | Jobs |
|----------|---------|------|
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | push/PR to `main`, manual | `sdk` · `build-sbf` · `e2e` · `negative` |
| [`.github/workflows/fuzz-nightly.yml`](../.github/workflows/fuzz-nightly.yml) | daily 06:00 UTC + manual | Trident P2 `remaining_accounts_p2` |

## What runs on every PR / push

| Job | Commands | Needs validator? |
|-----|----------|------------------|
| **sdk** | `npm run test:sdk` · `npm run typecheck:sdk` · IDL/`declare_id!` assert | No |
| **build-sbf** | install Solana · `npm run build:sbf` → upload `aeon.so` | No |
| **e2e** | prepare deploy · `npm run test:e2e` | Yes (anchor test) |
| **negative** | prepare deploy · `npm run test:negative` (4 legs) | Yes (multi-restart) |

## Nightly only

| Job | Command | Notes |
|-----|---------|--------|
| **fuzz-p2** | `npm run test:fuzz:p2` | Needs Trident 0.12.x + OpenSSL; up to 120 min |

## Toolchain pins

| Tool | Version |
|------|---------|
| Node | 20 |
| Solana / Agave | 1.18.26 |
| Anchor | 0.30.1 |
| TypeScript | ^5.4 (see package.json) |

Install helper: [`scripts/ci-install-toolchain.sh`](../scripts/ci-install-toolchain.sh)

### Cargo.lock version (CI)

`cargo-build-sbf` from Solana **1.18.x** rejects lockfile **version 4** (`requires -Znext-lockfile-bump`). Keep root and `trident-tests/Cargo.lock` at **version 3** (regenerate with `cargo +1.78 generate-lockfile` if a modern cargo rewrites them to v4).

### Solana PATH gotcha (CI)

Anza’s installer only appends to `~/.profile`. In GitHub Actions:

1. **Same step as install:** `export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"` before `solana` / `cargo-build-sbf`.
2. **Next steps:** also `echo …/bin >> $GITHUB_PATH`.

`GITHUB_PATH` alone does **not** affect the current shell — that caused the first `v0.1.0` CI failure (`solana: command not found` right after install).

## Deploy artifacts

[`scripts/ci-prepare-deploy.sh`](../scripts/ci-prepare-deploy.sh):

1. Copies `keys/aeon-keypair.json` → `target/deploy/aeon-keypair.json` (or `AEON_KEYPAIR_JSON` env)
2. Asserts pubkey = `8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn`
3. Builds `.so` if missing
4. Asserts committed IDL address matches

**Build path:** use `npm run build:sbf` + committed `client/idl/aeon.json`.  
Do not rely on full `anchor build` IDL regen on modern rustc (known `anchor-syn` / `Span::source_file` break).

## Local parity

```bash
npm ci
npm run test:sdk && npm run typecheck:sdk
npm run build:sbf
bash scripts/ci-prepare-deploy.sh
npm run test:e2e
npm run test:negative
# optional / heavy:
npm run test:fuzz:p2
```

## Security note

`keys/aeon-keypair.json` is the program upgrade authority for the live **devnet** deployment.  
See [`keys/README.md`](../keys/README.md). Mainnet must use separate governance.
