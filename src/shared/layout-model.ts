/**
 * Shell layout model for ticket 01: which chrome zones are visible and the
 * dimensions they render at. Pure data + reducer so the window composition
 * is testable without Electron and reusable by later IPC work.
 */

/** Left navigation rail width (screenshot baseline ~318px). */
export const SIDEBAR_WIDTH_PX = 320

/** Collapsed side panel width for tab views in screenshot 03 composition. */
export const SIDE_PANEL_WIDTH_PX = 420

/** Tabs offered by the side panel's empty picker. Browser tabs are out of scope for PiCode 1.0.
 * 'preview' is NOT in the picker (ticket 07): the File Preview tab opens via
 * deep-links from transcript file cards and the Review file tree, and then
 * behaves like any other tab (activate/close). */
export const PANEL_EMPTY_TABS = ['review', 'terminal'] as const
export type SidePanelTab = (typeof PANEL_EMPTY_TABS)[number] | 'preview'

/** Top-level view: the workspace shell or the settings window shell. */
export type AppView = 'workspace' | 'settings'

export interface ShellUiState {
  sidebarOpen: boolean
  sidePanelOpen: boolean
  view: AppView
}

/** Launch state must match reference screenshot 02: sidebar visible, panel collapsed. */
export function initialShellUiState(): ShellUiState {
  return { sidebarOpen: true, sidePanelOpen: false, view: 'workspace' }
}

export type ShellUiAction =
  | { type: 'toggle-sidebar' }
  | { type: 'toggle-side-panel' }
  | { type: 'open-side-panel' }
  | { type: 'close-side-panel' }
  | { type: 'open-settings' }
  | { type: 'back-to-workspace' }

export function shellUiReducer(state: ShellUiState, action: ShellUiAction): ShellUiState {
  switch (action.type) {
    case 'toggle-sidebar':
      return { ...state, sidebarOpen: !state.sidebarOpen }
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
