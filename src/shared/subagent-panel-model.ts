/**
 * Subagent sidebar tab model (ticket 136): the subagents' DEDICATED right
 * sidebar — one FIXED directory tab (the session's subagent runs, including
 * ended ones — always present, never closed) plus one conversation tab per
 * subagent run (the ticket-99 link). The tab semantics are the side panel's
 * exactly (same identity vocabulary, same open/close/activate behavior) —
 * this reducer only guards the sidebar's two invariants:
 *
 *   - the fixed `{ kind: 'subagents' }` tab never closes (the operator's
 *     "closed it and could not find the entry again" is the bug this fixes);
 *   - foreign tab kinds (review/file/trace/turn-diff) never enter — those
 *     belong to the preview side panel, and a stray dispatch must not mount
 *     their bodies here.
 *
 * Width rides the shared pane system (clampPanelWidth, the side panel's
 * range and default) so the two right panes drag and swap identically.
 */

import { panelReducer, PANEL_DEFAULT_WIDTH_PX, type PanelAction, type PanelState, type PanelTabId } from './panel-model'

/** The fixed directory tab — always the strip's first tab, never closed. */
export const SUBAGENT_PANEL_FIXED_TAB: PanelTabId = { kind: 'subagents' }

export function initialSubagentPanelState(): PanelState {
  return {
    openTabs: [SUBAGENT_PANEL_FIXED_TAB],
    activeTab: SUBAGENT_PANEL_FIXED_TAB,
    pickerOpen: false,
    width: PANEL_DEFAULT_WIDTH_PX,
    recentlyClosed: []
  }
}

/** True for the tab identities this sidebar hosts (the fixed directory tab
 * and the per-run conversation tabs). */
function isSubagentTab(tab: PanelTabId): boolean {
  return tab.kind === 'subagents' || tab.kind === 'subagent-chat'
}

export function subagentPanelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'open-tab':
    case 'activate-tab':
      if (!isSubagentTab(action.tab)) return state
      return panelReducer(state, action)
    case 'close-tab':
      // The fixed directory tab is not closable — every other close is the
      // tab framework's plain behavior (neighbor activation included).
      if (!isSubagentTab(action.tab) || action.tab.kind === 'subagents') return state
      return panelReducer(state, action)
    default:
      return panelReducer(state, action)
  }
}
