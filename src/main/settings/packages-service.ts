/**
 * PackagesService (main process, ticket 64): the Packages section's
 * backend. Read side — a probe-host enumeration per working directory,
 * cached like the skills service (the probe child runs the SDK; ADR-0003
 * keeps it out of main). Toggle side — the pure pi-config derivation
 * applied through the pi-settings editor (atomic parse → mutate →
 * serialize) on the GLOBAL settings file, and on the PROJECT settings
 * file only when the project is trusted (the trust gate mirrors pi's own
 * `pi install -l` refusal; the trust.json read + derivation is the same
 * pure code the probe reports). Install/remove — a short-lived op host
 * (`--packages-op`) runs the SDK's own package manager, relaying
 * progress events; one op at a time.
 *
 * The agent dir is resolved PER CALL (the smoke's PICODE_PI_AGENT_DIR
 * override must win after main is up) — the same rule as SkillsService.
 */

import { fork } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  derivePackagesArrayToggle,
  deriveProjectTrust,
  hasProjectTrustResources,
  isPackagesOpDescriptor,
  isPackagesReport,
  packagesOpRefusal,
  savedTrustDecision,
  type PackagesOpDescriptor,
  type PackagesOpOutcome,
  type PackagesProgressEvent,
  type PackagesReport
} from '../../shared/packages-management'
import { readPiSettingsSync, writeSkillOverride } from './pi-settings-editor'
import type { AuthProbeReport } from '../../shared/auth-status'

/** Structural subset of the probe runner the service drives. */
export type PackagesProbe = (cwd: string | null, agentDir: string | null) => Promise<AuthProbeReport>

/**
 * One op run: performs the descriptor's op and streams progress events.
 * The production runner forks the host entry (`--packages-op`); tests
 * inject a fake. The trust gate has ALREADY run when this is called.
 */
export type PackagesOpRunner = (
  descriptor: PackagesOpDescriptor,
  onProgress: (event: PackagesProgressEvent) => void
) => Promise<PackagesOpOutcome>

/** How long one op host may run before the watchdog kills it (npm/git
 * installs pull from the network; clones can be slow). */
const OP_TIMEOUT_MS = 5 * 60_000

/**
 * The production op runner: forks the host entry with the descriptor as
 * argv JSON, relays `packages-progress` events, and resolves the op
 * outcome. The watchdog kills a stalled host after OP_TIMEOUT_MS; every
 * failure mode resolves — never throws.
 */
export function forkPackagesOpRunner(hostEntryPath: string): PackagesOpRunner {
  return (descriptor, onProgress) =>
    new Promise<PackagesOpOutcome>((resolve) => {
      let settled = false
      let child: ReturnType<typeof fork> | null = null
      const finish = (outcome: PackagesOpOutcome): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(outcome)
      }
      const timer = setTimeout(() => {
        child?.kill()
        finish({ ok: false, error: 'The package operation timed out.' })
      }, OP_TIMEOUT_MS)
      timer.unref?.()
      try {
        child = fork(hostEntryPath, ['--packages-op', JSON.stringify(descriptor)], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['ignore', 'ignore', 'ignore', 'ipc']
        })
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
        return
      }
      child.on('message', (message) => {
        if (isPackagesProgressEvent(message)) {
          onProgress(message)
          return
        }
        if (isPackagesOpOutcome(message)) {
          finish(message)
        }
      })
      child.on('error', (err) => finish({ ok: false, error: err.message }))
      child.on('exit', () => finish({ ok: false, error: 'The package operation exited before reporting.' }))
    })
}

export interface PackagesServiceOptions {
  probe: PackagesProbe
  /** The op runner (host entry fork in production; a fake in tests). */
  runOp: PackagesOpRunner
  /** Pi agent dir override (smoke/harness sandbox); null = the default. */
  agentDirOverride?: string | null
}

export type PackageActionOutcome = { ok: true } | { ok: false; error: string }

export type PackageScope = 'global' | 'project'

export class PackagesService {
  private cache = new Map<string, PackagesReport>()
  private inFlight = new Map<string, Promise<PackagesReport>>()
  private opInFlight = false
  readonly agentDirOverride: string | null
  private readonly probe: PackagesProbe
  private readonly runOp: PackagesOpRunner

  constructor(options: PackagesServiceOptions) {
    this.agentDirOverride = options.agentDirOverride ?? null
    this.probe = options.probe
    this.runOp = options.runOp
  }

  /**
   * The agent dir — resolved PER CALL, not captured at construction (the
   * smoke sets its sandbox after main is up; see SkillsService).
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

  /** The project settings file for one cwd (cwd/.pi/settings.json). */
  projectSettingsFile(cwd: string): string {
    return path.join(cwd, '.pi', 'settings.json')
  }

  /**
   * The Packages-section report for one directory (null = the global
   * face — no project layer). Cached per directory; `force` re-probes.
   * Every failure mode resolves into an error report — never a throw.
   */
  async listPackages(cwd: string | null, force = false): Promise<PackagesReport> {
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

  private async runProbe(cwd: string | null): Promise<PackagesReport> {
    try {
      const report = await this.probe(cwd, this.agentDirOverride ?? process.env['PICODE_PI_AGENT_DIR'] ?? null)
      if (report.packages === undefined || report.packagesError === undefined) {
        return {
          cwd,
          scannedAt: Date.now(),
          global: [],
          project: [],
          trust: null,
          error: report.error ?? 'The packages probe returned no enumeration.'
        }
      }
      const candidate = {
        cwd: report.packagesCwd ?? null,
        scannedAt: report.packagesScannedAt ?? 0,
        global: report.packages,
        project: report.projectPackages ?? [],
        trust: report.projectTrust ?? null,
        error: report.packagesError
      }
      if (isPackagesReport(candidate)) {
        this.cache.set(cwd ?? '', candidate)
        return candidate
      }
      return {
        cwd,
        scannedAt: Date.now(),
        global: [],
        project: [],
        trust: null,
        error: 'The packages probe returned a malformed enumeration.'
      }
    } catch (err) {
      return {
        cwd,
        scannedAt: Date.now(),
        global: [],
        project: [],
        trust: null,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /**
   * The project's trust state as the GATE sees it: a fresh read of
   * trust.json (canonicalized nearest-parent walk over the document) +
   * the global defaultProjectTrust — the same derivation the probe
   * reports, but current at action time. Errors degrade to the safe
   * untrusted face.
   */
  projectTrustState(cwd: string): { trusted: boolean; hasResources: boolean } {
    const canonical = canonicalizeForTrust(cwd)
    let saved: boolean | null = null
    try {
      const trustFile = path.join(this.agentDir, 'trust.json')
      const parsed: unknown = JSON.parse(readFileSync(trustFile, 'utf-8'))
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        saved = savedTrustDecision(parsed as Record<string, unknown>, canonical)
      }
    } catch {
      saved = null
    }
    let defaultProjectTrust: string | null = null
    try {
      const value = readPiSettingsSync(this.piSettingsFile)['defaultProjectTrust']
      defaultProjectTrust = typeof value === 'string' ? value : null
    } catch {
      defaultProjectTrust = null
    }
    const hasResources = hasProjectTrustResources(cwd, homedir(), existsSync)
    return deriveProjectTrust({ savedDecision: saved, defaultProjectTrust, hasResources })
  }

  /**
   * Toggle one package's enabled state: derive the pi-config change from
   * the CURRENT settings document and apply it atomically. Project-scope
   * toggles are refused for untrusted projects (pi's own refusal).
   */
  async togglePackage(
    scope: PackageScope,
    source: string,
    enable: boolean,
    cwd: string | null
  ): Promise<PackageActionOutcome> {
    if (typeof source !== 'string' || source.trim() === '') {
      return { ok: false, error: 'Malformed package toggle request.' }
    }
    if (scope === 'project' && (cwd === null || cwd.trim() === '')) {
      return { ok: false, error: 'No project directory is scoped for this section.' }
    }
    if (scope === 'project' && cwd !== null) {
      const refusal = packagesOpRefusal(true, this.projectTrustState(cwd).trusted)
      if (refusal !== null) return { ok: false, error: refusal }
    }
    try {
      const file = scope === 'global' ? this.piSettingsFile : this.projectSettingsFile(cwd as string)
      const current = readPiSettingsSync(file)
      const packages = Array.isArray(current['packages']) ? current['packages'] : []
      const { packages: next, changed } = derivePackagesArrayToggle(packages, source, enable)
      if (!changed) return { ok: true }
      await writeSkillOverride(file, (doc) => ({ ...doc, packages: next }))
      this.cache.clear()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Install or remove one package through the op runner (the SDK's own
   * package manager — pi install/remove's exact path). One op at a time;
   * project-scope ops are gated on trust BEFORE a host is ever forked.
   * Progress events stream to `onProgress`.
   */
  async performOp(
    op: 'install' | 'remove',
    source: string,
    local: boolean,
    cwd: string | null,
    onProgress: (event: PackagesProgressEvent) => void
  ): Promise<PackageActionOutcome> {
    if (typeof source !== 'string' || source.trim() === '') {
      return { ok: false, error: 'Malformed package op request.' }
    }
    if (this.opInFlight) {
      return { ok: false, error: 'Another package operation is already running.' }
    }
    if (local && (cwd === null || cwd.trim() === '')) {
      return { ok: false, error: 'No project directory is scoped for this section.' }
    }
    if (local && cwd !== null) {
      const refusal = packagesOpRefusal(true, this.projectTrustState(cwd).trusted)
      if (refusal !== null) return { ok: false, error: refusal }
    }
    const descriptor: PackagesOpDescriptor = {
      op,
      source,
      local,
      cwd: cwd ?? homedir(),
      agentDir: this.agentDirOverride ?? process.env['PICODE_PI_AGENT_DIR'] ?? null
    }
    if (!isPackagesOpDescriptor(descriptor)) {
      return { ok: false, error: 'Malformed packages op descriptor.' }
    }
    this.opInFlight = true
    try {
      const outcome = await this.runOp(descriptor, onProgress)
      if (outcome.ok) this.cache.clear()
      return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
    } finally {
      this.opInFlight = false
    }
  }
}

/** Structural check for progress events arriving from the op host. */
function isPackagesProgressEvent(value: unknown): value is PackagesProgressEvent {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record['kind'] === 'packages-progress' &&
    typeof record['phase'] === 'string' &&
    typeof record['action'] === 'string' &&
    typeof record['source'] === 'string' &&
    (record['message'] === null || typeof record['message'] === 'string')
  )
}

/** Structural check for op outcomes arriving from the op host. */
function isPackagesOpOutcome(value: unknown): value is PackagesOpOutcome {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record['ok'] !== 'boolean') return false
  return record['ok'] === true || typeof record['error'] === 'string'
}

/**
 * Canonicalize a directory the way the SDK's trust store keys decisions:
 * resolve, then realpath when it exists (the probe's canonicalDir sibling;
 * main has no SDK).
 */
function canonicalizeForTrust(cwd: string): string {
  try {
    return realpathSync(cwd)
  } catch {
    return path.resolve(cwd)
  }
}
