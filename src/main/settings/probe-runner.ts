/**
 * Auth-probe runner (main process, ticket 11): forks a short-lived
 * host-family process in probe mode (ADR-0003: the Pi SDK never loads in the
 * main process) and resolves its read-only credential report. Every failure
 * mode (spawn, crash, timeout, invalid report) resolves — never rejects —
 * with an error report the settings window can display.
 *
 * Ticket 52: `options.cwd` scopes the probe's command-catalog enumeration
 * (prompt templates + skills for that working directory); omitted → the
 * probe host falls back to the home directory (global resources only).
 */
import { fork, type ChildProcess } from 'node:child_process'
import { isAuthProbeReport, type AuthProbeReport } from '../../shared/auth-status'

export interface AuthProbeHostOptions {
  timeoutMs?: number
  cwd?: string | null
}

export function runAuthProbeHost(hostEntryPath: string, options: AuthProbeHostOptions = {}): Promise<AuthProbeReport> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const args = options.cwd ? ['--auth-probe', options.cwd] : ['--auth-probe']
  return new Promise((resolve) => {
    let settled = false
    let child: ChildProcess | null = null
    const finish = (report: AuthProbeReport): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child?.kill()
      resolve(report)
    }
    const timer = setTimeout(
      () => finish({ scannedAt: Date.now(), providers: [], models: [], error: 'The auth probe timed out.' }),
      timeoutMs
    )
    timer.unref?.()
    try {
      child = fork(hostEntryPath, args, {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc']
      })
    } catch (err) {
      finish({
        scannedAt: Date.now(),
        providers: [],
        models: [],
        error: err instanceof Error ? err.message : String(err)
      })
      return
    }
    child.on('message', (message) => {
      if (isAuthProbeReport(message)) finish(message)
    })
    child.on('error', (err) =>
      finish({ scannedAt: Date.now(), providers: [], models: [], error: err.message })
    )
    child.on('exit', () =>
      finish({
        scannedAt: Date.now(),
        providers: [],
        models: [],
        error: 'The auth probe exited before reporting.'
      })
    )
  })
}
