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
import type { ReadStates } from './sessions/unread.ts'

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
  /** Project cwds hidden from the sidebar's Projects list (ticket 19). A
   * purely local decluttering preference: session files are never touched,
   * hidden groups' tasks stay reachable via ⌘K search and the Groups
   * all-tasks view, and the settings page lists them for recovery. */
  hiddenGroups: string[]
  /** Per-session read states (ticket 28): mtime watermarks + manual unread
   * overrides. Purely local — session files are never touched. Patches
   * upsert per session (see mergePreferences) so racing writers never lose
   * each other's entries. */
  readStates: ReadStates
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultModel: null,
  defaultThinkingLevel: null,
  newTaskDirectory: 'last-used',
  newTaskFixedProject: null,
  hiddenGroups: [],
  readStates: {}
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

/** Hidden-project cwds: strings only, trimmed, blank-free, deduped in order. */
function normalizedHiddenGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
  }
  return [...seen]
}

/** Per-session read states (ticket 28): records keyed by session id, each
 * with a numeric watermark and a boolean manual-override flag. Invalid
 * entries are dropped whole. */
function normalizedReadStates(value: unknown): ReadStates {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const states: ReadStates = {}
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (id === '' || typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    if (typeof record['watermarkMs'] !== 'number' || !Number.isFinite(record['watermarkMs'])) continue
    if (typeof record['manualUnread'] !== 'boolean') continue
    states[id] = { watermarkMs: record['watermarkMs'], manualUnread: record['manualUnread'] }
  }
  return states
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

function normalizedHiddenGroupsOr(prev: string[], value: unknown): string[] {
  if (value === undefined) return prev
  return Array.isArray(value) ? normalizedHiddenGroups(value) : prev
}

/** readStates patches UPSERT per session over the previous record (the
 * whole-record replace is reserved for normalizePreferences on document
 * read). Racing writers — the read-chaser and a future Mark-as-Unread menu
 * (ticket 35) — each send their own session, and neither loses the other's
 * entry. Invalid entries are dropped, keeping the previous value. */
function normalizedReadStatesOr(prev: ReadStates, value: unknown): ReadStates {
  if (value === undefined) return prev
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return prev
  const merged: ReadStates = { ...prev }
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    const valid = normalizedReadStates({ [id]: entry })
    if (valid[id] !== undefined) merged[id] = valid[id]
  }
  return merged
}

/** Defensive read of a preferences JSON document — invalid fields fall back. */
export function normalizePreferences(raw: unknown): AppPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_PREFERENCES }
  const record = raw as Record<string, unknown>
  return {
    defaultModel: normalizedModel(record['defaultModel']),
    defaultThinkingLevel: normalizedThinkingLevel(record['defaultThinkingLevel']),
    newTaskDirectory: normalizedDirectoryMode(record['newTaskDirectory']),
    newTaskFixedProject: normalizedFixedProject(record['newTaskFixedProject']),
    hiddenGroups: normalizedHiddenGroups(record['hiddenGroups']),
    readStates: normalizedReadStates(record['readStates'])
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
    newTaskFixedProject: normalizedFixedProjectOr(prev.newTaskFixedProject, record['newTaskFixedProject']),
    hiddenGroups: normalizedHiddenGroupsOr(prev.hiddenGroups, record['hiddenGroups']),
    readStates: normalizedReadStatesOr(prev.readStates, record['readStates'])
  }
}

/** Add or remove one hidden-project cwd (ticket 19). The result is deduped
 * and order-stable: hiding moves the cwd to the end, restoring just drops
 * it — the settings recovery list reads the same array back. */
export function toggleHiddenGroup(hidden: readonly string[], cwd: string, hide: boolean): string[] {
  const without = hidden.filter((entry) => entry !== cwd)
  return hide ? [...without, cwd] : without
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
