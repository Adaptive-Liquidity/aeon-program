#!/usr/bin/env bash
# Isolated HEAVY transfer-hook reject path (Token-2022 TransferHook mint).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${PATH}"

ANCHOR_TOML="Anchor.toml"
BACKUP="$(mktemp)"
cp "$ANCHOR_TOML" "$BACKUP"
cleanup() {
  cp "$BACKUP" "$ANCHOR_TOML"
  rm -f "$BACKUP"
}
trap cleanup EXIT

python3 - <<'PY'
import re
from pathlib import Path
p = Path("Anchor.toml")
text = p.read_text()
replacement = 'test = "npx ts-mocha -p ./tsconfig.json -t 180000 tests/negative/heavy-cpi-transfer-hook.negative.ts"'
text2, n = re.subn(r'(?m)^test\s*=\s*".*"$', replacement, text, count=1)
if n != 1:
    raise SystemExit(f"failed to patch Anchor.toml (replacements={n})")
p.write_text(text2)
PY

echo "→ HEAVY CPI transfer-hook"
anchor test --skip-build
echo "✓ HEAVY transfer-hook green"
