#!/usr/bin/env bash
# Prepare target/deploy for anchor test / localnet:
#   - aeon-keypair.json matching declare_id!
#   - aeon.so (build if missing)
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${PATH}"

mkdir -p target/deploy

KEY_SRC="${AEON_KEYPAIR_PATH:-keys/aeon-keypair.json}"
if [[ -n "${AEON_KEYPAIR_JSON:-}" ]]; then
  echo "${AEON_KEYPAIR_JSON}" > target/deploy/aeon-keypair.json
  chmod 600 target/deploy/aeon-keypair.json
  echo "→ wrote keypair from AEON_KEYPAIR_JSON"
elif [[ -f "${KEY_SRC}" ]]; then
  cp "${KEY_SRC}" target/deploy/aeon-keypair.json
  chmod 600 target/deploy/aeon-keypair.json
  echo "→ copied keypair from ${KEY_SRC}"
else
  echo "error: no program keypair (set AEON_KEYPAIR_JSON or provide keys/aeon-keypair.json)" >&2
  exit 1
fi

PUB=$(solana-keygen pubkey target/deploy/aeon-keypair.json)
EXPECTED="8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn"
if [[ "${PUB}" != "${EXPECTED}" ]]; then
  echo "error: keypair pubkey ${PUB} != declare_id ${EXPECTED}" >&2
  exit 1
fi
echo "→ program keypair OK (${PUB})"

if [[ ! -f target/deploy/aeon.so ]]; then
  echo "→ building SBF (aeon.so missing)"
  cargo-build-sbf --manifest-path programs/aeon/Cargo.toml
fi

# Sanity: IDL address matches
if [[ -f client/idl/aeon.json ]]; then
  IDL_ADDR=$(python3 -c "import json; print(json.load(open('client/idl/aeon.json'))['address'])")
  if [[ "${IDL_ADDR}" != "${EXPECTED}" ]]; then
    echo "error: client/idl/aeon.json address ${IDL_ADDR} != ${EXPECTED}" >&2
    exit 1
  fi
  echo "→ IDL address OK"
fi

echo "✓ deploy artifacts ready"
