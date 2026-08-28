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
 */
export const EXECUTABLE_BUILTIN_NAMES: ReadonlySet<string> = new Set([
  'model', // opens the cascading model menu
  'thinking', // opens the thinking-level dropdown
  'compact', // manual context compaction (host)
  'new', // start a new Task (session)
  'tree', // open the history/branch panel
  'copy', // copy the last assistant reply
  'name' // rename the active Task
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
 * maps onto a PiCode control, not a TUI dialog).
 */
export const PICODE_BUILTIN_COMMANDS: ReadonlyArray<BuiltinLike> = [
  { name: 'model', description: 'Select model (provider → model menu)' },
  { name: 'thinking', description: 'Set the thinking level' },
  { name: 'compact', description: 'Compact the session context' },
  { name: 'new', description: 'Start a new Task (session)' },
  { name: 'tree', description: 'Browse session history branches' },
  { name: 'copy', description: 'Copy the last assistant reply' },
  { name: 'name', description: 'Rename this Task' }
]
