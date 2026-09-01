/**
 * Bottom dock model (ticket 18, sibling-panel revision): ONE full-width dock
 * frame under the chat with two SIBLING panels — the user shell (⌘J) and
 * the Agent Bridge feed (⌘B). The panels share the same position: pressing
 * the other panel's key swaps the content in place; pressing the same key
 * again closes the dock. Both panels stay mounted while the dock lives, so
 * a live shell survives panel switches and Bridge history survives them
 * too (the feed itself folds at the App level).
 *
 * Lifecycle split:
 *   - `open`   — frame visibility (⌘J/⌘B, titlebar toggles, panel ×).
 *   - `panel`  — which sibling fills the frame.
 *   - `tabOpen` — whether a terminal tab exists at all; closing the tab
 *     (chip ×) kills the shell and collapses the dock. Showing the terminal
 *     always implies a tab. Launch starts collapsed with no tab (18f).
 *   - `gen`    — bumped by "new session" (+) to respawn a fresh shell.
 *
 * Pure reducer — the BottomDock frame only dispatches.
 */

export const DOCK_MIN_HEIGHT_PX = 120
/** Generous ceiling; the window height bounds it in practice. */
export const DOCK_MAX_HEIGHT_PX = 800
/** Default height leaves the transcript dominant, ZCode ⌘J proportions. */
export const DOCK_DEFAULT_HEIGHT_PX = 320

export type DockPanel = 'terminal' | 'bridge'

export interface DockState {
  open: boolean
  panel: DockPanel
  /** Panel height in px (one frame, one shared drag height). */
  height: number
  /** A terminal tab exists (a shell may be live behind it). */
  tabOpen: boolean
  /** Bumped on "new session" — remounts the workspace with a fresh shell. */
  gen: number
}

export type DockAction =
  /** ⌘J: open showing the terminal / swap from bridge / close if showing. */
  | { type: 'toggle-terminal-panel' }
  /** ⌘B: open showing the bridge / swap from terminal / close if showing. */
  | { type: 'toggle-bridge-panel' }
  /** Deep link (tool card chip): always show the bridge, never toggle off. */
  | { type: 'open-bridge-panel' }
  | { type: 'hide-dock' }
  | { type: 'close-terminal-tab' }
  | { type: 'new-session' }
  | { type: 'set-height'; height: number }
  | { type: 'reset-height' }

/** Launch state: dock hidden, terminal panel preselected, no shell (18f). */
export function initialDockState(): DockState {
  return { open: false, panel: 'terminal', height: DOCK_DEFAULT_HEIGHT_PX, tabOpen: false, gen: 0 }
}

function clampHeight(height: number): number {
  if (Number.isNaN(height)) return DOCK_DEFAULT_HEIGHT_PX
  return Math.min(DOCK_MAX_HEIGHT_PX, Math.max(DOCK_MIN_HEIGHT_PX, Math.round(height)))
}

export function dockReducer(state: DockState, action: DockAction): DockState {
  switch (action.type) {
    case 'toggle-terminal-panel': {
      if (state.open && state.panel === 'terminal') return { ...state, open: false }
      // Showing the terminal implies its tab (first ⌘J spawns the shell).
      return { ...state, open: true, panel: 'terminal', tabOpen: true }
    }
    case 'toggle-bridge-panel': {
      if (state.open && state.panel === 'bridge') return { ...state, open: false }
      return { ...state, open: true, panel: 'bridge' }
    }
    case 'open-bridge-panel':
      return state.open && state.panel === 'bridge' ? state : { ...state, open: true, panel: 'bridge' }
    case 'hide-dock':
      return state.open ? { ...state, open: false } : state
    case 'close-terminal-tab':
      return state.tabOpen || state.open ? { ...state, tabOpen: false, open: false } : state
    case 'new-session':
      // Always a fresh shell: repeating + respawns the workspace.
      return { ...state, tabOpen: true, open: true, gen: state.gen + 1 }
    case 'set-height':
      return clampHeight(action.height) === state.height ? state : { ...state, height: clampHeight(action.height) }
    case 'reset-height':
      return state.height === DOCK_DEFAULT_HEIGHT_PX ? state : { ...state, height: DOCK_DEFAULT_HEIGHT_PX }
    default:
      return state
  }
}
