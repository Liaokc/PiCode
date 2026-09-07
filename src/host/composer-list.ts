/**
 * Pure builders for the composer's `/` menu and the provider→model cascade
 * (ticket 05). The host feeds these from the real Pi SDK (resource loader
 * prompts/skills + ModelRuntime availability); this module stays SDK-free so
 * the shapes stay testable.
 */

import type { ModelRef, ProviderModels, SlashCommandItem } from '../shared/contract'

/**
 * Built-in slash commands PiCode actually executes. The full Pi list lives in
 * the SDK's BUILTIN_SLASH_COMMANDS; anything not mapped here stays TUI-only
 * and is not offered in the menu.
 *
 * Ticket 38 retires the six built-ins PiCode supersedes with dedicated UI
 * (`/new` `/tree` `/name` `/copy` `/model` `/thinking` — menu duplication);
 * typing them by hand is gated by shared/composer/slash-gate with a pointer
 * toast. `/compact` stays: manual context compaction has no other entry.
 */
export const EXECUTABLE_BUILTIN_NAMES: ReadonlySet<string> = new Set([
  'compact' // manual context compaction (host)
])

interface BuiltinLike {
  name: string
  description: string
  argumentHint?: string
}

interface TemplateLike {
  name: string
  description: string
  argumentHint?: string
}

interface SkillLike {
  name: string
  description: string
}

/** `/` menu rows: PiCode built-ins, then Pi prompt templates, then skills. */
export function buildSlashCommands(
  prompts: readonly TemplateLike[],
  skills: readonly SkillLike[],
  sdkBuiltins: readonly BuiltinLike[]
): SlashCommandItem[] {
  const builtinRows: SlashCommandItem[] = sdkBuiltins
    .filter((b) => EXECUTABLE_BUILTIN_NAMES.has(b.name))
    .map((b) => ({ name: b.name, description: b.description, argumentHint: b.argumentHint, source: 'builtin' }))
  const promptRows: SlashCommandItem[] = prompts.map((p) => ({
    name: p.name,
    description: p.description,
    argumentHint: p.argumentHint,
    source: 'prompt'
  }))
  const skillRows: SlashCommandItem[] = skills.map((s) => ({
    name: s.name,
    description: s.description,
    source: 'skill'
  }))
  return [...builtinRows, ...promptRows, ...skillRows]
}

/** Minimal projection of a Pi Model for the menu (JSON-serializable). */
export interface SdkModelLike {
  provider: string
  id: string
  name: string
}

export function toModelRef(model: SdkModelLike): ModelRef {
  return { providerId: model.provider, modelId: model.id, name: model.name }
}

/** Group available models by provider, first-seen provider order kept. */
export function groupModelsByProvider(
  models: readonly SdkModelLike[],
  displayName: (providerId: string) => string | undefined
): ProviderModels[] {
  const groups = new Map<string, ProviderModels>()
  for (const model of models) {
    let group = groups.get(model.provider)
    if (!group) {
      group = {
        providerId: model.provider,
        name: displayName(model.provider) ?? model.provider,
        models: []
      }
      groups.set(model.provider, group)
    }
    group.models.push(toModelRef(model))
  }
  return [...groups.values()]
}

/**
 * The built-in rows PiCode offers, with PiCode-accurate descriptions (each
 * maps onto a PiCode control, not a TUI dialog). Mirrors
 * EXECUTABLE_BUILTIN_NAMES — the ticket-38 retirement applies to both.
 */
export const PICODE_BUILTIN_COMMANDS: ReadonlyArray<BuiltinLike> = [
  { name: 'compact', description: 'Compact the session context' }
]
