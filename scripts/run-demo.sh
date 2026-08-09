#!/usr/bin/env bash
# Fresh localnet → deploy → Agent Economy Demo only (no e2e suite).
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
from pathlib import Path
import re
p = Path("Anchor.toml")
text = p.read_text()
text2, n = re.subn(
    r'(?m)^test\s*=\s*".*"$',
    'test = "npx ts-mocha -p ./tsconfig.json -t 1000000 demos/**/*.ts"',
    text,
    count=1,
)
if n != 1:
    raise SystemExit(f"failed to patch Anchor.toml test script (replacements={n})")
p.write_text(text2)
print("→ running demos/**/*.ts only on fresh localnet")
PY

# Do not exec — trap must restore Anchor.toml after the test process exits.
anchor test --skip-build
