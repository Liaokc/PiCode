import type { AuthProbeReport, ModelCatalogEntry, ProviderAuthStatus } from '../shared/auth-status.ts'
import type { ThinkingLevel } from '../shared/contract.ts'

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
  getModels(providerId?: string): ReadonlyArray<ProbeModelLike>
  checkAuth(providerId: string): Promise<{ source?: string; type: 'api_key' | 'oauth' } | undefined>
}

/** Structural subset of a pi-ai `Model` the probe projects (ticket 41: the
 * thinking-level data feeds the empty-state menu's per-model filtering). */
export interface ProbeModelLike {
  id: string
  name?: string
  reasoning?: boolean
  /** Maps pi thinking levels to model-specific values; null = unsupported,
   * missing key = provider default (pi-ai `Model.thinkingLevelMap`). */
  thinkingLevelMap?: Partial<Record<string, string | null>>
}

/** Canonical pi thinking levels, the SDK's EXTENDED_THINKING_LEVELS order. */
const ALL_LEVELS: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/**
 * The thinking levels a model actually supports — mirrors the SDK's
 * `getSupportedThinkingLevels` (not exported from the package; verified
 * against the 0.84.x bundle). Non-reasoning models only ever support 'off';
 * a level mapped to null is unsupported; xhigh/max must be mapped
 * explicitly while the other levels default to supported.
 */
export function supportedThinkingLevels(model: ProbeModelLike): ThinkingLevel[] {
  if (!model.reasoning) return ['off']
  return ALL_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    return level === 'xhigh' || level === 'max' ? mapped !== undefined : true
  })
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
      catalog.push({
        providerId: provider.id,
        modelId: model.id,
        name: model.name ?? model.id,
        thinkingLevels: supportedThinkingLevels(model)
      })
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
