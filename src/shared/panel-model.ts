/**
 * Panel tab framework model (ticket 06): which tabs are open, which is
 * active, whether the tab picker is showing, and the panel's dragged width.
 * Pure reducer — the SidePanel container and its drag handle only dispatch.
 */

import { SIDE_PANEL_WIDTH_PX, type SidePanelTab } from './layout-model'

export const PANEL_MIN_WIDTH_PX = 280
/** Generous ceiling so the panel can be dragged freely wide (ticket 07 feedback). */
export const PANEL_MAX_WIDTH_PX = 1200
/** Default width keeps the screenshot-03 composition. */
export const PANEL_DEFAULT_WIDTH_PX = SIDE_PANEL_WIDTH_PX

export interface PanelState {
  openTabs: SidePanelTab[]
  activeTab: SidePanelTab | null
  /** The "Open a Tab" picker shown over an already-open tab strip. */
  pickerOpen: boolean
  width: number
}

export type PanelAction =
  | { type: 'open-tab'; tab: SidePanelTab }
  | { type: 'close-tab'; tab: SidePanelTab }
  | { type: 'activate-tab'; tab: SidePanelTab }
  | { type: 'show-picker' }
  | { type: 'set-width'; width: number }
  | { type: 'reset-width' }

export function initialPanelState(): PanelState {
  return { openTabs: [], activeTab: null, pickerOpen: false, width: PANEL_DEFAULT_WIDTH_PX }
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
      const openTabs = state.openTabs.includes(action.tab) ? state.openTabs : [...state.openTabs, action.tab]
      return { ...state, openTabs, activeTab: action.tab, pickerOpen: false }
    }
    case 'close-tab': {
      const index = state.openTabs.indexOf(action.tab)
      if (index === -1) return state
      const openTabs = state.openTabs.filter((tab) => tab !== action.tab)
      let activeTab = state.activeTab
      if (state.activeTab === action.tab) {
        activeTab = openTabs[index] ?? openTabs[index - 1] ?? null
      }
      return { ...state, openTabs, activeTab, pickerOpen: openTabs.length === 0 ? false : state.pickerOpen }
    }
    case 'activate-tab':
      return state.activeTab === action.tab ? state : { ...state, activeTab: action.tab, pickerOpen: false }
    case 'show-picker':
      return state.pickerOpen ? state : { ...state, pickerOpen: true }
    case 'set-width':
      return clampPanelWidth(action.width) === state.width ? state : { ...state, width: clampPanelWidth(action.width) }
    case 'reset-width':
      return state.width === PANEL_DEFAULT_WIDTH_PX ? state : { ...state, width: PANEL_DEFAULT_WIDTH_PX }
    default:
      return state
  }
}
