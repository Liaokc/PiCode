#!/usr/bin/env bash
# Re-establish the Phase 0 harness: dev deps + the symlink to the globally
# installed Pi SDK (npm prunes the symlink on install).
set -euo pipefail
cd "$(dirname "$0")"

PI_GLOBAL="${PI_GLOBAL:-$HOME/.nvm/versions/node/v24.13.0/lib/node_modules/@earendil-works/pi-coding-agent}"

if [ ! -d "$PI_GLOBAL" ]; then
  echo "error: Pi SDK not found at $PI_GLOBAL (set PI_GLOBAL to point at your install)" >&2
  exit 1
fi

npm install -D typescript@5.9.3 @types/node@24 >/dev/null 2>&1 || true

mkdir -p node_modules/@earendil-works
ln -sfn "$PI_GLOBAL" node_modules/@earendil-works/pi-coding-agent

echo "phase0 ready: dev deps installed, Pi SDK linked."
echo "  run: node src/driver.ts"
