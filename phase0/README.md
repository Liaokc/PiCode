# Phase 0 — drive the real Pi SDK through a child-process host

Feasibility harness for ticket `01` (`drive-real-pi-sdk-through-host`). It proves
Pi's in-process Node SDK runs in a **forked child process** and that streamed
text + tool-execution events cross the process boundary. It also settles the
tool-approval channel question (see [`FINDINGS.md`](./FINDINGS.md)).

## Layout

| Path | Purpose |
|------|---------|
| `src/contract.ts` | Typed parent↔host message contract (plain JSON across the boundary, ADR-0002) |
| `src/host.ts` | Child-process host: boots the real `createAgentSession`, forwards events, handles `prompt`/`abort`/`shutdown` |
| `src/driver.ts` | Headless driver (parent): spawns the host, sends a prompt, verifies AC1–AC4, guarantees no orphan |
| `observed-events.jsonl` | Raw event log from the most recent run (regenerated each run) |
| `FINDINGS.md` | Phase 0 conclusion incl. approval-channel findings |

## Setup (one-time)

The Pi SDK is **not** in `npm` here; it is linked from the globally installed
package via a symlink under this project's `node_modules`. If it is missing
(e.g. after an `npm install`/`npm prune`), re-link it:

```sh
cd phase0
./setup.sh        # re-creates the symlink + installs dev deps (typescript, @types/node)
```

`setup.sh` runs `npm install -D typescript @types/node` then re-creates:

```
node_modules/@earendil-works/pi-coding-agent -> ~/.nvm/versions/node/v24.13.0/lib/node_modules/@earendil-works/pi-coding-agent
```

Adjust the path if your Node/Pi install lives elsewhere.

## Run

```sh
cd phase0
node src/driver.ts     # exits 0 only if all four acceptance criteria pass
```

Typecheck:

```sh
cd phase0 && npm run typecheck
```

## Notes

- Uses `SessionManager.inMemory()` — ephemeral, no writes to `~/.pi/agent/sessions`.
- Uses the machine's default provider/model and config read-only; does not modify
  Pi config or auth.
- Requires Node ≥ 22.6 (native TS type-stripping). Verified on Node v24.13.0.
