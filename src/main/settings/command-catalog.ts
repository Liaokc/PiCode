/**
 * Command-catalog service (main process, ticket 52): per-directory command
 * catalogs for the new-task empty state's `/` menu. The renderer reports the
 * New Task chip's selected directory; the service debounces the switches,
 * probes each distinct directory exactly once (a short-lived probe host
 * fork, the auth-probe's cwd-parametrized report — ticket 52's additive
 * `commands` field), caches the catalog, and pushes it to every window.
 * Every failure mode resolves into an error payload — never a throw, never
 * a crash; the menu is truthfully empty instead.
 */

import { isAuthProbeReport, type AuthProbeReport } from '../../shared/auth-status'
import type { NewTaskCommandCatalog } from '../../shared/new-task-commands'

/** What the service pushes to the renderer for one probed directory. */
export type CommandCatalogPush = NewTaskCommandCatalog

export interface CommandCatalogServiceOptions {
  /** Run one command probe for the given directory (null = the no-selection
   * home-directory fallback). Resolves the probe host's report. */
  probe: (cwd: string | null) => Promise<AuthProbeReport>
  /** Deliver a finished catalog (fresh, cached, or error) to the renderer. */
  push: (payload: CommandCatalogPush) => void
  /** Trailing debounce window for directory switches (ms). */
  debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 300

export class CommandCatalogService {
  /** Cache key: the probed directory; '' stands for the null selection. */
  private cache = new Map<string, CommandCatalogPush>()
  /** In-flight probes keyed like the cache — concurrent requests for the
   * same directory share one fork. */
  private inFlight = new Map<string, Promise<CommandCatalogPush>>()
  private timer: NodeJS.Timeout | null = null
  private pendingCwd: string | null = null

  constructor(private readonly options: CommandCatalogServiceOptions) {}

  /** The New Task directory changed (renderer-reported). Debounced: only the
   * latest selection in the window probes; a cache hit pushes immediately. */
  request(cwd: string | null): void {
    this.pendingCwd = cwd
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.ensure(this.pendingCwd)
    }, this.options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
    this.timer.unref?.()
  }

  /** Stop pending work (app quit); running probes finish harmlessly. */
  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pendingCwd = null
  }

  private key(cwd: string | null): string {
    return cwd ?? ''
  }

  private async ensure(cwd: string | null): Promise<void> {
    const key = this.key(cwd)
    const cached = this.cache.get(key)
    if (cached) {
      this.options.push(cached)
      return
    }
    let flight = this.inFlight.get(key)
    if (!flight) {
      flight = this.runProbe(cwd)
      this.inFlight.set(key, flight)
    }
    const payload = await flight
    // Every requester for this directory pushes the shared result.
    this.options.push(payload)
  }

  private async runProbe(cwd: string | null): Promise<CommandCatalogPush> {
    const key = this.key(cwd)
    let payload: CommandCatalogPush
    try {
      const report = await this.options.probe(cwd)
      payload = isAuthProbeReport(report)
        ? {
            cwd,
            commands: report.commands ?? [],
            error: report.error,
            scannedAt: report.scannedAt
          }
        : { cwd, commands: [], error: 'The command probe returned an invalid report.', scannedAt: Date.now() }
    } catch (err) {
      payload = {
        cwd,
        commands: [],
        error: err instanceof Error ? err.message : String(err),
        scannedAt: Date.now()
      }
    } finally {
      this.inFlight.delete(key)
    }
    // Errors are cached too — a broken probe for a directory stays broken
    // until the app restarts (the same honesty rule as the auth cache).
    this.cache.set(key, payload)
    return payload
  }
}
