/**
 * Packaged-verify launch helpers (ticket 47): pure logic behind the
 * `npm run package:verify` artifact check in scripts/package.mjs.
 *
 * WHY the packaged app boots through `open` instead of a direct binary spawn:
 * the smoke's ticket-44 stage needs the window to take REAL OS focus
 * (navigator.clipboard rejects while unfocused). An app binary spawned
 * straight from a terminal stays background on this macOS — win.show() +
 * win.focus() + app.focus({ steal: true }) never win focus — while a
 * LaunchServices launch (`open`) activates the app like a normal user launch
 * and the focus poll succeeds.
 *
 * Two `open` quirks shape this module:
 *   - Exit status: `open -W` does NOT propagate the app's exit code (probed
 *     on macOS 15.6: child exit 3, `open -W` still exits 0), so the pass/fail
 *     verdict is read from the smoke's own log markers in the captured
 *     stdout/stderr (`open --stdout/--stderr` redirect the app's streams).
 *   - Stale instances: if any PiCode.app instance is already running,
 *     LaunchServices would activate THAT one and drop our --env payload
 *     (no smoke would run) — scripts/package.mjs guards against it up front.
 *
 * Unit-tested from tests/main/package-verify-launch.test.ts.
 */

/** The sentinel the in-app smoke prints as its final stdout line on success
 * (src/main/smoke.ts, immediately before app.exit(0)). */
export const SMOKE_DONE_MARKER = 'SMOKE done'

/** The prefix the in-app smoke prints to stderr on any assertion failure
 * (src/main/smoke.ts fail()), followed by the reason. */
export const SMOKE_FAIL_MARKER = 'SMOKE FAIL'

/** Paths the verify launch needs: the packaged bundle, the isolated session
 * store (never the real ~/.pi sessions), the throwaway agent dir (never the
 * real ~/.pi/agent — the tickets 63/64 skills/packages stages seed their
 * sandboxes there and refuse to run without it), and the captured stream
 * files. */
export interface OpenLaunchPaths {
  appPath: string
  sessionDir: string
  piAgentDir: string
  stdoutLog: string
  stderrLog: string
}

/** argv for `open` (passed WITHOUT a shell, via execFileSync) that boots the
 * packaged app through LaunchServices: wait for it to quit, capture its
 * streams, and deliver the smoke env — PICODE_SMOKE enables the in-app smoke,
 * PICODE_SESSION_DIR isolates the session store, PICODE_PI_AGENT_DIR isolates
 * the agent dir for the tickets 63/64 skills/packages stages (they refuse to
 * touch the real ~/.pi/agent when it's absent), and PICODE_FAKE_USAGE feeds
 * the ticket-65/t124 usage stage the deterministic fixture — the same env the
 * electron-smoke wrapper delivers (the stage asserts fixture models like
 * glm-4.7-air that no real usage history can provide). */
export function openLaunchArgs({ appPath, sessionDir, piAgentDir, stdoutLog, stderrLog }: OpenLaunchPaths): string[] {
  return [
    '-W', // block until the smoke app quits
    '--stdout', stdoutLog,
    '--stderr', stderrLog,
    '--env', 'PICODE_SMOKE=1',
    '--env', 'PICODE_FAKE_USAGE=1',
    '--env', `PICODE_SESSION_DIR=${sessionDir}`,
    '--env', `PICODE_PI_AGENT_DIR=${piAgentDir}`,
    appPath
  ]
}

/** Pass/fail verdict for the packaged smoke run. */
export interface SmokeVerdict {
  ok: boolean
  /** The success sentinel on ok, else a human-readable failure reason. */
  reason: string
}

/** Decide the packaged smoke's pass/fail from its captured stdout/stderr.
 * Success is the `SMOKE done` sentinel the smoke prints right before
 * app.exit(0); failure is the first `SMOKE FAIL ...` line it prints before
 * app.exit(1). Neither marker means the app crashed, hung, or never ran the
 * smoke (e.g. the env payload was dropped) — always a failure. */
export function verdictFromSmokeLogs(stdout: string, stderr: string): SmokeVerdict {
  const failLine = stderr
    .split('\n')
    .find((line) => line.includes(SMOKE_FAIL_MARKER))
  if (failLine) return { ok: false, reason: failLine.trim() }
  if (stdout.includes(SMOKE_DONE_MARKER)) return { ok: true, reason: SMOKE_DONE_MARKER }
  return {
    ok: false,
    reason:
      `the smoke produced neither \`${SMOKE_DONE_MARKER}\` nor a \`${SMOKE_FAIL_MARKER}\` line ` +
      '(app crashed, hung, or never ran the smoke — see the captured output above)'
  }
}
