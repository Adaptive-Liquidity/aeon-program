#!/usr/bin/env bash
# Fresh localnet legs:
#   1) P0 + P1 classic (shared fixture)
#   2) P1 Token-2022 protocol-mint isolation
#   3) HEAVY CPI-fail spent invariance (freeze-authority mint)
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

run_leg() {
  local label="$1"
  local glob="$2"
  echo "→ ${label}: ${glob}"
  python3 - "$glob" <<'PY'
import re, sys
from pathlib import Path
glob = sys.argv[1]
p = Path("Anchor.toml")
text = p.read_text()
replacement = f'test = "npx ts-mocha -p ./tsconfig.json -t 180000 {glob}"'
text2, n = re.subn(r'(?m)^test\s*=\s*".*"$', replacement, text, count=1)
if n != 1:
    raise SystemExit(f"failed to patch Anchor.toml (replacements={n})")
p.write_text(text2)
PY
  anchor test --skip-build
}

run_leg "P0+P1 classic" \
  "tests/negative/p0.negative.ts tests/negative/p1.negative.ts"

run_leg "P1 Token-2022" \
  "tests/negative/p1-token2022.negative.ts"

run_leg "HEAVY CPI-spent" \
  "tests/negative/heavy-cpi-spent.negative.ts"

echo "✓ all negative legs green"
