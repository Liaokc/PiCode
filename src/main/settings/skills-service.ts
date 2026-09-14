/**
 * SkillsService (main process, ticket 63): the Skills section's backend.
 * Read side — a probe-host enumeration per working directory, cached like
 * the command-catalog service (the probe child runs the SDK; ADR-0003 keeps
 * it out of main). Write side — per-skill toggles derive a `pi config`-
 * format change through the shared pure model and apply it to Pi's global
 * settings.json; deletes go through the strictly-scoped entry delete.
 *
 * The agent dir (and therefore the settings file + skills dir) is resolved
 * once: PICODE_PI_AGENT_DIR overrides for smokes/harnesses, else the SDK's
 * own rule (~/.pi/agent or PI_CODING_AGENT_DIR — mirrored here without
 * importing the SDK).
 */

import { homedir } from 'node:os'
import path from 'node:path'
import {
  deriveSkillSettingsChange,
  isSkillsReport,
  type PiResourceSettings,
  type SkillCatalogRow,
  type SkillsReport
} from '../../shared/skills-management'
import type { AuthProbeReport } from '../../shared/auth-status'
import {
  deleteSkillEntry,
  readPiSettingsSync,
  writeSkillOverride
} from './pi-settings-editor'

/** Structural subset of the probe runner the service drives. */
export type SkillsProbe = (cwd: string | null, agentDir: string | null) => Promise<AuthProbeReport>

export interface SkillsServiceOptions {
  probe: SkillsProbe
  /** Pi agent dir override (smoke/harness sandbox); null = the default. */
  agentDirOverride?: string | null
}

/** Toggle/delete results the renderer's toasts surface verbatim. */
export type SkillActionOutcome = { ok: true } | { ok: false; error: string }

export class SkillsService {
  private cache = new Map<string, SkillsReport>()
  private inFlight = new Map<string, Promise<SkillsReport>>()
  readonly agentDirOverride: string | null
  private readonly probe: SkillsProbe

  constructor(options: SkillsServiceOptions) {
    this.agentDirOverride = options.agentDirOverride ?? null
    this.probe = options.probe
  }

  /**
   * The agent dir — resolved PER CALL, not captured at construction: the
   * smoke sets its sandbox (PICODE_PI_AGENT_DIR) after main is up, and the
   * env override must win from then on (the PiCode-prefixed variable beats
   * the SDK's PI_CODING_AGENT_DIR so session hosts are never affected).
   */
  get agentDir(): string {
    if (this.agentDirOverride !== null) return this.agentDirOverride
    const env = process.env['PICODE_PI_AGENT_DIR'] ?? process.env['PI_CODING_AGENT_DIR'] ?? ''
    if (env.trim() !== '') return env
    return path.join(homedir(), '.pi', 'agent')
  }

  get piSettingsFile(): string {
    return path.join(this.agentDir, 'settings.json')
  }

  get piSkillsDir(): string {
    return path.join(this.agentDir, 'skills')
  }

  /**
   * The Skills-section enumeration for one directory (null = home — the
   * global face). Cached per directory; `force` re-probes. Every failure
   * mode resolves into an error report — never a throw.
   */
  async listSkills(cwd: string | null, force = false): Promise<SkillsReport> {
    const key = cwd ?? ''
    if (!force) {
      const cached = this.cache.get(key)
      if (cached) return cached
      const flight = this.inFlight.get(key)
      if (flight) return flight
    }
    const flight = this.runProbe(cwd)
    this.inFlight.set(key, flight)
    const report = await flight
    this.inFlight.delete(key)
    return report
  }

  private async runProbe(cwd: string | null): Promise<SkillsReport> {
    try {
      const report = await this.probe(cwd, this.agentDirOverride ?? process.env['PICODE_PI_AGENT_DIR'] ?? null)
      if (report.skills === undefined || report.skillsError === undefined) {
        return {
          cwd,
          scannedAt: Date.now(),
          rows: [],
          error: report.error ?? 'The skills probe returned no enumeration.'
        }
      }
      const payload: SkillsReport = {
        cwd: report.skillsCwd ?? null,
        scannedAt: report.skillsScannedAt ?? report.scannedAt,
        rows: report.skills,
        error: report.skillsError ?? null,
        // Ticket 67: the probed cwd's trust state rides the same probe
        // report (computed for the Packages section) — the Project-skills
        // group headers surface it honestly.
        trust: report.projectTrust ?? null
      }
      if (isSkillsReport(payload)) {
        this.cache.set(cwd ?? '', payload)
        return payload
      }
      return {
        cwd,
        scannedAt: Date.now(),
        rows: [],
        error: 'The skills probe returned a malformed enumeration.'
      }
      return {
        cwd,
        scannedAt: Date.now(),
        rows: [],
        error: report.error ?? 'The skills probe returned no enumeration.'
      }
    } catch (err) {
      return { cwd, scannedAt: Date.now(), rows: [], error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Toggle one skill (enable/disable): derive the pi-config-format change
   * from the CURRENT settings document and apply it. The row must come from
   * a probe (its source metadata anchors the pattern); the cache is dropped
   * so the next list reflects the new truth.
   */
  async toggleSkill(row: SkillCatalogRow, enable: boolean): Promise<SkillActionOutcome> {
    if (row === null || typeof row !== 'object' || typeof row.path !== 'string') {
      return { ok: false, error: 'Malformed skill row.' }
    }
    if (row.broken === true) {
      return { ok: false, error: 'A broken link cannot be toggled.' }
    }
    try {
      const current = readPiSettingsSync(this.piSettingsFile) as PiResourceSettings
      const { settings, changed } = deriveSkillSettingsChange(current, row, enable, this.agentDir)
      if (changed) {
        await writeSkillOverride(this.piSettingsFile, (doc) => ({
          ...doc,
          ...(settings.skills !== undefined ? { skills: settings.skills } : {}),
          ...(settings.packages !== undefined ? { packages: settings.packages } : {})
        }))
      }
      this.cache.clear()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Delete ONE entry under ~/.pi/agent/skills (links only lose the link —
   * symlink targets are never touched; see pi-settings-editor for the red
   * line). The cache is dropped so the next list reflects the deletion.
   */
  async deleteSkillEntry(entryPath: string): Promise<SkillActionOutcome> {
    try {
      const outcome = await deleteSkillEntry({ path: entryPath, piSkillsDir: this.piSkillsDir })
      if (outcome.ok) this.cache.clear()
      return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
