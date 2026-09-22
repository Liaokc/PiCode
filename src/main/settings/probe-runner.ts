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
import { hostForkEnv } from '../spawn-path'

export interface AuthProbeHostOptions {
  timeoutMs?: number
  cwd?: string | null
  /** Ticket 63: agent-dir override for the skills enumeration (smoke/harness
   * sandbox); forwarded as the probe host's optional third argument. */
  agentDir?: string | null
}

export function runAuthProbeHost(hostEntryPath: string, options: AuthProbeHostOptions = {}): Promise<AuthProbeReport> {
  const timeoutMs = options.timeoutMs ?? 15_000
  // The agentDir argument is ALWAYS argv[4]: when no cwd is requested the
  // cwd slot stays an EMPTY STRING (the host falls back to the home
  // directory) — dropping the slot would shift the agentDir into the cwd
  // position and silently probe the REAL agent dir (the bug the ticket-67
  // Global-card probe first exposed: every pre-67 caller passed a cwd, so
  // the null-cwd + agentDir combination never ran).
  const args = ['--auth-probe', options.cwd ? options.cwd : '']
  if (options.agentDir && options.agentDir.trim() !== '') args.push(options.agentDir)
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
        // Ticket 134: the composed spawn PATH rides the probe fork too —
        // every host-family child resolves `node` the same way.
        env: hostForkEnv(),
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
