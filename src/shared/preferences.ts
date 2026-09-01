/**
 * PiCode application preferences (ticket 11): user-owned defaults that shape
 * NEW sessions — default model, default thinking level, and the new-task
 * default project. Persisted by the main process in PiCode's own storage
 * (never Pi's settings.json); the host applies them at session creation via
 * the `create_session` contract's additive `defaults` field.
 *
 * Pure normalize/merge functions so the persistence layer stays thin and the
 * behavior is testable without Electron.
 */
import type { ThinkingLevel } from './contract.ts'

/** Model/thinking defaults handed to a NEW session (all fields optional). */
export interface SessionDefaults {
  providerId?: string
  modelId?: string
  thinkingLevel?: ThinkingLevel
}

/**
 * "New task default project" modes (ticket 17): the project chip follows the
 * recent-activity chain, or a fixed pinned project. The retired 'ask' value
 * (open the system picker for every new task — superseded by the chip)
 * normalizes to 'last-used' when read back from older documents.
 */
export type NewTaskDefaultMode = 'last-used' | 'fixed'

export interface AppPreferences {
  /** Default model for NEW sessions; null = Pi picks its own default. */
  defaultModel: { providerId: string; modelId: string } | null
  /** Default thinking level for NEW sessions; null = Pi default (clamped per model). */
  defaultThinkingLevel: ThinkingLevel | null
  /** Where the new-task chip defaults: follow recent activity or a fixed project. */
  newTaskDirectory: NewTaskDefaultMode
  /** The pinned project for 'fixed' mode; null = not chosen (chain applies). */
  newTaskFixedProject: string | null
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultModel: null,
  defaultThinkingLevel: null,
  newTaskDirectory: 'last-used',
  newTaskFixedProject: null
}

const THINKING_LEVELS: ReadonlySet<string> = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
])

function normalizedModel(value: unknown): AppPreferences['defaultModel'] {
  if (value === null) return null
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record['providerId'] !== 'string' || typeof record['modelId'] !== 'string') return null
  return { providerId: record['providerId'], modelId: record['modelId'] }
}

function normalizedThinkingLevel(value: unknown): ThinkingLevel | null {
  if (value === null) return null
  return typeof value === 'string' && THINKING_LEVELS.has(value) ? (value as ThinkingLevel) : null
}

function normalizedDirectoryMode(value: unknown): NewTaskDefaultMode {
  return value === 'fixed' ? 'fixed' : 'last-used'
}

function normalizedFixedProject(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizedModelOr(prev: AppPreferences['defaultModel'], value: unknown): AppPreferences['defaultModel'] {
  if (value === undefined) return prev
  const normalized = normalizedModel(value)
  return value === null || normalized !== null ? normalized : prev
}

function normalizedThinkingOr(prev: ThinkingLevel | null, value: unknown): ThinkingLevel | null {
  if (value === undefined) return prev
  const normalized = normalizedThinkingLevel(value)
  return value === null || normalized !== null ? normalized : prev
}

function normalizedDirectoryOr(prev: NewTaskDefaultMode, value: unknown): NewTaskDefaultMode {
  return value === 'fixed' || value === 'last-used' ? value : prev
}

function normalizedFixedProjectOr(prev: string | null, value: unknown): string | null {
  if (value === undefined) return prev
  const normalized = normalizedFixedProject(value)
  return value === null || normalized !== null ? normalized : prev
}

/** Defensive read of a preferences JSON document — invalid fields fall back. */
export function normalizePreferences(raw: unknown): AppPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_PREFERENCES }
  const record = raw as Record<string, unknown>
  return {
    defaultModel: normalizedModel(record['defaultModel']),
    defaultThinkingLevel: normalizedThinkingLevel(record['defaultThinkingLevel']),
    newTaskDirectory: normalizedDirectoryMode(record['newTaskDirectory']),
    newTaskFixedProject: normalizedFixedProject(record['newTaskFixedProject'])
  }
}

/** Apply a (possibly untrusted) partial patch on top of current preferences.
 * Invalid patch values keep the previous field value; null clears. */
export function mergePreferences(prev: AppPreferences, patch: unknown): AppPreferences {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return prev
  const record = patch as Record<string, unknown>
  return {
    defaultModel: normalizedModelOr(prev.defaultModel, record['defaultModel']),
    defaultThinkingLevel: normalizedThinkingOr(prev.defaultThinkingLevel, record['defaultThinkingLevel']),
    newTaskDirectory: normalizedDirectoryOr(prev.newTaskDirectory, record['newTaskDirectory']),
    newTaskFixedProject: normalizedFixedProjectOr(prev.newTaskFixedProject, record['newTaskFixedProject'])
  }
}

/**
 * The `create_session` defaults derived from preferences, or null when the
 * user configured nothing (Pi then applies its own defaults untouched).
 */
export function sessionDefaultsFromPreferences(prefs: AppPreferences): SessionDefaults | null {
  const defaults: SessionDefaults = {}
  if (prefs.defaultModel !== null) {
    defaults.providerId = prefs.defaultModel.providerId
    defaults.modelId = prefs.defaultModel.modelId
  }
  if (prefs.defaultThinkingLevel !== null) defaults.thinkingLevel = prefs.defaultThinkingLevel
  return Object.keys(defaults).length === 0 ? null : defaults
}
