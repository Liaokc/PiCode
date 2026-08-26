# PiCode

A local desktop GUI (Electron + React + Vite) for the Pi coding agent. Pi is the
execution kernel; PiCode is an Electron shell that drives Pi directly via its
SDK (`createAgentSession`) — it does not wrap ZCode and never modifies the
installed Pi package or `~/.pi/agent` config.

See `CONTEXT.md` for the domain glossary and `PROJECT-PLAN.md` / `spec.md` for
the roadmap. Tracer bullets delivered: **open the app → pick a working directory
→ talk to Pi → watch its answer stream live word-by-word (02)**, per-execution
tool approval + live tool cards (03–04), and a **session sidebar with a history
tree you can new / resume / fork (05)**.

## Layout

```
src/
  shared/contract.ts     # agent-host message contract (ADR-0002, plain JSON)
  shared/chatReduce.ts   # HIGH SEAM: contract events -> UI state (pure reducer)
  shared/chatReduce.test.ts  # reducer driven by a fake host fixture
  shared/sessionIndex.ts # READ-ONLY index of Pi's JSONL sessions -> history tree
  shared/sessionIndex.test.ts  # tree/fork/branch parsing driven by fixture JSONL
  shared/ipc.ts          # IPC channel names shared by main + preload
  child/host.ts          # child process: createAgentSessionRuntime host (ADR-0002)
  main/index.ts          # Electron main: window, IPC bridge, quit teardown
  main/sessionService.ts # owns the forked host lifecycle (fork / prompt / stop)
  preload/index.ts       # contextBridge API (contextIsolation on)
  renderer/              # React UI: picker, chat panel, tool cards, session sidebar
scripts/
  smoke-host.mjs         # real-SDK host smoke (streaming + tool + no-orphan)
  smoke-session.mjs      # SessionService lifecycle-owner smoke against real host
  smoke-session-lifecycle.mjs  # real SDK: new → prompt → fork (original unchanged)
```

## Setup (one-time)

Pi's SDK is not vendored in npm here; it is linked from the global install:

```sh
./setup.sh     # npm install + re-creates node_modules/@earendil-works/pi-coding-agent symlink
```

Re-run if the symlink disappears (npm prunes it on install). Pi is consumed
**read-only**; setup only makes it importable, never modifies it.

## Run

```sh
npm run dev        # electron-vite dev (HMR for the renderer)
```

Then pick a working directory — the session scope binds to it, the chat panel
streams the assistant's markdown answer live as `text_delta`s arrive, and the
session sidebar lists your history (read-only from Pi's own session files) with
new / resume / fork controls.

## Verify

```sh
npm run typecheck   # tsc for node + web configs
npm test            # vitest reducer + session-index tests (fake host fixture)
npm run smoke:host      # real SDK: streamed deltas + tool lifecycles + no orphan
npm run smoke:session   # SessionService lifecycle owner against real host
npm run smoke:lifecycle # real SDK: new → prompt → fork; original session unchanged
```
