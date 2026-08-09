#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${PATH}"
ANCHOR_TOML="Anchor.toml"
BACKUP="$(mktemp)"
cp "$ANCHOR_TOML" "$BACKUP"
cleanup() { cp "$BACKUP" "$ANCHOR_TOML"; rm -f "$BACKUP"; }
trap cleanup EXIT
python3 - <<'PY'
from pathlib import Path
import re
p = Path("Anchor.toml")
text = p.read_text()
text2, n = re.subn(
    r'(?m)^test\s*=\s*".*"$',
    'test = "npx ts-mocha -p ./tsconfig.json -t 180000 tests/negative/heavy-cpi-spent.negative.ts"',
    text,
    count=1,
)
assert n == 1
p.write_text(text2)
print("→ HEAVY CPI-spent leg")
PY
anchor test --skip-build
