/**
 * Per-provider auth status for the settings window (ticket 11): a read-only
 * view of credential health. The data is collected by an auth-probe host
 * process (ADR-0003: the Pi SDK never loads in the renderer or the main
 * process) via `ModelRuntime.checkAuth` + a metadata read of auth.json, and
 * rendered verbatim — PiCode never resolves or displays secret values.
 *
 * Pure health derivation + a structural guard for the probe's IPC report.
 */

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
}

/** One row of the model catalog the probe reports. */
export interface ModelCatalogEntry {
  providerId: string
  modelId: string
  name: string
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

function isModelCatalogEntry(value: unknown): value is ModelCatalogEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['providerId'] === 'string' &&
    typeof record['modelId'] === 'string' &&
    typeof record['name'] === 'string'
  )
}

/** Structural guard for reports arriving over IPC (probe child → main). */
export function isAuthProbeReport(value: unknown): value is AuthProbeReport {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['scannedAt'] === 'number' &&
    (record['error'] === null || typeof record['error'] === 'string') &&
    Array.isArray(record['providers']) &&
    record['providers'].every(isProviderStatus) &&
    Array.isArray(record['models']) &&
    record['models'].every(isModelCatalogEntry)
  )
}
