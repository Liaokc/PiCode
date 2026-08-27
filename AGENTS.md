# PiCode

A local desktop GUI for the Pi coding agent. See `CONTEXT.md` for the domain glossary.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

## Parallel development (git worktrees)

- Worktrees live **inside this repo** at `.worktrees/<wt-NN>-<slug>/`; never create checkouts outside this folder.
- One ticket per branch named `t<NN>-<slug>`; run `npm install` in each new worktree (node_modules is not shared).
- **Dev-app serialization**: at most one worktree at a time may run the Electron dev app, e2e or smoke scripts (fixed dev-server ports + single-instance lock). Worktrees that are not running the app limit themselves to vitest unit tests and typecheck.
- Merge fast: a ticket that passed code-review merges to `main` immediately. Merging happens **from the root worktree** (`cd ~/PiCode && git merge --no-ff t<NN>-<slug>`) — never checkout `main` inside a ticket worktree. Every other active worktree rebases onto `main` before its next slice.
- Electron binary downloads can stall on GitHub; prefix installs with `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` when needed.
- While any parallel ticket is in flight, shared-contract additions (IPC message types) are **additive-only** — no renames, no removals.
- Keep total concurrent implement sessions ≤ 3.

### Standard commands

```bash
mkdir -p .worktrees && grep -qx ".worktrees/" .gitignore || echo ".worktrees/" >> .gitignore
git worktree add .worktrees/wt-<NN>-<slug> -b t<NN>-<slug>
cd .worktrees/wt-<NN>-<slug> && npm install && npm run typecheck
# rebase an older worktree after main moved on:
git fetch --all 2>/dev/null; git rebase main   # from inside the worktree branch
```
