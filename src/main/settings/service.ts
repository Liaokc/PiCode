/**
 * SettingsService (main process, ticket 11): PiCode-owned application
 * preferences plus the read-only auth-probe cache.
 *
 * - Preferences persist to PiCode's own file (Electron userData in dev/prod)
 *   — never to Pi's settings.json (red line: Pi data stays untouched).
 * - The last used working directory is recorded by the create-session relay
 *   so the "reuse last folder" startup preference works across launches.
 * - Auth reports come from a probe() callback the wiring injects (it forks a
 *   short-lived host-family process). Reports are cached until a forced
 *   refresh; failures surface as an error report, never a throw.
 * - Preference writes serialize through a queue; each patch merges on top of
 *   the previous one, so concurrent setters never lose each other's fields.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isAuthProbeReport, type AuthProbeReport } from '../../shared/auth-status'
import {
  mergePreferences,
  normalizePreferences,
  type AppPreferences
} from '../../shared/preferences'

export interface SettingsServiceOptions {
  /** Absolute path of the settings JSON document. */
  file: string
  /** Run one auth probe (host-family child) and resolve its report. */
  probe: () => Promise<AuthProbeReport>
}

/** What the renderer's settings window loads in one query. */
export interface SettingsSnapshot {
  preferences: AppPreferences
  lastUsedDirectory: string | null
}

export class SettingsService {
  private loaded: Promise<void> | null = null
  private preferences: AppPreferences = normalizePreferences(undefined)
  private lastUsedDirectory: string | null = null
  private auth: AuthProbeReport | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: SettingsServiceOptions) {}

  /** Preferences + last used directory in one query (document loads once). */
  async getSnapshot(): Promise<SettingsSnapshot> {
    await this.ensureLoaded()
    return { preferences: this.preferences, lastUsedDirectory: this.lastUsedDirectory }
  }

  /** Merge a (possibly untrusted) patch, persist, and return the result. */
  async setPreferences(patch: unknown): Promise<AppPreferences> {
    await this.ensureLoaded()
    return this.enqueue(() => {
      this.preferences = mergePreferences(this.preferences, patch)
      return this.writeDocument().then(() => this.preferences)
    })
  }

  /** Called by the create-session relay for every spawned session. */
  async recordLastUsedDirectory(cwd: string): Promise<void> {
    await this.ensureLoaded()
    if (this.lastUsedDirectory === cwd) return
    await this.enqueue(() => {
      this.lastUsedDirectory = cwd
      return this.writeDocument()
    })
  }

  /** Cached auth report; `force` runs a fresh probe. */
  async authReport(force = false): Promise<AuthProbeReport> {
    if (this.auth !== null && !force) return this.auth
    try {
      const report = await this.options.probe()
      this.auth = isAuthProbeReport(report)
        ? report
        : {
            scannedAt: Date.now(),
            providers: [],
            models: [],
            error: 'The auth probe returned an invalid report.'
          }
    } catch (err) {
      this.auth = {
        scannedAt: Date.now(),
        providers: [],
        models: [],
        error: err instanceof Error ? err.message : String(err)
      }
    }
    return this.auth
  }

  cachedAuthReport(): AuthProbeReport | null {
    return this.auth
  }

  private ensureLoaded(): Promise<void> {
    this.loaded ??= this.readDocument().catch(() => undefined)
    return this.loaded
  }

  private async readDocument(): Promise<void> {
    const raw = await readFile(this.options.file, 'utf-8')
    const doc = JSON.parse(raw) as { preferences?: unknown; lastUsedDirectory?: unknown }
    this.preferences = normalizePreferences(doc.preferences)
    this.lastUsedDirectory = typeof doc.lastUsedDirectory === 'string' ? doc.lastUsedDirectory : null
  }

  private async writeDocument(): Promise<void> {
    const file = this.options.file
    await mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    const document = {
      preferences: this.preferences,
      lastUsedDirectory: this.lastUsedDirectory
    }
    await writeFile(temp, JSON.stringify(document, null, 2))
    await rename(temp, file)
  }

  /** Serialized read-modify-write: queued tasks run in order, errors swallowed. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }
}
