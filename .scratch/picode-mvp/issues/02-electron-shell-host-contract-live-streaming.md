# 02: Electron shell + host contract + IPC bridge + live streaming render

**What to build:** the first open-the-app-and-talk-to-Pi loop. The Electron app boots, the user picks a working directory, the app forks the agent host (from ticket 01), bridges the host contract to the renderer over secure IPC, and streams the assistant's markdown answer into a chat panel live (word by word) as text deltas arrive.

**Blocked by:** 01 — Drive the real Pi SDK through a child-process host.

**Status:** resolved

- [x] Launching the app lets the user choose a working directory that becomes the session scope.
- [x] The app forks the agent host as a child process and owns its lifecycle.
- [x] Host events cross the IPC bridge to the renderer; user prompts flow back in to the host.
- [x] Submitting a prompt streams the assistant's answer into the chat panel incrementally (visible text growth, not a wait-then-wall-of-text).
- [x] Markdown in the stream (headers, code blocks, lists) renders readably.
- [x] Quitting the app cleanly tears down the host child with no orphan process.

## Comments

Implemented and verified (2026-08-25). All six acceptance criteria green.

- Electron + React + Vite shell (`electron-vite`) scaffolded at repo root; `createAgentSession({ cwd })`
  binds the chosen working directory as the session scope (ADR-0002).
- `src/main/sessionService.ts` owns the forked host lifecycle (fork / ready-watchdog / prompt / abort /
  graceful shutdown with kill-timeout); `src/main/index.ts` bridges IPC and tears the host down on quit.
- `src/preload/index.ts` exposes a narrow, typed API via `contextBridge` (`contextIsolation: true`); host
  events stream to the renderer incrementally over one `host:message` channel (nothing dropped — tool
  events ride through for ticket 04).
- `src/shared/chatReduce.ts` is the spec's high seam (agent-host contract → UI state), driven in tests by
  a fake host fixture (`src/shared/chatReduce.test.ts`, 7 tests green); assistant text grows word-by-word.
- The panel renders streamed markdown (headings / code / lists) via react-markdown.
- Real-SDK end-to-end confirmed: `scripts/smoke-host.mjs` (44 streamed text deltas + 2 tool lifecycles,
  clean shutdown, no orphan) and `scripts/smoke-session.mjs` (SessionService lifecycle owner: 35 deltas +
  1 bash tool, clean stop, no orphan). Electron app boots and terminates cleanly with no orphan.
- Pi consumed read-only throughout; no modification to the installed package or `~/.pi/agent`.

Known limitation: macOS Screen-Recording/Accessibility grants were unavailable in the automation
environment, so the on-screen GUI could not be driven interactively (click "select directory" and watch
the live stream in the window). The full select-dir → fork → prompt → stream → teardown path is instead
verified end-to-end through SessionService and the host smokes, plus reducer tests.


### Code-review pass (2026-08-25)

- Renamed `ToolCard` → `ToolExecution` (CONTEXT.md treats "tool call card" as a banned synonym of "tool execution").
- Abort now surfaces in the UI: renderer dispatches a `user-aborted` action; the reducer records it and reports status `aborted` (not `done`) when the turn ends, with a reset on the next prompt. 2 added reducer tests (9 total green).
- `src/child/host.ts` guards single-active-session: a prompt arriving while one is in flight is dropped with a warn log instead of racing two prompts.
- `src/main/sessionService.ts` `stop()`/`kill()` hardened: exit listener attached before sending shutdown, admit already-exited children, and keep `stopping` true until exit lands so no spurious "unexpected exit" is reported.
- Post-review re-verification: typecheck (node + web) green, 9 reducer tests green, build green, and a fresh real-SDK host smoke still ALL GREEN (125 streamed deltas, 2 tool lifecycles, clean shutdown, no orphan).
- Known, out-of-MVP-scope items (documented, not changed): `resolveHostPath()` points at the `.ts` child source (packaging/distribution is out of MVP scope per spec — dev runs use Node 24 type-stripping); host-failure-after-start is logged to main only, not surfaced in the renderer (the directory-picker already shows a start-failure banner for the synchronous `startSession` ack).
