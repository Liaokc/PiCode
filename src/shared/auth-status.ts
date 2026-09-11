/**
 * Per-provider auth status for the settings window (ticket 11): a read-only
 * view of credential health. The data is collected by an auth-probe host
 * process (ADR-0003: the Pi SDK never loads in the renderer or the main
 * process) via `ModelRuntime.checkAuth` + a metadata read of auth.json, and
 * rendered verbatim — PiCode never resolves or displays secret values.
 *
 * Pure health derivation + a structural guard for the probe's IPC report.
 */

import type { ThinkingLevel } from './contract.ts'
import { isSkillsReport, type SkillsReport } from './skills-management.ts'

export type AuthMethod = 'api_key' | 'oauth'

/** One provider row of the read-only sign-in status list. */
export interface ProviderAuthStatus {
  providerId: string
  /** Display name from the Pi registry (falls back to the id). */
  name: string
  /** Models known for this provider in the Pi registry. */
  modelCount: number
  /** Credential kind found for the provider; null when unconfigured. */
  authType: AuthMethod | null
  /** Human-readable source label from Pi's auth check ("ANTHROPIC_API_KEY", "OAuth", …). */
  source: string | null
  /** OAuth expiry (epoch ms) when the credential is OAuth; null otherwise. */
  oauthExpiresAt: number | null
}

export type AuthHealth =
  | 'ok'
  | 'expired'
  | 'not-configured'

/**
 * Credential health for the status dot. OAuth credentials expiring at or
 * before `nowMs` count as expired (the refresh token must be renewed by
 * signing in again from the Pi TUI — PiCode never refreshes or writes).
 */
export function authHealth(status: ProviderAuthStatus, nowMs: number): AuthHealth {
  if (status.authType === null) return 'not-configured'
  if (status.authType === 'oauth' && status.oauthExpiresAt !== null && status.oauthExpiresAt <= nowMs) {
    return 'expired'
  }
  return 'ok'
}

/** Result of an auth-probe host run. `error` set ⇒ providers/models empty. */
export interface AuthProbeReport {
  /** Wall-clock time the probe finished scanning. */
  scannedAt: number
  providers: ProviderAuthStatus[]
  /** Model catalog for the default-model picker (id/name only, no pricing). */
  models: ModelCatalogEntry[]
  error: string | null
  /**
   * Ticket 52 (additive, operator-approved): the command catalog for the
   * probed working directory — prompt templates + skills as raw rows, no
   * session machinery behind it. Reports from older probes omit the field;
   * consumers treat absence as "not enumerated". A probe run without a cwd
   * argument (auth-only refresh) reports an empty array.
   */
  commands?: CommandCatalogRow[]
  /**
   * Ticket 63 (additive, operator-approved): the Skills-section enumeration
   * for the probed working directory — every skill entry Pi discovers (user
   * dir incl. symlinks, package-provided, trusted project) with its source
   * dimensions and enabled state. Reports from older probes omit the field;
   * consumers treat absence as "not enumerated".
   */
  skills?: SkillsReport['rows']
  /** Error of the skills enumeration alone (the auth/commands report stays
   * usable when only the skills pass fails). null = clean. */
  skillsError?: string | null
  skillsScannedAt?: number
  skillsCwd?: string | null
}

/** One raw row of the probe's command catalog (prompt template or skill). */
export interface CommandCatalogRow {
  name: string
  description: string
  argumentHint?: string
  source: 'prompt' | 'skill'
}

/**
 * One row of the model catalog the probe reports.
 *
 * Ticket 41 (additive, operator-approved): `thinkingLevels` carries the
 * levels the model actually supports (pi-ai `Model.reasoning` +
 * `thinkingLevelMap` semantics — null mappings are unsupported), so the
 * new-task empty state can filter its thinking menu without a host. Reports
 * from older probes omit the field; consumers fall back to the full seven.
 */
export interface ModelCatalogEntry {
  providerId: string
  modelId: string
  name: string
  thinkingLevels?: ThinkingLevel[]
}

function isProviderStatus(value: unknown): value is ProviderAuthStatus {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const idOk = typeof record['providerId'] === 'string' && typeof record['name'] === 'string'
  const countOk = typeof record['modelCount'] === 'number'
  const authTypeOk =
    record['authType'] === null || record['authType'] === 'api_key' || record['authType'] === 'oauth'
  const sourceOk = record['source'] === null || typeof record['source'] === 'string'
  const expiresOk = record['oauthExpiresAt'] === null || typeof record['oauthExpiresAt'] === 'number'
  return idOk && countOk && authTypeOk && sourceOk && expiresOk
}

const THINKING_LEVEL_SET = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

function isModelCatalogEntry(value: unknown): value is ModelCatalogEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const levels = record['thinkingLevels']
  const levelsOk =
    levels === undefined ||
    (Array.isArray(levels) && levels.every((level) => typeof level === 'string' && THINKING_LEVEL_SET.has(level)))
  return (
    typeof record['providerId'] === 'string' &&
    typeof record['modelId'] === 'string' &&
    typeof record['name'] === 'string' &&
    levelsOk
  )
}

const COMMAND_SOURCE_SET = new Set(['prompt', 'skill'])

function isCommandCatalogRow(value: unknown): value is CommandCatalogRow {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const hintOk = record['argumentHint'] === undefined || typeof record['argumentHint'] === 'string'
  return (
    typeof record['name'] === 'string' &&
    typeof record['description'] === 'string' &&
    hintOk &&
    typeof record['source'] === 'string' &&
    COMMAND_SOURCE_SET.has(record['source'])
  )
}

/** Structural guard for reports arriving over IPC (probe child → main). */
export function isAuthProbeReport(value: unknown): value is AuthProbeReport {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const commands = record['commands']
  const commandsOk =
    commands === undefined || (Array.isArray(commands) && commands.every(isCommandCatalogRow))
  // Ticket 63: the skills block rides the same report; all-or-nothing per
  // field so a partial skills enumeration degrades to "not enumerated".
  const skillsOk =
    record['skills'] === undefined ||
    isSkillsReport({
      cwd: record['skillsCwd'] ?? null,
      scannedAt: typeof record['skillsScannedAt'] === 'number' ? record['skillsScannedAt'] : 0,
      rows: record['skills'],
      error: record['skillsError'] ?? null
    })
  return (
    typeof record['scannedAt'] === 'number' &&
    (record['error'] === null || typeof record['error'] === 'string') &&
    Array.isArray(record['providers']) &&
    record['providers'].every(isProviderStatus) &&
    Array.isArray(record['models']) &&
    record['models'].every(isModelCatalogEntry) &&
    commandsOk &&
    skillsOk
  )
}
