# 05: Session sidebar + history tree + new / resume / fork

**What to build:** a sidebar that lists the user's Pi sessions as a history tree, and lets them manage the session lifecycle. It reads Pi's own JSONL session files as a read-only source of truth, builds a derived index for display, and drives the agent host to start a new session, re-open a past one, or fork a past session into a new branch of work within the same working-directory scope. The app shows a single active session while the tree stays browseable.

**Blocked by:** 04 — Tool execution panel.

**Status:** resolved

- [x] The sidebar lists past sessions derived from Pi's JSONL session tree, never duplicating session data.
- [x] The history is presented as a tree reflecting forks/branches, and is browseable while a session is active.
- [x] The user can start a fresh session in the current scope.
- [x] The user can re-open (resume) a past session and continue it.
- [x] The user can fork a past session into a new branch of work without altering the original.
- [x] The UI always reflects which session is active.

## Answer

Delivered 2026-08-25. The sidebar indexes sessions **read-only** from Pi's own
`~/.pi/agent/sessions/--<encoded-cwd>--/*.jsonl` (no copy, no write handle) and
drives the host's session lifecycle through the SDK's public runtime API.

- **Contract** (`src/shared/contract.ts`): added `ParentToHost.session-command`
  (`new`/`resume`/`fork`, with `sessionPath` + `forkEntryId`) and
  `HostToParent.session-switched` (sessionId/sessionPath/reason).
- **Index** (`src/shared/sessionIndex.ts`): dependency-free, read-only parser of
  Pi's JSONL files → derived tree (`id`/`parentId`), leaves, preview. Never writes.
- **Host** (`src/child/host.ts`): moved from `createAgentSession` to
  `createAgentSessionRuntime` + `SessionManager.create(cwd)`; `new`/`resume`/`fork`
  replace the active session and `bindSession()` re-subscribes events + the
  approval-gate extension (via `resourceLoaderOptions.extensionFactories`).
  Fork switches to the source then `runtime.fork(entryId)` — creating a new
  branched file, leaving the original byte-identical.
- **Reducer** (`src/shared/chatReduce.ts`): folds `session-switched` → new active
  session, resetting the transcript for the switch (UI always reflects the active
  session).
- **Renderer**: `Sidebar.tsx` (session list as a tree with resume + per-node
  fork) wired into `ChatPanel`/`App`; load index via `window.picode.listSessions()`.

**Acceptance verified:**
- fake-host reducer tests assert new/resume/fork → `session-switched` → state
  converges (settled in `chatReduce.test.ts`);
- read-only sample-JSONL tests assert tree/fork/branch correctness
  (`sessionIndex.test.ts`);
- real-SDK end-to-end `scripts/smoke-session-lifecycle.mjs` (`npm run
  smoke:lifecycle`): new → one prompt → fork → confirms the original session file
  is byte-identical (sha256) after the fork; clean shutdown leaves no orphan.

Pi is consumed read-only: only public SDK APIs are used and Pi's session/config
files are read, never modified.
