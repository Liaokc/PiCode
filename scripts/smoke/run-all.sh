#!/usr/bin/env bash
# Compatibility smoke suite (ticket 12): ONE command that runs every
# compatibility red line the release gate cares about, in dependency order.
# Requires working model auth in ~/.pi/agent for stages 2/5/6 (same as the
# pi TUI). Dev-app serialization: don't run this while another worktree is
# running the Electron app (fixed dev-server ports + single-instance lock).
#
#   1. build                     electron-vite build (host entry + bundles)
#   2. host contract             real SDK streaming, gate, queue, resume/fork
#   3. pty                       real PTY under Electron's node ABI
#   4. usage aggregation         real shared store + incremental machinery
#   5. TUI↔SDK interop           both directions against an isolated store
#   6. electron app smoke        main→host→renderer DOM + Live Follow + crash isolation
#
# Session hygiene (ticket 13): every stage runs with PICODE_SESSION_DIR
# pointed at a throwaway store, and the suite verifies the real session
# library (~/.pi/agent/sessions) has ZERO session-file growth across the run.
#
# Usage: npm run smoke
set -uo pipefail
cd "$(dirname "$0")/../.."

# Plain-node TS smokes trigger a harmless MODULE_TYPELESS_PACKAGE_JSON warning.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--no-warnings"

# ---- ticket 13: isolation + zero-growth guard ------------------------------
REAL_SESSIONS_DIR="$HOME/.pi/agent/sessions"
session_file_count() {
  if [ -d "$REAL_SESSIONS_DIR" ]; then
    find "$REAL_SESSIONS_DIR" -type f -name '*.jsonl' | wc -l | tr -d ' '
  else
    echo 0
  fi
}
SESSIONS_BEFORE=$(session_file_count)
# Absolute path: BSD mktemp creates a slash-less template in the CWD and
# prints it RELATIVE — the host then resolves it against ITS cwd and the
# smoke's sessionFile matchers (absolute vs relative) never agree. TMPDIR's
# trailing slash is stripped too (mktemp prints the doubled slash, the host
# normalizes it, and prefix checks disagree again).
smoke_store_base="${TMPDIR:-/tmp}"
SMOKE_SESSIONS_STORE="$(mktemp -d "${smoke_store_base%/}/picode-smoke-sessions-XXXXXXXX")"
export PICODE_SESSION_DIR="$SMOKE_SESSIONS_STORE"
# Ticket 63: a throwaway agent dir for the skills-management stage — the
# stage seeds its sandbox skills/settings there and cleans up afterwards;
# the operator's real ~/.pi/agent is never read-written by the smoke.
SMOKE_PI_AGENT_DIR="$(mktemp -d "${smoke_store_base%/}/picode-smoke-piagent-XXXXXXXX")"
export PICODE_PI_AGENT_DIR="$SMOKE_PI_AGENT_DIR"
cleanup() {
  rm -rf "$SMOKE_SESSIONS_STORE"
  rm -rf "$SMOKE_PI_AGENT_DIR"
}
trap cleanup EXIT

echo "SMOKE session hygiene: real store=$REAL_SESSIONS_DIR ($SESSIONS_BEFORE session files)"
echo "SMOKE session hygiene: isolated store=$SMOKE_SESSIONS_STORE"
echo "SMOKE skills hygiene: isolated agent dir=$SMOKE_PI_AGENT_DIR"

STEPS=(
  "build:npm run build"
  "host contract:node scripts/smoke/host-contract-smoke.mjs"
  "pty:ELECTRON_RUN_AS_NODE=1 electron scripts/smoke/pty-smoke.mjs"
  "usage aggregation:node scripts/smoke/usage-smoke.ts"
  "TUI↔SDK interop:node scripts/smoke/interop-smoke.ts"
  "electron app smoke:PICODE_SMOKE=1 PICODE_FAKE_USAGE=1 electron ."
)

overall_start=$(date +%s)
failed=0
for entry in "${STEPS[@]}"; do
  name="${entry%%:*}"
  command="${entry#*:}"
  echo ""
  echo "==== SMOKE SUITE stage: ${name} ===="
  start=$(date +%s)
  if ! bash -c "$command"; then
    echo "==== SMOKE SUITE FAILED at stage: ${name} ($(($(date +%s) - start))s) ===="
    failed=1
    break
  fi
  echo "==== SMOKE SUITE stage ok: ${name} ($(($(date +%s) - start))s) ===="
done

total=$(( $(date +%s) - overall_start ))

# ---- ticket 13: zero-growth verification -----------------------------------
SESSIONS_AFTER=$(session_file_count)
if [ "$SESSIONS_AFTER" -ne "$SESSIONS_BEFORE" ]; then
  echo "SMOKE session hygiene FAIL: session files in $REAL_SESSIONS_DIR grew from $SESSIONS_BEFORE to $SESSIONS_AFTER"
  failed=1
else
  echo "SMOKE session hygiene ok: session files in $REAL_SESSIONS_DIR unchanged ($SESSIONS_AFTER)"
fi

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "SMOKE SUITE RESULT: FAIL (${total}s total)"
  exit 1
fi
echo ""
echo "SMOKE SUITE RESULT: ALL GREEN (${total}s total, ${#STEPS[@]} stages)"
