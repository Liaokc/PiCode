/**
 * Usage service (main process): owns the aggregation cache and exposes the
 * single query the renderer is allowed — the chart-ready snapshot. The
 * renderer never touches session files; everything it draws comes from here
 * (ADR-0002, spec "Usage 聚合器缝").
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { UsageStore } from './store.ts'
import type { UsageSnapshot } from '../../shared/usage/aggregate.ts'

/** Pi's shared session storage — TUI and PiCode read the same files. */
export function defaultSessionsDir(): string {
  return join(homedir(), '.pi', 'agent', 'sessions')
}

export interface UsageService {
  snapshot(): Promise<UsageSnapshot>
}

export function createUsageService(opts?: { sessionsDir?: string }): UsageService {
  const store = new UsageStore({ sessionsDir: opts?.sessionsDir ?? defaultSessionsDir() })
  return {
    snapshot: () => store.scan()
  }
}
