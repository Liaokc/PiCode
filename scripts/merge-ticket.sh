#!/usr/bin/env bash
# merge-ticket.sh <NN> — merge ticket branch t<NN>-* into main, the disciplined way.
#
# Steps enforced (in order):
#   1. locate the ticket branch + its worktree
#   2. refuse to run if the worktree is dirty (session must commit & finish first)
#   3. refuse to run if the ticket Status is not ready-for-human
#   4. rebase the branch onto main  (THE anti-conflict step; aborts with hints on conflict)
#   5. merge --no-ff into main from the root worktree
#   6. verify: typecheck + full test suite on main
#   7. print cleanup commands (worktree remove / branch delete)
#
# Usage: scripts/merge-ticket.sh 09
set -euo pipefail

NN="${1:?usage: merge-ticket.sh <NN>}"
PATTERN="t${NN}-*"

BRANCH="$(git branch --list "$PATTERN" --format='%(refname:short)' | head -1)"
if [[ -z "$BRANCH" ]]; then
  echo "✗ no branch matching $PATTERN" >&2; exit 1
fi

# main worktree = the one holding the main branch checkout
MAIN_ROOT="$(dirname "$(git rev-parse --git-common-dir)")"
MAIN_ROOT="$(cd "$MAIN_ROOT" && pwd)"
WT="$(git worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '
  /^worktree /{w=$2} /^branch /{if($2==b) print w}')"
WT="${WT:-$MAIN_ROOT}"
echo "▸ branch: $BRANCH   worktree: $WT"

if [[ -n "$(git -C "$WT" status --porcelain)" ]]; then
  echo "✗ worktree is dirty — the implementing session must commit (or you discard) first." >&2
  git -C "$WT" status --short >&2; exit 1
fi

# Watchdog: a stalled rebase/merge left by a dead session must be handled BEFORE we start.
GD="$(git -C "$WT" rev-parse --git-dir)"
if [[ -d "$GD/rebase-merge" || -d "$GD/rebase-apply" ]]; then
  echo "✗ worktree has a STALLED REBASE in progress — resolving it is not this script's job." >&2
  echo "  Finish it:     git -C $WT rebase --continue   (after resolving conflicts)" >&2
  echo "  Or discard:    git -C $WT rebase --abort" >&2
  echo "  Then re-run this script." >&2; exit 1
fi
if [[ -f "$GD/MERGE_HEAD" ]]; then
  echo "✗ worktree has an unfinished MERGE — finish or abort it first:" >&2
  echo "  git -C $WT merge --continue | git -C $WT merge --abort" >&2; exit 1
fi

TICKET="$(git -C "$MAIN_ROOT" ls-files ".scratch/picode-1-5/issues/${NN}-*.md" ".scratch/picode-1-4/issues/${NN}-*.md" ".scratch/picode-1-3/issues/${NN}-*.md" ".scratch/picode-1-1/issues/${NN}-*.md" ".scratch/picode-1-0/issues/${NN}-*.md" | head -1)"
if [[ -n "$TICKET" ]]; then
  STATUS="$(git -C "$MAIN_ROOT" show "main:$TICKET" | grep -m1 '^\*\*Status:\*\*' || true)"
  case "$STATUS" in
    *ready-for-human*) : ;;
    *) echo "✗ ticket Status is '$STATUS' — expected ready-for-human (review must pass first)." >&2; exit 1 ;;
  esac
fi

LOCAL_MAIN="$(git -C "$MAIN_ROOT" branch --show-current)"
if [[ "$LOCAL_MAIN" != "main" ]]; then
  echo "✗ root worktree is on '$LOCAL_MAIN', not main. Fix that first." >&2; exit 1
fi

echo "▸ rebasing $BRANCH onto main …"
if ! git -C "$WT" rebase main; then
  cat >&2 <<'HINT'
✗ rebase conflict. Two likely flavours:
  • package-lock.json  → take either side, then regenerate:
      git checkout --theirs package-lock.json && npm install && git add package-lock.json && git rebase --continue
  • src/main/index.ts / contract index → keep BOTH sides' registration lines
      (additive-only rule), then git add <file> && git rebase --continue
  Abort with: git rebase --abort
HINT
  exit 1
fi

echo "▸ merging --no-ff into main …"
git -C "$MAIN_ROOT" merge --no-ff "$BRANCH" -m "merge: ${BRANCH}"

echo "▸ verifying main (typecheck + tests) …"
cd "$MAIN_ROOT"
npm run typecheck >/dev/null
npm test 2>&1 | tail -3

echo
echo "✓ $BRANCH is in main, verified. Cleanup when ready:"
echo "    git worktree remove ${WT#$MAIN_ROOT/} && git branch -d $BRANCH"
echo "  Other active worktrees: cd <wt> && git rebase main"
