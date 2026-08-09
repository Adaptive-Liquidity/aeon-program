#!/usr/bin/env bash
# Install Solana CLI (platform tools + cargo-build-sbf) and Anchor CLI for CI.
# Env: SOLANA_VERSION (default 1.18.26), ANCHOR_VERSION (default 0.30.1)
set -euo pipefail

SOLANA_VERSION="${SOLANA_VERSION:-1.18.26}"
ANCHOR_VERSION="${ANCHOR_VERSION:-0.30.1}"

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${PATH}"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck source=/dev/null
  source "${HOME}/.cargo/env"
fi

# Stable rustc for host tools; platform-tools bring their own SBF toolchain
rustup default stable
rustup component add rustfmt 2>/dev/null || true

if ! command -v solana >/dev/null 2>&1 || ! cargo-build-sbf --version >/dev/null 2>&1; then
  echo "→ installing Solana ${SOLANA_VERSION}"
  sh -c "$(curl -sSfL "https://release.anza.xyz/v${SOLANA_VERSION}/install")"
fi
export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"
echo "solana: $(solana --version)"
echo "cargo-build-sbf: $(cargo-build-sbf --version)"

if ! command -v anchor >/dev/null 2>&1 || ! anchor --version 2>/dev/null | grep -q "${ANCHOR_VERSION}"; then
  echo "→ installing Anchor ${ANCHOR_VERSION} via avm"
  if ! command -v avm >/dev/null 2>&1; then
    cargo install --git https://github.com/coral-xyz/anchor --tag "v${ANCHOR_VERSION}" avm --locked --force 2>/dev/null \
      || cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  fi
  avm install "${ANCHOR_VERSION}"
  avm use "${ANCHOR_VERSION}"
fi
echo "anchor: $(anchor --version)"

# Persist path for subsequent GitHub Actions steps when sourced into GITHUB_PATH
if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "${HOME}/.local/share/solana/install/active_release/bin" >> "${GITHUB_PATH}"
  echo "${HOME}/.cargo/bin" >> "${GITHUB_PATH}"
fi

echo "✓ toolchain ready"
