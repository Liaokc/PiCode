/**
 * Shell layout model for ticket 01: which chrome zones are visible and the
 * dimensions they render at. Pure data + reducer so the window composition
 * is testable without Electron and reusable by later IPC work.
 */

/** Left navigation rail width (screenshot baseline ~318px). */
export const SIDEBAR_WIDTH_PX = 320

/** Sidebar width drag range (ticket 29): narrow enough to keep the app
 * usable, wide enough for long task titles. */
export const SIDEBAR_MIN_WIDTH_PX = 240
export const SIDEBAR_MAX_WIDTH_PX = 520

/** Main-zone floor (ticket-29 feedback round 2): however wide the panes get,
 * the session view keeps at least this much — enough for a one-line composer
 * placeholder and the compact chip row. Both pane max-widths are
 * `window − other pane − this`, so the panes never steal the last of it. */
export const MAIN_ZONE_MIN_WIDTH_PX = 420

/** Shared with the sidebar drag path (ticket 29): the rAF write and the
 * reducer commit must clamp identically or the sidebar jumps on commit —
 * the same rule clampPanelWidth has enforced for the side panel since
 * ticket 30. */
export function clampSidebarWidth(width: number): number {
  if (Number.isNaN(width)) return SIDEBAR_WIDTH_PX
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(width)))
}

/** Collapsed side panel width for tab views in screenshot 03 composition. */
export const SIDE_PANEL_WIDTH_PX = 420

/** Tabs offered by the side panel's empty picker. Since ticket 18 the
 * terminal lives in the bottom dock (⌘J / titlebar toggle), leaving Review
 * as the only picker card. Browser tabs are out of scope for PiCode 1.0.
 * File and call-trace tabs are NOT in the picker (tickets 07/31): they open
 * via deep-links (transcript cards, Review tree, ⌘K-adjacent surfaces) and
 * then behave like any other tab (activate/close). */
export const PANEL_EMPTY_TABS = ['review'] as const

/** Top-level view: the workspace shell or the settings window shell. */
export type AppView = 'workspace' | 'settings'

export interface ShellUiState {
  sidebarOpen: boolean
  /** Sidebar width in px (ticket 29): dragged at the aside's right edge,
   * clamped by clampSidebarWidth, seeded from preferences at boot and
   * committed back to preferences on pointerup. */
  sidebarWidth: number
  sidePanelOpen: boolean
  view: AppView
}

/** Launch state must match reference screenshot 02: sidebar visible, panel collapsed. */
export function initialShellUiState(): ShellUiState {
  return { sidebarOpen: true, sidebarWidth: SIDEBAR_WIDTH_PX, sidePanelOpen: false, view: 'workspace' }
}

export type ShellUiAction =
  | { type: 'toggle-sidebar' }
  | { type: 'set-sidebar-width'; width: number }
  | { type: 'reset-sidebar-width' }
  | { type: 'toggle-side-panel' }
  | { type: 'open-side-panel' }
  | { type: 'close-side-panel' }
  | { type: 'open-settings' }
  | { type: 'back-to-workspace' }

export function shellUiReducer(state: ShellUiState, action: ShellUiAction): ShellUiState {
  switch (action.type) {
    case 'toggle-sidebar':
      return { ...state, sidebarOpen: !state.sidebarOpen }
    case 'set-sidebar-width': {
      const width = clampSidebarWidth(action.width)
      return state.sidebarWidth === width ? state : { ...state, sidebarWidth: width }
    }
    case 'reset-sidebar-width':
      return state.sidebarWidth === SIDEBAR_WIDTH_PX ? state : { ...state, sidebarWidth: SIDEBAR_WIDTH_PX }
    case 'toggle-side-panel':
      return { ...state, sidePanelOpen: !state.sidePanelOpen }
    case 'open-side-panel':
      return state.sidePanelOpen ? state : { ...state, sidePanelOpen: true }
    case 'close-side-panel':
      return state.sidePanelOpen ? { ...state, sidePanelOpen: false } : state
    case 'open-settings':
      return state.view === 'settings' ? state : { ...state, view: 'settings' }
    case 'back-to-workspace':
      return state.view === 'workspace' ? state : { ...state, view: 'workspace' }
    default:
      return state
  }
}
