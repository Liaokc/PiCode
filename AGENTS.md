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
- Merge fast: a ticket that passed code-review merges to `main` immediately. Merging happens **from the root worktree** via `scripts/merge-ticket.sh <NN>` — driven either by the operator or by the **dedicated merge session** (the only writer to main; implementing sessions never checkout or merge). Every other active worktree rebases onto `main` before its next slice.
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
# merging a finished ticket (rebase + merge --no-ff + verify, all enforced):
scripts/merge-ticket.sh <NN>
```

### Verification & release

```bash
npm test                # vitest unit suite (the three spec test seams)
npm run smoke           # full compatibility suite: build, host contract, pty,
                        # usage aggregation, TUI↔SDK interop, electron app
npm run package:verify  # pack release/PiCode.app + boot it with a real-session smoke
npm run visual:transcript   # screenshot harnesses (see README "Visual QA")
```

Smoke stages 2/5/6 make real model calls — serialization rule applies (one
worktree at a time runs the app). See `README.md` for details.

## Ticket completion report (all iterations)

Binding rule for every session that completes a ticket (implementing and merge
sessions alike), in every iteration of this project. The final report must end
with, in order:

1. **Task statement** — the last line answers "这个工单的任务是什么": one sentence
   stating what this ticket's task was.
2. **Screenshot** — if the ticket's output can be directly shown as a screenshot
   (UI-visible change), capture one and report its **absolute path**. If the
   output is not screenshot-able (pure logic / infra), say so explicitly.
   Screenshot harnesses: `npm run visual:transcript` (see README "Visual QA").

A completion report missing these two items counts as incomplete delivery;
review should send the ticket back rather than pass it on.
