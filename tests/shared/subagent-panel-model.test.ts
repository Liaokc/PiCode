import { describe, expect, it } from 'vitest'
import {
  initialSubagentPanelState,
  SUBAGENT_PANEL_FIXED_TAB,
  subagentPanelReducer
} from '../../src/shared/subagent-panel-model'
import { PANEL_DEFAULT_WIDTH_PX, clampPanelWidth, type PanelState, type PanelTabId } from '../../src/shared/panel-model'

const chat = (callId: string, title = 'Scout the gateway'): PanelTabId => ({
  kind: 'subagent-chat',
  sessionId: 's1',
  callId,
  title
})

describe('subagent panel model (ticket 136)', () => {
  const initial = (): PanelState => initialSubagentPanelState()

  it('launches with the fixed directory tab open, active, and the default width', () => {
    expect(initialSubagentPanelState()).toEqual({
      openTabs: [SUBAGENT_PANEL_FIXED_TAB],
      activeTab: SUBAGENT_PANEL_FIXED_TAB,
      pickerOpen: false,
      width: PANEL_DEFAULT_WIDTH_PX,
      recentlyClosed: []
    })
  })

  it('the fixed directory tab never closes', () => {
    const start = initial()
    let state = subagentPanelReducer(start, { type: 'close-tab', tab: SUBAGENT_PANEL_FIXED_TAB, at: 1_000 })
    expect(state).toBe(start)
    // Even after a conversation tab closes beside it, the fixed tab survives.
    state = subagentPanelReducer(state, { type: 'open-tab', tab: chat('c1') })
    state = subagentPanelReducer(state, { type: 'close-tab', tab: chat('c1'), at: 2_000 })
    expect(state.openTabs).toEqual([SUBAGENT_PANEL_FIXED_TAB])
    expect(state.activeTab).toEqual(SUBAGENT_PANEL_FIXED_TAB)
  })

  it('conversation tabs open one per run, activate, and close with neighbor activation', () => {
    let state = initial()
    state = subagentPanelReducer(state, { type: 'open-tab', tab: chat('c1') })
    state = subagentPanelReducer(state, { type: 'open-tab', tab: chat('c2') })
    expect(state.openTabs).toEqual([SUBAGENT_PANEL_FIXED_TAB, chat('c1'), chat('c2')])
    expect(state.activeTab).toEqual(chat('c2'))
    // Re-opening an existing identity dedupes and re-activates (the tab
    // keeps its first title — the identity, not the label, is the key).
    state = subagentPanelReducer(state, { type: 'open-tab', tab: chat('c1', 'Retitled') })
    expect(state.openTabs).toHaveLength(3)
    expect(state.activeTab).toEqual(chat('c1', 'Retitled'))
    // Closing the active tab falls to the neighbor (the framework's rule).
    state = subagentPanelReducer(state, { type: 'close-tab', tab: chat('c1', 'Retitled'), at: 3_000 })
    expect(state.activeTab).toEqual(chat('c2'))
    // Closing the last conversation tab falls back to the fixed tab.
    state = subagentPanelReducer(state, { type: 'close-tab', tab: chat('c2'), at: 4_000 })
    expect(state.activeTab).toEqual(SUBAGENT_PANEL_FIXED_TAB)
  })

  it('the preview panel tab kinds never enter this sidebar', () => {
    const foreign: PanelTabId[] = [
      { kind: 'review' },
      { kind: 'file', cwd: '/w', path: 'a.ts' },
      { kind: 'trace', sessionFile: '/w/s.jsonl' },
      { kind: 'turn-diff', turnId: 't1' }
    ]
    for (const tab of foreign) {
      const state = subagentPanelReducer(initial(), { type: 'open-tab', tab })
      expect(state.openTabs).toEqual([SUBAGENT_PANEL_FIXED_TAB])
      expect(state.activeTab).toEqual(SUBAGENT_PANEL_FIXED_TAB)
    }
    // Activate is equally inert on foreign identities.
    const state = subagentPanelReducer(initial(), { type: 'activate-tab', tab: { kind: 'review' } })
    expect(state.activeTab).toEqual(SUBAGENT_PANEL_FIXED_TAB)
  })

  it('closing a conversation tab is not tracked in the recently closed history', () => {
    let state = initialSubagentPanelState()
    state = subagentPanelReducer(state, { type: 'open-tab', tab: chat('c1') })
    state = subagentPanelReducer(state, { type: 'close-tab', tab: chat('c1'), at: 5_000 })
    expect(state.recentlyClosed).toEqual([])
  })

  it('width commits clamp through the shared pane range (the side panel system)', () => {
    let state: PanelState = initialSubagentPanelState()
    state = subagentPanelReducer(state, { type: 'set-width', width: 10_000 })
    expect(state.width).toBe(clampPanelWidth(10_000))
    state = subagentPanelReducer(state, { type: 'reset-width' })
    expect(state.width).toBe(PANEL_DEFAULT_WIDTH_PX)
  })
})
