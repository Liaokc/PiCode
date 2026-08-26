# 07: Settings panel + status + trust posture + error surfacing + clean shutdown

**What to build:** the app's control and trust surface. The user can switch model / provider and thinking level, see the current status (model, provider, thinking, busy/idle) and the trust posture (how Pi loads project-local resources), get clear, recoverable error messages when Pi fails, and be confident that quitting cleans up the child process.

**Blocked by:** 05 — Session sidebar + history tree.

**Status:** resolved

- [x] A settings panel lets the user switch provider / model and thinking level for the active session.
- [x] The status is visible in the UI: current model, provider, thinking level, and whether Pi is busy or idle.
- [x] The trust posture is surfaced in the UI and obvious from settings.
- [x] Pi errors (tool failures, model errors, provider issues) surface as clear, actionable messages rather than silent failures or crashes.
- [x] Quitting cleans up the agent host child process with no orphans; restarting does not leave stale processes.
