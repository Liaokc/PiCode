/**
 * Packaged-verify launch helpers (ticket 47): the `open` argv that boots the
 * packaged app through LaunchServices, and the pass/fail verdict read from
 * the captured smoke output (`open -W` does not propagate the app's exit
 * status, so the smoke's own log markers are the contract).
 */
import { describe, expect, it } from 'vitest'
import {
  openLaunchArgs,
  SMOKE_DONE_MARKER,
  SMOKE_FAIL_MARKER,
  verdictFromSmokeLogs
} from '../../scripts/package-verify-launch.ts'

describe('openLaunchArgs', () => {
  it('boots the app through LaunchServices with the smoke env and captured streams', () => {
    const args = openLaunchArgs({
      appPath: '/repo/release/picode-darwin-arm64/PiCode.app',
      sessionDir: '/tmp/picode-smoke-verify-x/sessions',
      piAgentDir: '/tmp/picode-smoke-verify-x/pi-agent',
      stdoutLog: '/tmp/picode-smoke-verify-x/smoke-stdout.log',
      stderrLog: '/tmp/picode-smoke-verify-x/smoke-stderr.log'
    })
    expect(args).toEqual([
      '-W', // block until the smoke app quits
      '--stdout', '/tmp/picode-smoke-verify-x/smoke-stdout.log',
      '--stderr', '/tmp/picode-smoke-verify-x/smoke-stderr.log',
      '--env', 'PICODE_SMOKE=1',
      '--env', 'PICODE_SESSION_DIR=/tmp/picode-smoke-verify-x/sessions',
      '--env', 'PICODE_PI_AGENT_DIR=/tmp/picode-smoke-verify-x/pi-agent',
      '/repo/release/picode-darwin-arm64/PiCode.app'
    ])
  })
})

describe('verdictFromSmokeLogs', () => {
  it('passes only on the smoke-done sentinel', () => {
    const verdict = verdictFromSmokeLogs(
      'SMOKE user_copy_start\nSMOKE user_copy_clipboard_ok\nSMOKE done\n',
      ''
    )
    expect(verdict).toEqual({ ok: true, reason: SMOKE_DONE_MARKER })
  })

  it('fails with the smoke failure message when an assertion broke', () => {
    const verdict = verdictFromSmokeLogs(
      'SMOKE user_copy_start\n',
      'SMOKE FAIL ticket-44 stage: the window never took focus for the real-clipboard click\n' +
        'SMOKE FAIL recent events: abc123:session_created\n'
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe(
      'SMOKE FAIL ticket-44 stage: the window never took focus for the real-clipboard click'
    )
  })

  it('fails when the smoke produced neither marker (crash, hang, or no smoke)', () => {
    const verdict = verdictFromSmokeLogs('', 'Electron Security Warning (insecure Content-Security-Policy)\n')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('neither')
    expect(verdict.reason).toContain(SMOKE_DONE_MARKER)
    expect(verdict.reason).toContain(SMOKE_FAIL_MARKER)
  })

  it('prefers the failure reason when both markers somehow appear', () => {
    const verdict = verdictFromSmokeLogs('SMOKE done\n', 'SMOKE FAIL something exploded\n')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('SMOKE FAIL something exploded')
  })

  it('ignores look-alike text that does not start a smoke line', () => {
    // The markers are asserted as substrings of whole lines the smoke prints;
    // unrelated app chatter mentioning "done" must not flip the verdict.
    const verdict = verdictFromSmokeLogs('All done! Exiting gracefully.\n', '')
    expect(verdict.ok).toBe(false)
  })
})
