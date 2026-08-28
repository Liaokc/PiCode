import { describe, expect, it } from 'vitest'
import {
  PANEL_DEFAULT_WIDTH_PX,
  PANEL_MAX_WIDTH_PX,
  PANEL_MIN_WIDTH_PX,
  initialPanelState,
  panelReducer,
  type PanelAction
} from '../../src/shared/panel-model'

describe('initialPanelState', () => {
  it('opens with no tabs, no picker and the default width', () => {
    expect(initialPanelState()).toEqual({
      openTabs: [],
      activeTab: null,
      pickerOpen: false,
      width: PANEL_DEFAULT_WIDTH_PX
    })
  })

  it('keeps the screenshot-03 default width within the drag clamp', () => {
    expect(PANEL_DEFAULT_WIDTH_PX).toBe(420)
    expect(PANEL_MIN_WIDTH_PX).toBeLessThan(PANEL_DEFAULT_WIDTH_PX)
    expect(PANEL_MAX_WIDTH_PX).toBeGreaterThan(PANEL_DEFAULT_WIDTH_PX)
  })
})

describe('panelReducer — tabs', () => {
  it('opens a tab, activates it and dismisses the picker', () => {
    let state = panelReducer(initialPanelState(), { type: 'show-picker' })
    state = panelReducer(state, { type: 'open-tab', tab: 'review' })
    expect(state.openTabs).toEqual(['review'])
    expect(state.activeTab).toBe('review')
    expect(state.pickerOpen).toBe(false)
  })

  it('adds further tabs without duplicating and activates them', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: 'review' })
    state = panelReducer(state, { type: 'open-tab', tab: 'terminal' })
    expect(state.openTabs).toEqual(['review', 'terminal'])
    expect(state.activeTab).toBe('terminal')
    state = panelReducer(state, { type: 'open-tab', tab: 'review' })
    expect(state.openTabs).toEqual(['review', 'terminal'])
    expect(state.activeTab).toBe('review')
  })

  it('switches tabs explicitly', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: 'review' })
    state = panelReducer(state, { type: 'open-tab', tab: 'terminal' })
    state = panelReducer(state, { type: 'activate-tab', tab: 'review' })
    expect(state.activeTab).toBe('review')
  })

  it('closing the active tab activates the neighbor (right, else left)', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: 'review' })
    state = panelReducer(state, { type: 'open-tab', tab: 'terminal' })
    state = panelReducer(state, { type: 'activate-tab', tab: 'review' })
    state = panelReducer(state, { type: 'close-tab', tab: 'review' })
    expect(state.openTabs).toEqual(['terminal'])
    expect(state.activeTab).toBe('terminal')

    state = panelReducer(state, { type: 'open-tab', tab: 'review' })
    state = panelReducer(state, { type: 'activate-tab', tab: 'review' })
    state = panelReducer(state, { type: 'close-tab', tab: 'review' })
    expect(state.openTabs).toEqual(['terminal'])
    expect(state.activeTab).toBe('terminal')
  })

  it('closing the last tab returns to the empty picker composition', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: 'review' })
    state = panelReducer(state, { type: 'close-tab', tab: 'review' })
    expect(state.openTabs).toEqual([])
    expect(state.activeTab).toBeNull()
    expect(state.pickerOpen).toBe(false)
  })

  it('closing an inactive tab keeps the active tab', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: 'review' })
    state = panelReducer(state, { type: 'open-tab', tab: 'terminal' })
    state = panelReducer(state, { type: 'activate-tab', tab: 'review' })
    state = panelReducer(state, { type: 'close-tab', tab: 'terminal' })
    expect(state.openTabs).toEqual(['review'])
    expect(state.activeTab).toBe('review')
  })
})

describe('panelReducer — width drag', () => {
  it('clamps widths into the allowed range', () => {
    const tooSmall = panelReducer(initialPanelState(), { type: 'set-width', width: 100 })
    expect(tooSmall.width).toBe(PANEL_MIN_WIDTH_PX)
    const tooBig = panelReducer(initialPanelState(), { type: 'set-width', width: 5000 })
    expect(tooBig.width).toBe(PANEL_MAX_WIDTH_PX)
    const ok = panelReducer(initialPanelState(), { type: 'set-width', width: 600 })
    expect(ok.width).toBe(600)
  })

  it('double-click reset restores the default width', () => {
    const widened = panelReducer(initialPanelState(), { type: 'set-width', width: 700 })
    const reset = panelReducer(widened, { type: 'reset-width' })
    expect(reset.width).toBe(PANEL_DEFAULT_WIDTH_PX)
  })
})

describe('panelReducer — purity', () => {
  it('never mutates the previous state and ignores unknown actions', () => {
    const state = Object.freeze(initialPanelState())
    const next = panelReducer(state, { type: 'open-tab', tab: 'review' })
    expect(next).not.toBe(state)
    expect(state.openTabs).toEqual([])
    expect(panelReducer(state, { type: 'nonsense' } as unknown as PanelAction)).toBe(state)
  })
})
