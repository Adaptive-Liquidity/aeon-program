#!/usr/bin/env bash
# Positive localnet e2e only (tests/aeon.ts). Does not run negative legs.
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
replacement = 'test = "npx ts-mocha -p ./tsconfig.json -t 180000 tests/aeon.ts"'
text2, n = re.subn(r'(?m)^test\s*=\s*".*"$', replacement, text, count=1)
if n != 1:
    raise SystemExit(f"failed to patch Anchor.toml (replacements={n})")
p.write_text(text2)
PY

echo "→ positive e2e: tests/aeon.ts"
anchor test --skip-build
echo "✓ positive e2e green"
