#!/usr/bin/env bash
# Install Solana CLI (platform tools + cargo-build-sbf) and Anchor CLI for CI.
# Env: SOLANA_VERSION (default 4.1.1), ANCHOR_VERSION (default 0.30.1)
set -euo pipefail

SOLANA_VERSION="${SOLANA_VERSION:-4.1.1}"
ANCHOR_VERSION="${ANCHOR_VERSION:-0.30.1}"
# Anchor 0.30.1 fails to compile on rustc ≥1.8x (time crate E0282, etc.)
ANCHOR_BUILD_TOOLCHAIN="${ANCHOR_BUILD_TOOLCHAIN:-1.78.0}"

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${PATH}"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck source=/dev/null
  source "${HOME}/.cargo/env"
fi

# Stable for host; platform-tools bring SBF toolchain; pin for Anchor CLI build
rustup default stable
rustup component add rustfmt 2>/dev/null || true
rustup toolchain install "${ANCHOR_BUILD_TOOLCHAIN}" --profile minimal

if ! command -v solana >/dev/null 2>&1 || ! cargo-build-sbf --version >/dev/null 2>&1; then
  echo "→ installing Solana/Agave ${SOLANA_VERSION}"
  sh -c "$(curl -sSfL "https://release.anza.xyz/v${SOLANA_VERSION}/install")"
fi
export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"
echo "solana: $(solana --version)"
echo "cargo-build-sbf: $(cargo-build-sbf --version)"

if ! command -v anchor >/dev/null 2>&1 || ! anchor --version 2>/dev/null | grep -q "${ANCHOR_VERSION}"; then
  echo "→ installing Anchor CLI ${ANCHOR_VERSION} with rustc ${ANCHOR_BUILD_TOOLCHAIN}"
  # Prefer direct anchor-cli install over avm (avm re-builds with default rustc).
  cargo +"${ANCHOR_BUILD_TOOLCHAIN}" install --git https://github.com/coral-xyz/anchor \
    --tag "v${ANCHOR_VERSION}" anchor-cli --locked --force \
    || cargo +"${ANCHOR_BUILD_TOOLCHAIN}" install --git https://github.com/coral-xyz/anchor \
      --tag "v${ANCHOR_VERSION}" anchor-cli --force
fi
echo "anchor: $(anchor --version)"

# Persist path for subsequent GitHub Actions steps when sourced into GITHUB_PATH
if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "${HOME}/.local/share/solana/install/active_release/bin" >> "${GITHUB_PATH}"
  echo "${HOME}/.cargo/bin" >> "${GITHUB_PATH}"
fi

echo "✓ toolchain ready"
