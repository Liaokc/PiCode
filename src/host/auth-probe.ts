import type { AuthProbeReport, ModelCatalogEntry, ProviderAuthStatus } from '../shared/auth-status.ts'

/**
 * Auth-probe collector (ticket 11). The probe is a short-lived host-family
 * process (ADR-0003: the Pi SDK never loads in the renderer or the main
 * process) that enumerates the Pi provider registry read-only and reports
 * credential metadata — never secret values. This module keeps the pure
 * projection (`collectAuthStatuses`, injectable + fake-testable); the SDK
 * wiring lives in `runAuthProbe` at the host entry.
 */

/** Structural subset of pi-ai `Models` the probe needs. */
export interface AuthProbeModels {
  getProviders(): ReadonlyArray<{ id: string }>
  getProvider(id: string): { name?: string } | undefined
  getModels(providerId?: string): ReadonlyArray<{ id: string; name?: string }>
  checkAuth(providerId: string): Promise<{ source?: string; type: 'api_key' | 'oauth' } | undefined>
}

/** Structural subset of the stored `Credential` (auth.json entry). */
export interface StoredCredentialLike {
  type?: string
  expires?: number
}

/**
 * Project the provider registry into the read-only status rows: every
 * provider gets a row (configured or not) so the settings view can show the
 * "sign in from the Pi TUI" guidance where credentials are missing.
 */
export async function collectAuthStatuses(
  models: AuthProbeModels,
  readCredential: (providerId: string) => StoredCredentialLike | undefined
): Promise<AuthProbeReport> {
  const providers: ProviderAuthStatus[] = []
  const catalog: ModelCatalogEntry[] = []
  for (const provider of models.getProviders()) {
    const check = await models.checkAuth(provider.id).catch(() => undefined)
    const credential = readCredential(provider.id)
    const authType =
      check?.type ?? (credential?.type === 'api_key' || credential?.type === 'oauth' ? credential.type : null)
    const providerModels = models.getModels(provider.id)
    providers.push({
      providerId: provider.id,
      name: models.getProvider(provider.id)?.name ?? provider.id,
      modelCount: providerModels.length,
      authType,
      source: check?.source ?? null,
      oauthExpiresAt: credential?.type === 'oauth' && typeof credential.expires === 'number' ? credential.expires : null
    })
    for (const model of providerModels) {
      catalog.push({ providerId: provider.id, modelId: model.id, name: model.name ?? model.id })
    }
  }
  return { scannedAt: Date.now(), providers, models: catalog, error: null }
}

/**
 * SDK wiring for the probe host process: stand up a standalone ModelRuntime
 * (auth.json + models.json, no network refresh, no session machinery),
 * project the registry, and report. Never resolves secret values — only the
 * metadata the read-only status view shows.
 */
export async function runAuthProbe(): Promise<AuthProbeReport> {
  try {
    const sdk = await import('@earendil-works/pi-coding-agent')
    const runtime = await sdk.ModelRuntime.create()
    return await collectAuthStatuses(
      {
        getProviders: () => runtime.getProviders().map((provider) => ({ id: provider.id })),
        getProvider: (id) => {
          const provider = runtime.getProvider(id)
          return provider ? { name: provider.name } : undefined
        },
        getModels: (id) => runtime.getModels(id),
        checkAuth: (id) => runtime.checkAuth(id)
      },
      (id) => sdk.readStoredCredential(id)
    )
  } catch (err) {
    return {
      scannedAt: Date.now(),
      providers: [],
      models: [],
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
