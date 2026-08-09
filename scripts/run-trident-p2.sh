#!/usr/bin/env bash
# P2 Trident fuzz — remaining_accounts / cascade / authority hierarchy.
# Must run from trident-tests (Trident.toml discover_root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/trident-tests"

# Optional system OpenSSL bootstrap (sandbox / minimal images)
if [[ -d /tmp/openssl-prefix ]]; then
  export OPENSSL_DIR="${OPENSSL_DIR:-/tmp/openssl-prefix}"
  export OPENSSL_LIB_DIR="${OPENSSL_LIB_DIR:-/tmp/openssl-prefix/lib64}"
  export OPENSSL_INCLUDE_DIR="${OPENSSL_INCLUDE_DIR:-/tmp/openssl-prefix/include}"
  export PATH="/tmp/bin:${PATH:-}"
fi

if [[ ! -f ../target/deploy/aeon.so ]]; then
  echo "error: missing ../target/deploy/aeon.so — run: npm run build:sbf (or anchor build)" >&2
  exit 1
fi

if ! command -v trident >/dev/null 2>&1; then
  echo "error: trident CLI not on PATH (need trident 0.12.x)" >&2
  exit 1
fi

# Default: remaining_accounts_p2. Pass extra args through (e.g. --with-exit-code).
exec trident fuzz run remaining_accounts_p2 "$@"
