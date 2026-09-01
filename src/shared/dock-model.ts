/**
 * Bottom terminal dock model (ticket 18): VS Code-style panel under the chat
 * zone — full width of the workspace column, draggable height, opened by ⌘J
 * or the titlebar toggle. Two independent concerns:
 *
 *   - `visible` — panel visibility only. Hiding (⌘J again, or the panel
 *     close button) keeps the terminal tab mounted, so a live shell and its
 *     Bridge projection survive a hide/show cycle.
 *   - `tabOpen` — whether a terminal tab exists at all. Launch starts
 *     collapsed with no tab (ticket 18f); closing the tab kills the shell
 *     (same semantics as the old side-panel tab close).
 *
 * `gen` counts workspace remounts: "new session" (the header + button)
 * bumps it so the renderer replaces the workspace with a fresh shell while
 * the dock stays open. Pure reducer — TerminalDock only dispatches.
 */

export const DOCK_MIN_HEIGHT_PX = 120
/** Generous ceiling; the window height bounds it in practice. */
export const DOCK_MAX_HEIGHT_PX = 800
/** Default height leaves the transcript dominant, ZCode ⌘J proportions. */
export const DOCK_DEFAULT_HEIGHT_PX = 320

export interface DockState {
  /** A terminal tab exists in the dock (a shell may be live behind it). */
  tabOpen: boolean
  /** Panel visibility; hiding never kills the shell. */
  visible: boolean
  /** Panel height in px (workspace column is width-full; only height drags). */
  height: number
  /** Bumped on "new session" — remounts the workspace with a fresh shell. */
  gen: number
}

export type DockAction =
  | { type: 'toggle-dock' }
  | { type: 'hide-dock' }
  | { type: 'close-tab' }
  | { type: 'new-session' }
  | { type: 'set-height'; height: number }
  | { type: 'reset-height' }

/** Launch state: dock collapsed, no terminal (ticket 18f). */
export function initialDockState(): DockState {
  return { tabOpen: false, visible: false, height: DOCK_DEFAULT_HEIGHT_PX, gen: 0 }
}

function clampHeight(height: number): number {
  if (Number.isNaN(height)) return DOCK_DEFAULT_HEIGHT_PX
  return Math.min(DOCK_MAX_HEIGHT_PX, Math.max(DOCK_MIN_HEIGHT_PX, Math.round(height)))
}

export function dockReducer(state: DockState, action: DockAction): DockState {
  switch (action.type) {
    case 'toggle-dock': {
      const visible = !state.visible
      // Opening the panel with no tab spawns the terminal tab (first ⌘J).
      const tabOpen = state.tabOpen || visible
      return tabOpen === state.tabOpen && visible === state.visible ? state : { ...state, visible, tabOpen }
    }
    case 'hide-dock':
      return state.visible ? { ...state, visible: false } : state
    case 'close-tab':
      return state.tabOpen || state.visible ? { ...state, tabOpen: false, visible: false } : state
    case 'new-session':
      // Always a fresh shell: repeating + respawns the workspace.
      return { ...state, tabOpen: true, visible: true, gen: state.gen + 1 }
    case 'set-height':
      return clampHeight(action.height) === state.height ? state : { ...state, height: clampHeight(action.height) }
    case 'reset-height':
      return state.height === DOCK_DEFAULT_HEIGHT_PX ? state : { ...state, height: DOCK_DEFAULT_HEIGHT_PX }
    default:
      return state
  }
}
