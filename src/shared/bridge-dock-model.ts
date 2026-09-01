/**
 * Bridge dock model (ticket 18 feedback): the Agent Bridge projection lives
 * in its OWN bottom dock — independent of the terminal dock (which keeps
 * ⌘J and hugs the window bottom edge). Opened by ⌘B or the titlebar toggle.
 *
 * Pure visibility + dragged height. The feed state folds at the App level
 * from the same Seam-1 stream the chat uses, so hiding the dock — or
 * visiting the settings shell — never loses projection history.
 */

export const BRIDGE_DOCK_MIN_HEIGHT_PX = 100
/** Generous ceiling; the window height bounds it in practice. */
export const BRIDGE_DOCK_MAX_HEIGHT_PX = 600
export const BRIDGE_DOCK_DEFAULT_HEIGHT_PX = 240

export interface BridgeDockState {
  open: boolean
  height: number
}

export type BridgeDockAction =
  | { type: 'toggle-bridge-dock' }
  | { type: 'open-bridge-dock' }
  | { type: 'hide-bridge-dock' }
  | { type: 'set-bridge-height'; height: number }
  | { type: 'reset-bridge-height' }

/** Launch state: hidden at the default height. */
export function initialBridgeDockState(): BridgeDockState {
  return { open: false, height: BRIDGE_DOCK_DEFAULT_HEIGHT_PX }
}

function clampHeight(height: number): number {
  if (Number.isNaN(height)) return BRIDGE_DOCK_DEFAULT_HEIGHT_PX
  return Math.min(BRIDGE_DOCK_MAX_HEIGHT_PX, Math.max(BRIDGE_DOCK_MIN_HEIGHT_PX, Math.round(height)))
}

export function bridgeDockReducer(state: BridgeDockState, action: BridgeDockAction): BridgeDockState {
  switch (action.type) {
    case 'toggle-bridge-dock':
      return state.open ? { ...state, open: false } : { ...state, open: true }
    case 'open-bridge-dock':
      return state.open ? state : { ...state, open: true }
    case 'hide-bridge-dock':
      return state.open ? { ...state, open: false } : state
    case 'set-bridge-height':
      return clampHeight(action.height) === state.height ? state : { ...state, height: clampHeight(action.height) }
    case 'reset-bridge-height':
      return state.height === BRIDGE_DOCK_DEFAULT_HEIGHT_PX ? state : { ...state, height: BRIDGE_DOCK_DEFAULT_HEIGHT_PX }
    default:
      return state
  }
}
