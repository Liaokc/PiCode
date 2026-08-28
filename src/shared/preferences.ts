/**
 * PiCode application preferences (ticket 11): user-owned defaults that shape
 * NEW sessions — default model, default thinking level, and the new-task
 * working-directory behavior. Persisted by the main process in PiCode's own
 * storage (never Pi's settings.json); the host applies them at session
 * creation via the `create_session` contract's additive `defaults` field.
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

/** Working-directory behavior for new tasks. */
export type NewTaskDirectoryPreference =
  /** Open the folder picker for every new task. */
  | 'ask'
  /** Reuse the most recently used working directory without asking. */
  | 'last-used'

export interface AppPreferences {
  /** Default model for NEW sessions; null = Pi picks its own default. */
  defaultModel: { providerId: string; modelId: string } | null
  /** Default thinking level for NEW sessions; null = Pi default (clamped per model). */
  defaultThinkingLevel: ThinkingLevel | null
  /** Where new tasks start: ask every time or reuse the last folder. */
  newTaskDirectory: NewTaskDirectoryPreference
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultModel: null,
  defaultThinkingLevel: null,
  newTaskDirectory: 'ask'
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

function normalizedDirectoryMode(value: unknown): NewTaskDirectoryPreference {
  return value === 'last-used' ? 'last-used' : 'ask'
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

function normalizedDirectoryOr(prev: NewTaskDirectoryPreference, value: unknown): NewTaskDirectoryPreference {
  return value === 'ask' || value === 'last-used' ? value : prev
}

/** Defensive read of a preferences JSON document — invalid fields fall back. */
export function normalizePreferences(raw: unknown): AppPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_PREFERENCES }
  const record = raw as Record<string, unknown>
  return {
    defaultModel: normalizedModel(record['defaultModel']),
    defaultThinkingLevel: normalizedThinkingLevel(record['defaultThinkingLevel']),
    newTaskDirectory: normalizedDirectoryMode(record['newTaskDirectory'])
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
    newTaskDirectory: normalizedDirectoryOr(prev.newTaskDirectory, record['newTaskDirectory'])
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
