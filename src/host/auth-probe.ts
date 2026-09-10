import type { AuthProbeReport, CommandCatalogRow, ModelCatalogEntry, ProviderAuthStatus } from '../shared/auth-status.ts'
import type { ThinkingLevel } from '../shared/contract.ts'
import { homedir } from 'node:os'

/**
 * Auth-probe collector (ticket 11, extended by ticket 52). The probe is a
 * short-lived host-family process (ADR-0003: the Pi SDK never loads in the
 * renderer or the main process) that enumerates the Pi provider registry
 * read-only and reports credential metadata — never secret values — plus
 * (ticket 52) the command catalog for one working directory: the resource
 * loader's prompt templates + skills, no session machinery behind it. This
 * module keeps the pure projections (`collectAuthStatuses`,
 * `collectCommandCatalog`, injectable + fake-testable); the SDK wiring
 * lives in `runAuthProbe` at the host entry.
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
 * Structural subset of the SDK's `ResourceLoader` the probe enumerates
 * (ticket 52): prompt templates + skills for one working directory — the
 * same `getPrompts`/`getSkills` faces the live session's slash menu feeds
 * from, so the empty-state menu matches the in-session one exactly.
 */
export interface ProbeResourceLoader {
  getPrompts(): { prompts: Array<{ name: string; description: string; argumentHint?: string }> }
  getSkills(): { skills: Array<{ name: string; description: string }> }
}

/**
 * Project the resource loader's prompt templates + skills into the probe
 * report's raw catalog rows (prompts first, then skills — the same order
 * the in-session `buildSlashCommands` uses). Enumeration failures degrade
 * to an empty catalog: the menu is truthfully empty, never a crash.
 */
export function collectCommandCatalog(loader: ProbeResourceLoader): CommandCatalogRow[] {
  try {
    const rows: CommandCatalogRow[] = loader.getPrompts().prompts.map((p) => ({
      name: p.name,
      description: p.description,
      // Frontmatter YAML may deliver a non-string hint (e.g. `[env]` parses
      // as a one-element array) even though the SDK types it string — the
      // in-session menu renders it inline, so stringify the same way.
      ...(p.argumentHint !== undefined ? { argumentHint: stringifyHint(p.argumentHint) } : {}),
      source: 'prompt' as const
    }))
    for (const skill of loader.getSkills().skills) {
      rows.push({ name: skill.name, description: skill.description, source: 'skill' })
    }
    return rows
  } catch {
    return []
  }
}

/** YAML frontmatter values can be arrays/numbers; the menu renders hints
 * inline via template literal, so non-strings stringify the same way. */
function stringifyHint(hint: unknown): string {
  return typeof hint === 'string' ? hint : String(hint)
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
 * SDK wiring for the probe host process: stand up the cwd-bound session
 * services (ticket 52 — the same factory a real session uses, so the
 * resource loader sees exactly what a session in that directory would see;
 * no AgentSession is created — infrastructure only), project the model
 * registry and the resource catalog, and report. Never resolves secret
 * values — only the metadata the read-only views show.
 *
 * `cwd` (ticket 52) scopes the command catalog: without it the probe falls
 * back to the home directory (global resources only — no project-level
 * `.pi/` resources can live there beyond the agent dir's own). Errors never
 * throw — they surface as an error report the consumers can display.
 */
export async function runAuthProbe(cwd?: string): Promise<AuthProbeReport> {
  try {
    const sdk = await import('@earendil-works/pi-coding-agent')
    const services = await sdk.createAgentSessionServices({ cwd: cwd && cwd.trim() !== '' ? cwd : homedir() })
    const report = await collectAuthStatuses(
      {
        getProviders: () => services.modelRuntime.getProviders().map((provider) => ({ id: provider.id })),
        getProvider: (id) => {
          const provider = services.modelRuntime.getProvider(id)
          return provider ? { name: provider.name } : undefined
        },
        getModels: (id) => services.modelRuntime.getModels(id),
        checkAuth: (id) => services.modelRuntime.checkAuth(id)
      },
      (id) => sdk.readStoredCredential(id)
    )
    report.commands = collectCommandCatalog(services.resourceLoader)
    return report
  } catch (err) {
    return {
      scannedAt: Date.now(),
      providers: [],
      models: [],
      commands: [],
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
