# Development Contract (cross-session)

> Binding on **every agent session** that works in this repo — requirements/intake sessions, execution (master) sessions, implement/review/merge subagents, and any future session type. This project is developed across many agent sessions; this contract is the coordination mechanism that keeps them consistent. Amending this contract requires operator approval.

## 1. Dual-session delivery pattern (per iteration)

Every iteration — point release or major — is delivered by two session roles, both driven by the operator:

1. **Requirements session (需求会话)** — collects operator pain points over rounds; verifies every root cause in main source with file:line evidence before recording any conclusion; files the batch deliverables under `.scratch/<batch>/` (`intake-grilling.md`, `spec.md`, `issues/`, `session-prompts.md`, `reference/`); commits them to main; delivers the **master execution prompt** to the operator. It never implements tickets and never writes `src/` or `scripts/`.
2. **Execution session (执行会话)** — runs the master prompt; drives implement/review/merge subagents per the batch manual; keeps the run-log ledger (`.scratch/<batch>/run-log.md`); produces the final batch report. Merges to main only via `scripts/merge-ticket.sh <NN>` from the root worktree.

The operator specifies per batch: the model for multimodal tickets, the model for non-multimodal tickets, and thinking intensity (plus per-ticket exceptions). Sessions transcribe these verbatim into the execution prompt — never invent assignments.

## 2. Linear mirror (mandatory, no lag)

Every ticket event in any session syncs to Linear (team `LiaoKC`, project `PiCode`) — tool mechanics in `docs/agents/issue-tracker.md`:

- **Ticket filed** (intake, committed) → create the Linear issue (`Todo`, label `iter:<version>`), description = sync header + full ticket text.
- **State change** (dispatch / review / merge / release / wontfix) → mirror the state.
- **Work-content change** (scope rewrite, acceptance change, renumbering, retirement, a later ruling that supersedes the ticket) → update the Linear description with the change record; if the ticket number changes, the mirror moves to the new number with a note.

A ticket is not closed locally until its Linear mirror reflects the same state and content. The mirror is the operator's cross-batch view of the project — never let it lag behind the local run-log.

## 3. Ticket lifecycle & numbering

- Ticket numbers are **global-continuous across all batches** — never reused, never intentionally skipped.
- Lifecycle: `ready-for-agent` → `claimed` → `ready-for-human` → merged (or `wontfix`); status lives in the ticket file and mirrors to Linear.
- One ticket per branch `t<NN>-<slug>`, one worktree `.worktrees/wt-NN-<slug>`; merge fast once review passes (see `AGENTS.md` for worktree mechanics).

## 4. Ledger & evidence (落库)

- Every conclusion carries **code (file:line) or screenshot evidence** — no speculation.
- Execution sessions keep `run-log.md` (§0 guide / §1 ledger / checkpoints / waves) as the single recovery entry; **write the ledger before acting** — context compaction is amnesia, the log is the only memory.
- Per-ticket progress notes live in `.scratch/<batch>/work-notes/` (cross-worktree visible; committed at batch end as evidence).
- Reference frames (ZCode/PiCode screenshots) are named semantically and committed under `.scratch/<batch>/reference/`; multimodal tickets treat them as an implementation prerequisite — missing frames ⇒ park the ticket and report, never guess visuals.

## 5. Red lines (all sessions)

- **No push, no tag, no release** — those belong to the operator.
- Requirements sessions never write `src/` or `scripts/`; implementing sessions never checkout or merge main (merge session only, via the script).
- Dev-app serialization: one app channel at a time (`ps` self-check before any dev-app / smoke / visual run).
- Shared-contract (IPC) additions are **additive-only** while parallel tickets are in flight; every additive increment is reported into host-contract smoke.
- Sessions never self-open candidate tickets — leftover candidates go to the operator for a ruling.
- External reference apps (ZCode et al.) are read-only reference — never copy their code or assets.

## 6. Completion reports

Every session completing a ticket ends its report with **task statement + screenshot path** (or an explicit "not screenshot-able") — see `AGENTS.md` "Ticket completion report".
