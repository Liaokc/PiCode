# PiCode

A local macOS desktop app that wraps the [Pi coding agent](https://github.com/earendil-works/pi) in a product-grade shell: **the look and interaction model belong to ZCode, the brain belongs to Pi.** Sessions, history, and usage stats are shared with the Pi TUI — a session created on either side shows up and resumes on the other (Handoff), and a session running in the TUI can be watched live from PiCode (Live Follow).

See [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary. The red line: **no code or data inside the Pi installation or the ZCode app is ever modified** — everything lives in this repository.

## Layout

Three-zone shell: navigation sidebar (Tasks grouped by project), chat main area, and a resizable side panel hosting Terminal (full PTY), Review (workspace diff), and File Preview tabs. A settings window covers defaults, appearance, read-only provider auth status, and a Usage page (tokens, streaks, heatmap, per-model trends, estimated cost) aggregated from all Pi session records — TUI included.

## Architecture

| Zone | Role |
|------|------|
| `src/renderer` | React UI. Never imports the Pi SDK — it consumes pure reducers over the IPC contract. |
| `src/main` | Electron main process: host supervisor, session index (shared store scan + Live Follow tail), usage aggregation cache, review/preview readers, terminal service (the only node-pty consumer). |
| `src/preload` | Typed bridge exposing exactly the IPC surface above. |
| `src/host` | Isolated agent host child process; the **only** place `@earendil-works/pi-coding-agent` (pinned version, ADR-0005) is loaded. One host instance backs one Session. |
| `src/shared` | The contract (`ParentToHost`/`HostToParent`), pure reducers, parsers, and aggregators — the testable core. |

Architecture decisions live in [`docs/adr/`](./docs/adr) (0001–0005, all current); the product spec in `.scratch/picode-1-0/spec.md`.

## Development

Requirements: Node 24+, and working Pi auth in `~/.pi/agent` (the same credentials the `pi` TUI uses).

```bash
npm install                # prefix ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ if the Electron download stalls
npm run dev                # dev app
npm run typecheck          # tsc over node + web tsconfigs
npm run lint
npm test                   # vitest unit suite (the three spec test seams)
```

## Compatibility smoke suite

One command runs every compatibility red line against the real Pi SDK and the real shared session store:

```bash
npm run smoke
```

Stages (fail fast, per-stage timings):

1. **build** — electron-vite bundles
2. **host contract** — real SDK streaming, approval gate (approve/remember/deny), access-mode tiers, queue semantics, model/thinking switches, resume/rename/tree/fork
3. **pty** — real pseudo-terminal under Electron's node ABI
4. **usage aggregation** — read-only scan of the real TUI store + incremental fold machinery on a temp store
5. **TUI↔SDK interop** — both directions: a TUI-written session parses through the session index, transcript, and the SDK's own `SessionManager`; a host-written session re-opens via the SDK, shows in the index, folds into usage, and resumes in a second host process
6. **electron app smoke** — the real shell: main→host→renderer DOM, sidebar index, Live Follow, session-scoped crash isolation, multi-active sessions (several hosts alive across focus switches, background streaming, same-pid refocus with a caught-up transcript, no-orphan shutdown)

Stages 2, 5, and 6 make real model calls (a few minutes total).

### Session hygiene (ticket 13)

Smoke runs never write the real session library. The suite exports
`PICODE_SESSION_DIR` (a throwaway store the host and the app's session index
honor) and verifies **zero session-file growth** in `~/.pi/agent/sessions`
across the whole run — the suite fails if a stage leaks a session file.
Standalone smoke entry points (`npm run smoke:host` / `smoke:interop` /
`smoke:electron`) self-isolate the same way. `PICODE_SESSION_DIR` is also
honored by `npm run package:verify`. Auth, models and settings always come
from the real `~/.pi/agent` — only session writes are redirected.

Model usage aggregation folds model ids case-insensitively (a gateway echoing
`glm-5.3-flash` for the configured `GLM-5.3-flash` counts as ONE model; the
display keeps the first-seen spelling). The one-time cleanup for historical
smoke-polluted stores (dry run by default):

```bash
node scripts/cleanup-smoke-sessions.ts        # list what would be deleted
node scripts/cleanup-smoke-sessions.ts --yes  # delete
```

## Visual QA

Screenshot harnesses capture the real UI for pixel comparison against the ZCode baselines in `.scratch/reference/screenshots/` (record: `.scratch/picode-1-0/visual-redline-final.md`):

```bash
npm run visual:transcript   # transcript, menus, pill/queue, preview, review
npm run visual:settings     # ⌘K palette + settings sections
npm run visual:usage        # usage page (deterministic fixture)
# terminal bottom-dock capture (opens the dock via the titlebar toggle):
PICODE_VISUAL=1 PICODE_VISUAL_TERMINAL=1 npx electron .
```

PNGs land in `.scratch/visual/`.

## Packaging

```bash
npm run package            # → release/PiCode-darwin-<arch>/PiCode.app (unsigned local artifact, asar off so the host child can fork)
npm run package:verify     # …then boot the artifact with PICODE_SMOKE=1 and require a real-session smoke round to exit 0
```
