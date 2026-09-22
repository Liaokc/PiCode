/**
 * Bottom dock model (ticket 18, sibling-panel revision): ONE full-width dock
 * frame under the chat with two SIBLING panels — the user shell (⌘J) and
 * the Agent Bridge feed (⌥⌘J since ticket 27). The panels share the same
 * position: pressing the other panel's key swaps the content in place;
 * pressing the same key again closes the dock. Both panels stay mounted
 * while the dock lives, so a live shell survives panel switches and Bridge
 * history survives them too (the feed itself folds at the App level).
 *
 * Lifecycle split:
 *   - `open`   — frame visibility (⌘J/⌥⌘J, titlebar toggles, panel ×).
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
  /** Focus-request sequence (ticket 105): bumped ONLY by actions that leave
   * the terminal as the visible panel — ⌘J/titlebar open, bridge→terminal
   * swap-in, + respawn. The renderer focuses the xterm exactly when this
   * counter moves, so every other path (bridge showing, hide, close, a plain
   * task-switch remount that dispatches nothing) can never steal focus. */
  focusSeq: number
}

export type DockAction =
  /** ⌘J: open showing the terminal / swap from bridge / close if showing. */
  | { type: 'toggle-terminal-panel' }
  /** ⌥⌘J (ticket 27): open showing the bridge / swap from terminal / close
   * if showing. */
  | { type: 'toggle-bridge-panel' }
  /** Deep link (tool card chip): always show the bridge, never toggle off. */
  | { type: 'open-bridge-panel' }
  | { type: 'hide-dock' }
  | { type: 'close-terminal-tab' }
  | { type: 'new-session' }
  /** ⌘N new-task marker (ticket 17×18): folded through dockForNewTask —
   * deliberately a no-op, pinned so the decision stays explicit. */
  | { type: 'dock-for-new-task' }
  | { type: 'set-height'; height: number }
  | { type: 'reset-height' }

/** Launch state: dock hidden, terminal panel preselected, no shell (18f). */
export function initialDockState(): DockState {
  return { open: false, panel: 'terminal', height: DOCK_DEFAULT_HEIGHT_PX, tabOpen: false, gen: 0, focusSeq: 0 }
}

/** Shared with the drag path (ticket 30): the rAF write and the reducer
 * commit must clamp identically or the dock jumps on commit. */
export function clampDockHeight(height: number): number {
  if (Number.isNaN(height)) return DOCK_DEFAULT_HEIGHT_PX
  return Math.min(DOCK_MAX_HEIGHT_PX, Math.max(DOCK_MIN_HEIGHT_PX, Math.round(height)))
}

export function dockReducer(state: DockState, action: DockAction): DockState {
  switch (action.type) {
    case 'toggle-terminal-panel': {
      if (state.open && state.panel === 'terminal') return { ...state, open: false }
      // Showing the terminal implies its tab (first ⌘J spawns the shell) and
      // requests shell focus (ticket 105): ⌘J means "type into the terminal",
      // from every entry — key, titlebar button, bridge swap-in.
      return { ...state, open: true, panel: 'terminal', tabOpen: true, focusSeq: state.focusSeq + 1 }
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
      // Always a fresh shell: repeating + respawns the workspace. Focus rides
      // along (restart()'s userTerm.focus() precedent — spawn-to-type: the
      // keystrokes must land in the new shell, not stay parked on +), but
      // only when the terminal is the visible panel: a bridge-showing + (no
      // UI path reaches it) must not focus a hidden shell.
      return {
        ...state,
        tabOpen: true,
        open: true,
        gen: state.gen + 1,
        focusSeq: state.panel === 'terminal' ? state.focusSeq + 1 : state.focusSeq
      }
    case 'dock-for-new-task':
      return dockForNewTask(state)
    case 'set-height':
      return clampDockHeight(action.height) === state.height ? state : { ...state, height: clampDockHeight(action.height) }
    case 'reset-height':
      return state.height === DOCK_DEFAULT_HEIGHT_PX ? state : { ...state, height: DOCK_DEFAULT_HEIGHT_PX }
    default:
      return state
  }
}

// ---- ⌘N × dock combination (ticket 17 × 18 integration decision) ----

/**
 * What happens to the bottom dock when the new-task empty state opens
 * (⌘N / New Task, ticket 17)? DECIDED: nothing. The new-task state replaces
 * the MAIN ZONE only; the dock is a SHELL-LEVEL zone anchored to the
 * focused session, so it is left exactly as the user arranged it — open
 * stays open (still watching the focused session's shell/feed), closed
 * stays closed, no panel switch. When the new task is announced
 * (session_created) the dock re-anchors through the workspace remount
 * (cwd-keyed) and the feed keeps its global history.
 *
 * Kept as a named pure function + table tests so the decision is pinned:
 * if a future ticket wants ⌘N to collapse the dock, it changes HERE and
 * the tests force the choice to be made explicitly.
 */
export function dockForNewTask(state: DockState): DockState {
  return state
}

// ---- terminal focus-request serving (ticket 132) ----

/**
 * The serve decision for the terminal dock's focus-request state machine
 * (ticket 132, the recurrence of the ticket-105 regression). A ⌘J-family
 * bump ARMS a request; the request must reach the shell WHICHEVER way the
 * mounting races fall:
 *
 *   - the bump can arrive while NO shell exists yet (boot empty state, a
 *     create still in flight with no tab) — the request HOLDS until a
 *     workspace registers, instead of being consumed as a no-op (the
 *     regression: focus landed on <body> with the dock wide open);
 *   - the shell that served the request can be REPLACED moments later (a
 *     create announcement remounts the workspace on a new cwd) — the
 *     replacement RESTORES the caret the request just placed, unless a
 *     live caret owner took it in between (a task-switch click reclaims
 *     the composer first, so unrelated remounts never steal — the
 *     ticket-105 rule survives).
 *
 * The visible-panel cancel (close / bridge swap) lives in the renderer
 * glue: an armed request never fires into a hidden shell.
 */
export interface TerminalFocusServeState {
  /** A dock action bumped focusSeq and the request is unresolved. */
  armed: boolean
  /** A shell workspace is mounted and can receive focus right now. */
  receiver: boolean
  /** The workspace that just unmounted held input focus (a replacement
   * should take the caret back). */
  heldByReplaced: boolean
  /** The current activeElement is a live caret owner (composer/input). */
  activeIsEditable: boolean
}

export type TerminalFocusServeDecision = 'serve' | 'hold' | 'stand-down'

export function terminalFocusServeDecision(state: TerminalFocusServeState): TerminalFocusServeDecision {
  if (state.armed) return state.receiver ? 'serve' : 'hold'
  if (state.heldByReplaced && state.receiver && !state.activeIsEditable) return 'serve'
  return 'stand-down'
}
