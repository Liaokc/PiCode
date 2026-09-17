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
import type { AccessMode, ThinkingLevel } from './contract.ts'
import { normalizeRecentlyClosed, type RecentlyClosedTab } from './panel-model.ts'
import type { ReadStates } from './sessions/unread.ts'
import {
  EMPTY_MANUAL_ORDER,
  type ManualSidebarOrder,
  type SessionSort,
  type SessionView
} from './sessions/group.ts'
import { SIDEBAR_WIDTH_PX, clampSidebarWidth } from './layout-model.ts'
import { PANEL_DEFAULT_WIDTH_PX, clampPanelWidth } from './panel-model.ts'

/** Model/thinking defaults handed to a NEW session (all fields optional). */
export interface SessionDefaults {
  providerId?: string
  modelId?: string
  thinkingLevel?: ThinkingLevel
  /** Ticket 80 (additive): the access tier picked in the new-task empty
   * state — the created session's approval gate starts there. Absent = no
   * pick (the gate falls back to its own DEFAULT_ACCESS_MODE); old payloads
   * without the field keep validating unchanged. */
  accessMode?: AccessMode
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
  /** Session ids archived from the sidebar lists (ticket 35). The same
   * class of local decluttering preference as hiddenGroups: session files
   * are never touched, archived tasks stay reachable via ⌘K search, and
   * the trash button's archive view lists them for one-click restore.
   * Archiving a pinned task also unpins it (pinned and archived never
   * conflict). */
  archivedSessions: string[]
  /** Per-session read states (ticket 28): mtime watermarks + manual unread
   * overrides. Purely local — session files are never touched. Patches
   * upsert per session (see mergePreferences) so racing writers never lose
   * each other's entries. */
  readStates: ReadStates
  /** Recently closed side panel tabs (ticket 31): closed file/trace tab
   * identities with their close times, newest first. The tab-management
   * dropdown lists them for one-click reopening; capacity 10. */
  recentlyClosedTabs: RecentlyClosedTab[]
  /** Sidebar filter dropdown (ticket 33): which view the task list uses —
   * per-project groups or the flat timeline. Persisted so the choice
   * survives restarts; defaults to ZCode's pre-checked By project. */
  sidebarView: SessionView
  /** Sidebar filter dropdown (ticket 33): the task-list sort key — file
   * mtime (Updated), birthtime (Created), or the user's drag arrangement
   * (Manual, ticket 84). Defaults to Updated. */
  sidebarSort: SessionSort
  /** The user's sidebar drag arrangement (ticket 84): project-group order
   * plus one session order per group. Persisted so the arrangement survives
   * restarts; only active while sidebarSort is 'manual' — switching back to
   * Updated/Created keeps it stored (sessions files are never touched). */
  sidebarManualOrder: ManualSidebarOrder
  /** Workspace sidebar width in px (ticket 29): clamped 240–520, default
   * 320. Both draggable panes persist through preferences so a restart
   * restores the layout exactly as left. */
  sidebarWidth: number
  /** Side panel width in px (ticket 29): clamped per clampPanelWidth,
   * default 420 — the same persistence contract as sidebarWidth so both
   * draggable panes behave alike. */
  panelWidth: number
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultModel: null,
  defaultThinkingLevel: null,
  newTaskDirectory: 'last-used',
  newTaskFixedProject: null,
  hiddenGroups: [],
  archivedSessions: [],
  readStates: {},
  recentlyClosedTabs: [],
  sidebarView: 'projects',
  sidebarSort: 'updated',
  sidebarManualOrder: EMPTY_MANUAL_ORDER,
  sidebarWidth: SIDEBAR_WIDTH_PX,
  panelWidth: PANEL_DEFAULT_WIDTH_PX
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

/** Archived-session ids (ticket 35): same shape rules as hiddenGroups —
 * strings only, trimmed, blank-free, deduped in order. */
function normalizedArchivedSessions(value: unknown): string[] {
  return normalizedHiddenGroups(value)
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

function normalizedArchivedSessionsOr(prev: string[], value: unknown): string[] {
  if (value === undefined) return prev
  return Array.isArray(value) ? normalizedArchivedSessions(value) : prev
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

/** Recently closed tabs are written whole by the panel (the single writer):
 * a valid array replaces, anything else keeps the previous history. The
 * tab framework's normalizer does the defensive work (kinds, caps, dedupe). */
function normalizedRecentlyClosedOr(prev: RecentlyClosedTab[], value: unknown): RecentlyClosedTab[] {
  if (value === undefined) return prev
  return Array.isArray(value) ? normalizeRecentlyClosed(value) : prev
}

/** Draggable pane widths (ticket 29): numbers only, clamped into the
 * pane's drag range (sidebar 240–520 per clampSidebarWidth, side panel per
 * clampPanelWidth) so the persisted value can never disagree with what the
 * drag path and the reducers enforce. Widths have no clearing semantics —
 * null/junk falls back to the pane default. */
function normalizedPaneWidth(value: unknown, fallback: number, clamp: (width: number) => number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value) : fallback
}

/** Sidebar filter dropdown choices (ticket 33): closed vocabularies — junk
 * degrades to the ZCode defaults (By project ✓ / Updated ✓). */
function normalizedSidebarView(value: unknown): SessionView {
  return value === 'timeline' ? 'timeline' : 'projects'
}

function normalizedSidebarSort(value: unknown): SessionSort {
  return value === 'created' || value === 'manual' ? value : 'updated'
}

/** The sidebar drag arrangement (ticket 84): a { groups, sessions } record
 * of string lists — blank-free, string-only, deduped in order; junk degrades
 * to the empty order (which renders exactly like the Updated sort). */
function normalizedManualOrder(value: unknown): ManualSidebarOrder {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_MANUAL_ORDER
  const record = value as Record<string, unknown>
  const groups = normalizedHiddenGroups(record['groups'])
  const sessions: Record<string, string[]> = {}
  if (typeof record['sessions'] === 'object' && record['sessions'] !== null && !Array.isArray(record['sessions'])) {
    for (const [cwd, ids] of Object.entries(record['sessions'] as Record<string, unknown>)) {
      const list = normalizedHiddenGroups(ids)
      if (list.length > 0) sessions[cwd] = list
    }
  }
  return { groups, sessions }
}

function normalizedManualOrderOr(prev: ManualSidebarOrder, value: unknown): ManualSidebarOrder {
  if (value === undefined) return prev
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return prev
  return normalizedManualOrder(value)
}

function normalizedSidebarViewOr(prev: SessionView, value: unknown): SessionView {
  if (value === undefined) return prev
  return value === 'projects' || value === 'timeline' ? value : prev
}

function normalizedSidebarSortOr(prev: SessionSort, value: unknown): SessionSort {
  if (value === undefined) return prev
  return value === 'updated' || value === 'created' || value === 'manual' ? value : prev
}

function normalizedPaneWidthOr(prev: number, value: unknown, clamp: (width: number) => number): number {
  if (value === undefined) return prev
  return normalizedPaneWidth(value, prev, clamp)
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
    archivedSessions: normalizedArchivedSessions(record['archivedSessions']),
    readStates: normalizedReadStates(record['readStates']),
    recentlyClosedTabs: normalizeRecentlyClosed(record['recentlyClosedTabs']),
    sidebarView: normalizedSidebarView(record['sidebarView']),
    sidebarSort: normalizedSidebarSort(record['sidebarSort']),
    sidebarManualOrder: normalizedManualOrder(record['sidebarManualOrder']),
    sidebarWidth: normalizedPaneWidth(record['sidebarWidth'], SIDEBAR_WIDTH_PX, clampSidebarWidth),
    panelWidth: normalizedPaneWidth(record['panelWidth'], PANEL_DEFAULT_WIDTH_PX, clampPanelWidth)
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
    archivedSessions: normalizedArchivedSessionsOr(prev.archivedSessions, record['archivedSessions']),
    readStates: normalizedReadStatesOr(prev.readStates, record['readStates']),
    recentlyClosedTabs: normalizedRecentlyClosedOr(prev.recentlyClosedTabs, record['recentlyClosedTabs']),
    sidebarView: normalizedSidebarViewOr(prev.sidebarView, record['sidebarView']),
    sidebarSort: normalizedSidebarSortOr(prev.sidebarSort, record['sidebarSort']),
    sidebarManualOrder: normalizedManualOrderOr(prev.sidebarManualOrder, record['sidebarManualOrder']),
    sidebarWidth: normalizedPaneWidthOr(prev.sidebarWidth, record['sidebarWidth'], clampSidebarWidth),
    panelWidth: normalizedPaneWidthOr(prev.panelWidth, record['panelWidth'], clampPanelWidth)
  }
}

/** Add or remove one hidden-project cwd (ticket 19). The result is deduped
 * and order-stable: hiding moves the cwd to the end, restoring just drops
 * it — the settings recovery list reads the same array back. */
export function toggleHiddenGroup(hidden: readonly string[], cwd: string, hide: boolean): string[] {
  const without = hidden.filter((entry) => entry !== cwd)
  return hide ? [...without, cwd] : without
}

/** Archive or restore one session (ticket 35). Same list discipline as
 * toggleHiddenGroup: archiving appends the id at the end (most recently
 * archived last), restoring just drops it; duplicates never accumulate. */
export function setSessionArchived(archived: readonly string[], sessionId: string, isArchived: boolean): string[] {
  const without = archived.filter((entry) => entry !== sessionId)
  return isArchived ? [...without, sessionId] : without
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
