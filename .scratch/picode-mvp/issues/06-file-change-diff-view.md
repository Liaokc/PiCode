# 06: File-change diff view

**What to build:** let the user review what Pi changed. From a completed agentic turn, surface the files Pi modified as a list, and show a lightweight diff of those changes in the UI (new/modified file list plus a readable diff), so the user can verify the agent's edits before trusting them.

**Blocked by:** 04 — Tool execution panel.

**Status:** resolved

- [x] After a turn, the files Pi changed are surfaced as a visible list in the UI.
- [x] Each changed file can be expanded into a lightweight diff of the change.
- [x] The diff view is readable and scopes to a single turn/session rather than the whole transcript.
- [x] Files modified but not by the current session are not misattributed.

## Answer

Delivered 2026-08-25. The diff view is derived **read-only from Pi's own event
stream** — nothing is read from or written to disk, and the installed Pi agent is
never touched. It is the final MVP ticket.

- **Reducer** (`src/shared/chatReduce.ts`): new `FileChange[]` state
  (`{ path, kind: "added"|"modified", diffText }`) folded from successful
  `tool_execution_end` for edit/write tools. The change is scoped to the current
  turn: `fileChanges` resets on every `user-submitted` and on `session-switched`,
  so only files the active turn/session changed are attributed. Repeated edits to
  the same file merge into one list entry (their patches append, so no hunk is lost).
- **Data source (all from Pi's public event shape):**
  - `edit` → `result.details.patch` captured verbatim as the lossless unified diff
    (`kind: modified`). Pi itself emits the before→after patch for the real base
    content it read — the honest source for this turn's change.
  - `write` → Pi emits no before-state (it never reads the existing file), so per
    the read-only scope it becomes a full addition rendered from `args.content`
    (`kind: added`).
- **Renderer** (`src/renderer/ChatPanel.tsx`): a "文件改动" list after the tool
  cards — one expandable row per changed file, each opening into a lightweight
  diff view (`<pre>` with `+`/`-`/hunk-header line coloring via CSS, no third-party
  diff library). Styled in `chat.css`.

**Acceptance verified (all 5 from the exec prompt):**
- fake-host reducer tests assert the edit/write execution sequence → file-change
  list + diff data fold correctly and scope per turn/session
  (`chatReduce.test.ts`, +7 tests, 42 total);
- typecheck (node + web) clean; `vitest` 42/42; smokes
  (`smoke:host`/`smoke:session`/`smoke:lifecycle`/`smoke:settings`) all green;
  `e2e:tool-cards` still green; `electron-vite build` succeeds.
- real-SDK end-to-end `scripts/e2e-file-diffs.mjs` (`npm run e2e:file-diffs`): in a
  disposable temp dir, Pi edits `hello.txt` (→ `modified` with the real
  `-line2`/`+line2-changed` patch) and writes `note.txt` (→ `added`, diff equal to
  the real on-disk bytes); clean shutdown with no lingering `pi-coding-agent`
  process and the temp dir removed.

Pi is consumed read-only: the implementation imports only Pi's exported types and
relies solely on the events the SDK already ships; no Pi file is modified and no
new dependency was added.
