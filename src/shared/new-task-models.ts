/**
 * New-task model catalog (ticket 41): the model/thinking slice behind the
 * composer chips in the new-task empty state, where no host process exists
 * yet. Pure functions only — the data arrives as the auth-probe report
 * (ticket 11's `--auth-probe` short-lived host + its IPC channel, cached in
 * the main process; zero new contract), and everything here projects that
 * report plus the preference defaults into the shapes the composer renders.
 *
 * Two resolutions, both table-testable:
 * - catalog projection: probe report → provider→model cascade (the same
 *   `ProviderModels` shape the live session's `models_available` event
 *   carries, see host/composer-list.groupModelsByProvider);
 * - chained chip default: preference defaultModel/defaultThinkingLevel →
 *   Pi's own fallback (tagged "default" by the chip) → nothing (the menu
 *   shows a styled hint instead of a blank panel).
 */
import type { AuthProbeReport } from './auth-status.ts'
import { ALL_THINKING_LEVELS, type AccessMode, type ModelRef, type ProviderModels, type ThinkingLevel } from './contract.ts'
import type { SessionDefaults } from './preferences.ts'

/**
 * Pi's built-in fallback thinking level for a NEW session when nothing is
 * configured (the SDK's DEFAULT_THINKING_LEVEL). Unlike the model — which
 * can end up "nothing configured" — Pi always resolves a thinking level, so
 * the empty-state thinking chip always shows a value.
 */
export const PI_FALLBACK_THINKING_LEVEL: ThinkingLevel = 'medium'

/** Catalog row = the cascade's ModelRef plus the probe's per-model level
 * data (which levels the model actually supports; absent = unknown). */
export interface NewTaskCatalogModel extends ModelRef {
  thinkingLevels?: ThinkingLevel[]
}

/** Catalog group = the cascade's provider group over the extended rows. */
export interface NewTaskProviderGroup extends Omit<ProviderModels, 'models'> {
  models: NewTaskCatalogModel[]
}

/** The empty state's model catalog, projected from a probe report. */
export interface NewTaskCatalog {
  /** Provider→model cascade for the model menu (may be empty). */
  providers: NewTaskProviderGroup[]
  /**
   * What Pi itself would run with no PiCode preference: the first model of
   * the first auth-configured provider (the probe's read-only health rows
   * say which providers hold credentials). The last link of Pi's initial
   * model resolution — the chip tags it "default". null = nothing configured.
   */
  piFallback: ModelRef | null
  /** Probe failure, surfaced by the menu's empty hint; null = healthy scan. */
  error: string | null
}

/**
 * Project the auth-probe report into the empty-state catalog. Model rows
 * keep the report's order; provider display names come from the report's
 * provider rows (falling back to the id), matching the live session's
 * cascade shape exactly so the menu never changes shape across the first
 * send.
 */
export function projectNewTaskCatalog(report: AuthProbeReport): NewTaskCatalog {
  const names = new Map(report.providers.map((provider) => [provider.providerId, provider.name]))
  const groups = new Map<string, NewTaskProviderGroup>()
  for (const entry of report.models) {
    let group = groups.get(entry.providerId)
    if (!group) {
      group = {
        providerId: entry.providerId,
        name: names.get(entry.providerId) ?? entry.providerId,
        models: []
      }
      groups.set(entry.providerId, group)
    }
    group.models.push({
      providerId: entry.providerId,
      modelId: entry.modelId,
      name: entry.name,
      thinkingLevels: entry.thinkingLevels
    })
  }
  const providers = [...groups.values()]
  return { providers, piFallback: piFallbackFrom(report, providers), error: report.error }
}

/** First model of the first auth-configured provider (report order kept). */
function piFallbackFrom(report: AuthProbeReport, providers: readonly NewTaskProviderGroup[]): ModelRef | null {
  for (const provider of report.providers) {
    if (provider.authType === null) continue
    const first = providers.find((group) => group.providerId === provider.providerId)?.models[0]
    if (first) return first
  }
  return null
}

/** Where a resolved chip value came from — drives the chip's "default" tag. */
export type NewTaskDefaultSource = 'preference' | 'pi-fallback' | 'none'

/** The chained default the empty-state chips display. */
export interface NewTaskModelChip {
  model: ModelRef | null
  modelSource: NewTaskDefaultSource
  thinkingLevel: ThinkingLevel | null
  thinkingSource: NewTaskDefaultSource
}

export interface NewTaskChipInput {
  /** PiCode preference default model; null = unset. */
  preferenceModel: { providerId: string; modelId: string } | null
  /** PiCode preference default thinking level; null = unset. */
  preferenceThinkingLevel: ThinkingLevel | null
  /** The projected catalog; null while the probe has not landed yet. */
  catalog: NewTaskCatalog | null
}

/**
 * The thinking levels a model actually supports, from its catalog entry —
 * the probe reads `Model.reasoning` + `thinkingLevelMap` (null = unsupported).
 * Unknown model / absent field / no catalog → the full seven (the menu
 * cannot know better; the session's host-pushed list stays authoritative).
 */
export function resolveNewTaskThinkingLevels(
  providers: readonly NewTaskProviderGroup[],
  model: ModelRef | null
): ThinkingLevel[] {
  if (model === null) return [...ALL_THINKING_LEVELS]
  const entry = findCatalogModel(providers, model.providerId, model.modelId)
  return entry?.thinkingLevels && entry.thinkingLevels.length > 0
    ? entry.thinkingLevels
    : [...ALL_THINKING_LEVELS]
}

/**
 * Clamp a requested level to a model's supported list — mirrors the SDK's
 * `clampThinkingLevel` (forward search from the requested level, then
 * backward). Levels unknown → the request passes through unchanged; a null
 * request (no value to show) passes through too.
 */
export function clampThinkingLevelToLevels(
  level: ThinkingLevel | null,
  supported: readonly ThinkingLevel[]
): ThinkingLevel | null {
  if (level === null || supported.length === 0 || supported.includes(level)) return level
  const requestedIndex = ALL_THINKING_LEVELS.indexOf(level)
  for (let i = Math.max(requestedIndex, 0); i < ALL_THINKING_LEVELS.length; i++) {
    const candidate = ALL_THINKING_LEVELS[i]!
    if (supported.includes(candidate)) return candidate
  }
  for (let i = requestedIndex - 1; i >= 0; i--) {
    const candidate = ALL_THINKING_LEVELS[i]!
    if (supported.includes(candidate)) return candidate
  }
  return level
}

/**
 * The chip's chained default. Model: preference → Pi fallback → none. A
 * preference pointing outside the catalog never takes effect (the host's
 * seed lookup fails and Pi falls back at create time), so the chain skips
 * it — the chip shows what will actually run. Thinking: preference → Pi's
 * built-in fallback ('medium') — Pi always resolves a level, so there is no
 * "none" link. Both resolutions are independent (a preference model with no
 * preference thinking still tags the thinking "default").
 */
export function resolveNewTaskModelChip(input: NewTaskChipInput): NewTaskModelChip {
  const model = resolveChipModel(input.preferenceModel, input.catalog)
  const thinkingLevel = input.preferenceThinkingLevel ?? PI_FALLBACK_THINKING_LEVEL
  return {
    model: model.ref,
    modelSource: model.source,
    thinkingLevel,
    thinkingSource: input.preferenceThinkingLevel === null ? 'pi-fallback' : 'preference'
  }
}

function resolveChipModel(
  preferenceModel: NewTaskChipInput['preferenceModel'],
  catalog: NewTaskCatalog | null
): { ref: ModelRef | null; source: NewTaskDefaultSource } {
  if (catalog === null) return { ref: null, source: 'none' }
  if (preferenceModel !== null) {
    const ref = findCatalogModel(catalog.providers, preferenceModel.providerId, preferenceModel.modelId)
    if (ref !== null) return { ref, source: 'preference' }
  }
  if (catalog.piFallback !== null) return { ref: catalog.piFallback, source: 'pi-fallback' }
  return { ref: null, source: 'none' }
}

/** Look a model up in the cascade shape (provider + model id → full ref). */
export function findCatalogModel(
  providers: readonly NewTaskProviderGroup[],
  providerId: string,
  modelId: string
): NewTaskCatalogModel | null {
  for (const provider of providers) {
    if (provider.providerId !== providerId) continue
    const model = provider.models.find((candidate) => candidate.modelId === modelId)
    if (model) return model
  }
  return null
}

/** A model/thinking/access choice made in the new-task empty state (ticket
 * 41; ticket 80 added the access tier). Null fields mean the chip was left
 * untouched — the preference defaults (already riding `create_session` since
 * ticket 11) stay in charge; access has no preference link, so null falls
 * back to the gate's own DEFAULT_ACCESS_MODE. */
export interface NewTaskModelChoice {
  model: { providerId: string; modelId: string } | null
  thinkingLevel: ThinkingLevel | null
  accessMode: AccessMode | null
}

/**
 * Merge the empty-state choice over the preference defaults for
 * `create_session` (same additive `defaults` field, ticket-11 channel —
 * zero new contract). The choice wins where present; untouched fields keep
 * the preference; no defaults at all → null (Pi applies its own untouched).
 */
export function mergeNewTaskDefaults(
  base: SessionDefaults | null,
  choice: NewTaskModelChoice | null
): SessionDefaults | null {
  if (base === null && choice === null) return null
  const merged: SessionDefaults = { ...(base ?? {}) }
  if (choice?.model !== null && choice?.model !== undefined) {
    merged.providerId = choice.model.providerId
    merged.modelId = choice.model.modelId
  }
  if (choice?.thinkingLevel !== null && choice?.thinkingLevel !== undefined) {
    merged.thinkingLevel = choice.thinkingLevel
  }
  // Ticket 80: the access tier rides the same additive defaults field —
  // absent stays absent (legacy payload shape; the gate applies its own
  // fallback).
  if (choice?.accessMode !== null && choice?.accessMode !== undefined) {
    merged.accessMode = choice.accessMode
  }
  return Object.keys(merged).length === 0 ? null : merged
}
