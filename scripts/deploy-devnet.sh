#!/usr/bin/env bash
# Deploy AEON program to Solana devnet.
#
# Prerequisites:
#   - Built binary at target/deploy/aeon.so (cargo-build-sbf)
#   - Deployer wallet with ≥ 4 SOL on devnet
#
# Usage:
#   bash scripts/deploy-devnet.sh
#   bash scripts/deploy-devnet.sh --skip-build
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${PATH}"

RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
WALLET="${SOLANA_WALLET:-${HOME}/.config/solana/id.json}"
PROGRAM_KP="target/deploy/aeon-keypair.json"
PROGRAM_SO="target/deploy/aeon.so"
MIN_SOL_LAMPORTS=4000000000  # 4 SOL rent floor + fees buffer

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

echo "══════════════════════════════════════════════"
echo " AEON → Solana Devnet Deploy"
echo "══════════════════════════════════════════════"

solana config set --url "$RPC" --keypair "$WALLET" >/dev/null
echo "RPC:    $RPC"
echo "Wallet: $(solana-keygen pubkey "$WALLET")"
echo "Program keypair: $(solana-keygen pubkey "$PROGRAM_KP")"

BALANCE=$(solana balance --lamports | awk '{print $1}')
echo "Balance: $(echo "scale=4; $BALANCE/1000000000" | bc) SOL"

if [[ "$BALANCE" -lt "$MIN_SOL_LAMPORTS" ]]; then
  echo ""
  echo "✗ Insufficient SOL for deploy (need ≥ 4 SOL for rent-exempt program data)."
  echo ""
  echo "Fund this address on devnet:"
  echo "  $(solana-keygen pubkey "$WALLET")"
  echo ""
  echo "Options:"
  echo "  1) https://faucet.solana.com  (GitHub sign-in)"
  echo "  2) solana airdrop 2 --url devnet   (when not rate-limited)"
  echo "  3) npm run mine:devnet            (PoW miner — needs fee dust first)"
  echo ""
  echo "Then re-run: npm run deploy:devnet"
  exit 2
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "→ Building BPF (cargo-build-sbf)…"
  cargo-build-sbf --manifest-path programs/aeon/Cargo.toml
fi

if [[ ! -f "$PROGRAM_SO" ]]; then
  echo "✗ Missing $PROGRAM_SO"
  exit 1
fi

PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KP")
echo "→ Deploying $PROGRAM_SO → $PROGRAM_ID …"

# Upgrade if already exists, else initial deploy
if solana program show "$PROGRAM_ID" >/dev/null 2>&1; then
  echo "  (existing program — upgrade)"
  solana program deploy "$PROGRAM_SO" \
    --program-id "$PROGRAM_KP" \
    --upgrade-authority "$WALLET"
else
  solana program deploy "$PROGRAM_SO" \
    --program-id "$PROGRAM_KP" \
    --upgrade-authority "$WALLET"
fi

echo ""
echo "→ Verifying on-chain…"
solana program show "$PROGRAM_ID"

# Write deploy artifact
mkdir -p target/devnet
cat > target/devnet/deployment.json <<EOF
{
  "cluster": "devnet",
  "rpc": "$RPC",
  "programId": "$PROGRAM_ID",
  "upgradeAuthority": "$(solana-keygen pubkey "$WALLET")",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "binaryBytes": $(stat -c%s "$PROGRAM_SO")
}
EOF

# Ensure Anchor.toml has programs.devnet
if ! grep -q '\[programs.devnet\]' Anchor.toml; then
  python3 - <<PY
from pathlib import Path
p = Path("Anchor.toml")
text = p.read_text()
if "[programs.devnet]" not in text:
    insert = f'\n[programs.devnet]\naeon = "{PROGRAM_ID}"\n'
    # after localnet block
    if "[programs.localnet]" in text:
        parts = text.split("[registry]")
        text = parts[0].rstrip() + insert + "\n[registry]" + parts[1]
    else:
        text += insert
    p.write_text(text)
    print("  updated Anchor.toml [programs.devnet]")
PY
fi

echo ""
echo "══════════════════════════════════════════════"
echo " ✓ Deployed AEON to devnet"
echo "   Program ID: $PROGRAM_ID"
echo "   Artifact:   target/devnet/deployment.json"
echo "   Explorer:   https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet"
echo "══════════════════════════════════════════════"
