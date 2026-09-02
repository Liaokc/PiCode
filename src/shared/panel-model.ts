/**
 * Panel tab framework model (tickets 06/31): which tabs are open, which is
 * active, whether the "Open a Tab" picker is showing, the panel's dragged
 * width, and the recently closed history. Pure reducer — the SidePanel
 * container and its drag handle only dispatch; every timestamp enters
 * through an action so the model stays deterministic.
 *
 * Ticket 31 turns the two-slot string union into a structured identity:
 * every deep-linked file gets its own tab, the call-trace slot is reserved
 * (consumption is ticket 36), and closing a file/trace tab remembers it in
 * the recently closed stack (persisted preference, capacity 10).
 */

import { SIDE_PANEL_WIDTH_PX } from './layout-model'

export const PANEL_MIN_WIDTH_PX = 280
/** Generous ceiling so the panel can be dragged freely wide (ticket 07 feedback). */
export const PANEL_MAX_WIDTH_PX = 1200
/** Default width keeps the screenshot-03 composition. */
export const PANEL_DEFAULT_WIDTH_PX = SIDE_PANEL_WIDTH_PX

/**
 * Side panel tab identity (ticket 31): the fixed Review tab, one tab per
 * deep-linked file (cwd anchors relative navigation), and one per session
 * call trace. Equality is structural — same kind and coordinates = same tab.
 */
export type PanelTabId =
  | { kind: 'review' }
  | { kind: 'file'; cwd: string; path: string }
  | { kind: 'trace'; sessionFile: string }

/** One entry of the recently closed history: what was closed, and when. */
export interface RecentlyClosedTab {
  tab: PanelTabId
  /** Close time (epoch ms) — feeds the dropdown's relative time column. */
  closedAt: number
}

/** Persisted capacity of the recently closed history (spec: 偏好持久化容量 10). */
export const RECENTLY_CLOSED_CAPACITY = 10

export interface PanelState {
  openTabs: PanelTabId[]
  activeTab: PanelTabId | null
  /** The "Open a Tab" picker shown over an already-open tab strip. */
  pickerOpen: boolean
  width: number
  /** Closed file/trace tabs, newest first — the dropdown's second section. */
  recentlyClosed: RecentlyClosedTab[]
}

export type PanelAction =
  | { type: 'open-tab'; tab: PanelTabId }
  | { type: 'close-tab'; tab: PanelTabId; at: number }
  | { type: 'activate-tab'; tab: PanelTabId }
  | { type: 'show-picker' }
  | { type: 'hydrate-recently-closed'; entries: RecentlyClosedTab[] }
  | { type: 'set-width'; width: number }
  | { type: 'reset-width' }

export function initialPanelState(): PanelState {
  return { openTabs: [], activeTab: null, pickerOpen: false, width: PANEL_DEFAULT_WIDTH_PX, recentlyClosed: [] }
}

/** Structural tab equality — the reducer's only notion of "same tab". */
export function samePanelTab(a: PanelTabId, b: PanelTabId): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'file' && b.kind === 'file') return a.cwd === b.cwd && a.path === b.path
  if (a.kind === 'trace' && b.kind === 'trace') return a.sessionFile === b.sessionFile
  return true
}

/** Stable, injective key for React lists and DOM markers. */
export function panelTabKey(tab: PanelTabId): string {
  switch (tab.kind) {
    case 'review':
      return 'review'
    case 'file':
      return JSON.stringify(['file', tab.cwd, tab.path])
    case 'trace':
      return JSON.stringify(['trace', tab.sessionFile])
  }
}

/** Display name: the path leaf for file/trace tabs, the fixed Review label. */
export function panelTabLabel(tab: PanelTabId): string {
  switch (tab.kind) {
    case 'review':
      return 'Review'
    case 'file':
      return leafOf(tab.path)
    case 'trace':
      return leafOf(tab.sessionFile)
  }
}

function leafOf(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

/** True for the identities the recently closed history remembers (ticket 31:
 * the Review tab is not tracked — the picker card reopens it). */
function isTrackable(tab: PanelTabId): boolean {
  return tab.kind !== 'review'
}

/**
 * Defensive read of the persisted history (ticket 31): file/trace entries
 * only, finite close times, duplicate identities keep the newest close,
 * newest first, capped at the persisted capacity.
 */
export function normalizeRecentlyClosed(value: unknown): RecentlyClosedTab[] {
  if (!Array.isArray(value)) return []
  const byNewest = [...value].sort((a, b) => closedAtOf(b) - closedAtOf(a))
  const seen = new Set<string>()
  const entries: RecentlyClosedTab[] = []
  for (const raw of byNewest) {
    const entry = normalizeEntry(raw)
    if (entry === null) continue
    const key = panelTabKey(entry.tab)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
    if (entries.length === RECENTLY_CLOSED_CAPACITY) break
  }
  return entries
}

function closedAtOf(entry: unknown): number {
  return typeof entry === 'object' && entry !== null && typeof (entry as RecentlyClosedTab).closedAt === 'number'
    ? (entry as RecentlyClosedTab).closedAt
    : -1
}

function normalizeEntry(raw: unknown): RecentlyClosedTab | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { tab, closedAt } = raw as Partial<RecentlyClosedTab>
  if (typeof closedAt !== 'number' || !Number.isFinite(closedAt)) return null
  if (typeof tab !== 'object' || tab === null) return null
  if (tab.kind === 'review') return null
  if (tab.kind === 'file') {
    if (typeof tab.cwd !== 'string' || typeof tab.path !== 'string') return null
    return { tab: { kind: 'file', cwd: tab.cwd, path: tab.path }, closedAt }
  }
  if (tab.kind === 'trace') {
    if (typeof tab.sessionFile !== 'string') return null
    return { tab: { kind: 'trace', sessionFile: tab.sessionFile }, closedAt }
  }
  return null
}

/** Push one closed tab onto the history: duplicate identities re-date, the
 * oldest entry beyond the capacity is dropped. Pure. */
function pushRecentlyClosed(stack: RecentlyClosedTab[], entry: RecentlyClosedTab): RecentlyClosedTab[] {
  const next = [{ tab: entry.tab, closedAt: entry.closedAt }, ...stack.filter((e) => !samePanelTab(e.tab, entry.tab))]
  return next.slice(0, RECENTLY_CLOSED_CAPACITY)
}

/** Shared with the drag path (ticket 30): the rAF write and the reducer
 * commit must clamp identically or the panel jumps on commit. */
export function clampPanelWidth(width: number): number {
  if (Number.isNaN(width)) return PANEL_DEFAULT_WIDTH_PX
  return Math.min(PANEL_MAX_WIDTH_PX, Math.max(PANEL_MIN_WIDTH_PX, Math.round(width)))
}

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'open-tab': {
      const alreadyOpen = state.openTabs.some((tab) => samePanelTab(tab, action.tab))
      const recentlyClosed = state.recentlyClosed.filter((entry) => !samePanelTab(entry.tab, action.tab))
      const alreadyActive = state.activeTab !== null && samePanelTab(state.activeTab, action.tab)
      if (alreadyOpen && alreadyActive && !state.pickerOpen && recentlyClosed.length === state.recentlyClosed.length) {
        return state
      }
      const openTabs = alreadyOpen ? state.openTabs : [...state.openTabs, action.tab]
      return { ...state, openTabs, activeTab: action.tab, pickerOpen: false, recentlyClosed }
    }
    case 'close-tab': {
      if (!state.openTabs.some((tab) => samePanelTab(tab, action.tab))) return state
      const openTabs = state.openTabs.filter((tab) => !samePanelTab(tab, action.tab))
      let activeTab = state.activeTab
      if (state.activeTab !== null && samePanelTab(state.activeTab, action.tab)) {
        const index = state.openTabs.findIndex((tab) => samePanelTab(tab, action.tab))
        activeTab = openTabs[index] ?? openTabs[index - 1] ?? null
      }
      const recentlyClosed = isTrackable(action.tab)
        ? pushRecentlyClosed(state.recentlyClosed, { tab: action.tab, closedAt: action.at })
        : state.recentlyClosed
      return { ...state, openTabs, activeTab, pickerOpen: openTabs.length === 0 ? false : state.pickerOpen, recentlyClosed }
    }
    case 'activate-tab':
      return state.activeTab !== null && samePanelTab(state.activeTab, action.tab) && !state.pickerOpen
        ? state
        : { ...state, activeTab: action.tab, pickerOpen: false }
    case 'show-picker':
      return state.pickerOpen ? state : { ...state, pickerOpen: true }
    case 'hydrate-recently-closed': {
      const entries = normalizeRecentlyClosed(action.entries)
      const unchanged =
        entries.length === state.recentlyClosed.length &&
        entries.every((entry, i) => {
          const current = state.recentlyClosed[i]
          return current !== undefined && current.closedAt === entry.closedAt && samePanelTab(current.tab, entry.tab)
        })
      return unchanged ? state : { ...state, recentlyClosed: entries }
    }
    case 'set-width':
      return clampPanelWidth(action.width) === state.width ? state : { ...state, width: clampPanelWidth(action.width) }
    case 'reset-width':
      return state.width === PANEL_DEFAULT_WIDTH_PX ? state : { ...state, width: PANEL_DEFAULT_WIDTH_PX }
    default:
      return state
  }
}

// ---- tab management dropdown (ticket 31) --------------------------------

/** One row of the tab management dropdown. `closedAt === null` marks an
 * open tab; the recently closed rows carry their close time. */
export interface TabMenuEntry {
  tab: PanelTabId
  closedAt: number | null
}

export interface TabMenuModel {
  /** The "Open Tabs" section, in strip order. */
  open: TabMenuEntry[]
  /** The "Recently Closed Tabs" section, newest first. */
  recent: TabMenuEntry[]
  /** Flat ↑↓ navigation order: open first, then recent. */
  matches: TabMenuEntry[]
}

/**
 * Derive the dropdown's rows: everything, or — when a query is typed — only
 * the entries whose label matches (case-insensitive, trimmed whitespace).
 */
export function buildTabMenu(
  openTabs: readonly PanelTabId[],
  recentlyClosed: readonly RecentlyClosedTab[],
  query: string
): TabMenuModel {
  const open = openTabs.map((tab) => ({ tab, closedAt: null }))
  const recent = recentlyClosed.map((entry) => ({ tab: entry.tab, closedAt: entry.closedAt }))
  const needle = query.trim().toLowerCase()
  if (needle === '') return { open, recent, matches: [...open, ...recent] }
  const hits = (entry: TabMenuEntry): boolean => panelTabLabel(entry.tab).toLowerCase().includes(needle)
  const filteredOpen = open.filter(hits)
  const filteredRecent = recent.filter(hits)
  return { open: filteredOpen, recent: filteredRecent, matches: [...filteredOpen, ...filteredRecent] }
}
