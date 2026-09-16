import { describe, expect, it } from 'vitest'
import {
  PANEL_DEFAULT_WIDTH_PX,
  PANEL_MAX_WIDTH_PX,
  PANEL_MIN_WIDTH_PX,
  RECENTLY_CLOSED_CAPACITY,
  buildTabMenu,
  clampPanelWidth,
  initialPanelState,
  normalizeRecentlyClosed,
  panelReducer,
  panelTabKey,
  panelTabLabel,
  samePanelTab,
  type PanelAction,
  type PanelTabId
} from '../../src/shared/panel-model'

const review = (): PanelTabId => ({ kind: 'review' })
const file = (path: string, cwd = '/work/api'): PanelTabId => ({ kind: 'file', cwd, path })
const trace = (sessionFile: string): PanelTabId => ({ kind: 'trace', sessionFile })
const turnDiff = (turnId: string): PanelTabId => ({ kind: 'turn-diff', turnId })

describe('tab identity (ticket 31)', () => {
  it('treats tabs with the same kind and coordinates as the same tab', () => {
    expect(samePanelTab(file('a.md'), file('a.md'))).toBe(true)
    expect(samePanelTab(file('a.md'), file('a.md', '/work/other'))).toBe(false)
    expect(samePanelTab(file('a.md'), trace('a.md'))).toBe(false)
    expect(samePanelTab(review(), review())).toBe(true)
    expect(samePanelTab(trace('/s/one.jsonl'), trace('/s/one.jsonl'))).toBe(true)
    expect(samePanelTab(trace('/s/one.jsonl'), trace('/s/two.jsonl'))).toBe(false)
  })

  it('builds stable, distinct React keys from the identity', () => {
    const keys = [panelTabKey(review()), panelTabKey(file('a.md')), panelTabKey(trace('/s/one.jsonl'))]
    expect(new Set(keys).size).toBe(3)
    expect(panelTabKey(file('a.md'))).toBe(panelTabKey(file('a.md')))
  })

  it('labels review, file and trace tabs after their path leaf', () => {
    expect(panelTabLabel(review())).toBe('Review')
    expect(panelTabLabel(file('src/app/main.ts'))).toBe('main.ts')
    expect(panelTabLabel(file('docs/'))).toBe('docs')
    expect(panelTabLabel(trace('/home/dev/.pi/sessions/abc.jsonl'))).toBe('abc.jsonl')
  })

  it('turn-diff tabs (ticket 78) are identified by their turn id and labeled generically', () => {
    expect(samePanelTab(turnDiff('m3'), turnDiff('m3'))).toBe(true)
    expect(samePanelTab(turnDiff('m3'), turnDiff('m5'))).toBe(false)
    expect(samePanelTab(turnDiff('m3'), review())).toBe(false)
    expect(panelTabKey(turnDiff('m3'))).toBe(panelTabKey(turnDiff('m3')))
    expect(panelTabKey(turnDiff('m3'))).not.toBe(panelTabKey(turnDiff('m5')))
    expect(panelTabLabel(turnDiff('m3'))).toBe('Turn diff')
  })
})

describe('initialPanelState', () => {
  it('opens with no tabs, no picker, no closed history and the default width', () => {
    expect(initialPanelState()).toEqual({
      openTabs: [],
      activeTab: null,
      pickerOpen: false,
      width: PANEL_DEFAULT_WIDTH_PX,
      recentlyClosed: []
    })
  })

  it('keeps the screenshot-03 default width within the drag clamp', () => {
    expect(PANEL_DEFAULT_WIDTH_PX).toBe(420)
    expect(PANEL_MIN_WIDTH_PX).toBeLessThan(PANEL_DEFAULT_WIDTH_PX)
    expect(PANEL_MAX_WIDTH_PX).toBeGreaterThan(PANEL_DEFAULT_WIDTH_PX)
    expect(PANEL_MIN_WIDTH_PX).toBe(280)
    expect(PANEL_MAX_WIDTH_PX).toBe(1200)
  })
})

describe('panelReducer — tabs', () => {
  it('opens a tab, activates it and dismisses the picker', () => {
    let state = panelReducer(initialPanelState(), { type: 'show-picker' })
    state = panelReducer(state, { type: 'open-tab', tab: review() })
    expect(state.openTabs).toEqual([review()])
    expect(state.activeTab).toEqual(review())
    expect(state.pickerOpen).toBe(false)
  })

  it('gives every deep-linked file its own tab (ticket 31)', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('README.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('src/main.ts') })
    expect(state.openTabs).toEqual([review(), file('README.md'), file('src/main.ts')])
    expect(state.activeTab).toEqual(file('src/main.ts'))
  })

  it('re-deep-linking an open file focuses its existing tab instead of duplicating', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('README.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('src/main.ts') })
    state = panelReducer(state, { type: 'open-tab', tab: file('README.md') })
    expect(state.openTabs).toEqual([file('README.md'), file('src/main.ts')])
    expect(state.activeTab).toEqual(file('README.md'))
  })

  it('re-opening an already-active tab changes nothing', () => {
    const state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('README.md') })
    expect(panelReducer(state, { type: 'open-tab', tab: file('README.md') })).toBe(state)
  })

  it('opens a trace tab into its own slot (framework in place; consumption is ticket 36)', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: trace('/s/one.jsonl') })
    state = panelReducer(state, { type: 'open-tab', tab: trace('/s/one.jsonl') })
    expect(state.openTabs).toEqual([trace('/s/one.jsonl')])
    expect(state.activeTab).toEqual(trace('/s/one.jsonl'))
  })

  it('switches tabs explicitly', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('README.md') })
    state = panelReducer(state, { type: 'activate-tab', tab: review() })
    expect(state.activeTab).toEqual(review())
  })

  it('closing the active tab activates the neighbor (right, else left)', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('README.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('src/main.ts') })
    state = panelReducer(state, { type: 'activate-tab', tab: file('README.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('README.md'), at: 1000 })
    expect(state.openTabs).toEqual([review(), file('src/main.ts')])
    expect(state.activeTab).toEqual(file('src/main.ts'))

    state = panelReducer(state, { type: 'close-tab', tab: file('src/main.ts'), at: 1100 })
    expect(state.activeTab).toEqual(review())
  })

  it('closing the last tab returns to the empty picker composition', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'close-tab', tab: review(), at: 1000 })
    expect(state.openTabs).toEqual([])
    expect(state.activeTab).toBeNull()
    expect(state.pickerOpen).toBe(false)
  })

  it('closing an inactive tab keeps the active tab', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('README.md') })
    state = panelReducer(state, { type: 'activate-tab', tab: review() })
    state = panelReducer(state, { type: 'close-tab', tab: file('README.md'), at: 1000 })
    expect(state.openTabs).toEqual([review()])
    expect(state.activeTab).toEqual(review())
  })

  it('closing a tab that is not open changes nothing', () => {
    const state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    expect(panelReducer(state, { type: 'close-tab', tab: file('ghost.md'), at: 1000 })).toBe(state)
  })
})

describe('panelReducer — recently closed (ticket 31)', () => {
  it('remembers closed file tabs with their close time, newest first', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('b.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('a.md'), at: 1000 })
    state = panelReducer(state, { type: 'close-tab', tab: file('b.md'), at: 2000 })
    expect(state.recentlyClosed).toEqual([
      { tab: file('b.md'), closedAt: 2000 },
      { tab: file('a.md'), closedAt: 1000 }
    ])
  })

  it('does not track the review tab — the picker reopens it', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'close-tab', tab: review(), at: 1000 })
    expect(state.recentlyClosed).toEqual([])
  })

  it('tracks closed trace tabs like file tabs', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: trace('/s/one.jsonl') })
    state = panelReducer(state, { type: 'close-tab', tab: trace('/s/one.jsonl'), at: 1000 })
    expect(state.recentlyClosed).toEqual([{ tab: trace('/s/one.jsonl'), closedAt: 1000 }])
  })

  it('closing the same file twice keeps one entry, re-dated', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('a.md'), at: 1000 })
    state = panelReducer(state, { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('a.md'), at: 2000 })
    expect(state.recentlyClosed).toEqual([{ tab: file('a.md'), closedAt: 2000 }])
  })

  it('opening a tab clears its recently closed entry', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('a.md'), at: 1000 })
    state = panelReducer(state, { type: 'open-tab', tab: file('a.md') })
    expect(state.recentlyClosed).toEqual([])
  })

  it('caps the history at the persisted capacity, dropping the oldest', () => {
    let state = initialPanelState()
    for (let i = 0; i < RECENTLY_CLOSED_CAPACITY + 3; i++) {
      state = panelReducer(state, { type: 'open-tab', tab: file(`f${i}.md`) })
      state = panelReducer(state, { type: 'close-tab', tab: file(`f${i}.md`), at: i })
    }
    expect(state.recentlyClosed).toHaveLength(RECENTLY_CLOSED_CAPACITY)
    expect(state.recentlyClosed[0]?.tab).toEqual(file(`f${RECENTLY_CLOSED_CAPACITY + 2}.md`))
    expect(state.recentlyClosed).not.toContainEqual({ tab: file('f0.md'), closedAt: 0 })
  })

  it('reopening from the dropdown is just open-tab: the tab returns and the entry clears', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('a.md'), at: 1000 })
    state = panelReducer(state, { type: 'open-tab', tab: file('a.md') })
    expect(state.openTabs).toEqual([review(), file('a.md')])
    expect(state.activeTab).toEqual(file('a.md'))
    expect(state.recentlyClosed).toEqual([])
  })

  it('hydrates the persisted history at boot, defensively normalized', () => {
    let state = panelReducer(initialPanelState(), {
      type: 'hydrate-recently-closed',
      entries: [
        { tab: file('a.md'), closedAt: 3000 },
        { tab: file('b.md'), closedAt: 1000 },
        { tab: review(), closedAt: 2000 },
        { tab: file('c.md'), closedAt: 2000 }
      ]
    })
    expect(state.recentlyClosed).toEqual([
      { tab: file('a.md'), closedAt: 3000 },
      { tab: file('c.md'), closedAt: 2000 },
      { tab: file('b.md'), closedAt: 1000 }
    ])
    // Hydration replaces, never appends.
    state = panelReducer(state, { type: 'hydrate-recently-closed', entries: [{ tab: file('d.md'), closedAt: 5 }] })
    expect(state.recentlyClosed).toEqual([{ tab: file('d.md'), closedAt: 5 }])
  })
})

describe('buildTabMenu (ticket 31 dropdown)', () => {
  it('lists open tabs first, then the recently closed history', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('b.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('b.md'), at: 1000 })
    const menu = buildTabMenu(state.openTabs, state.recentlyClosed, '')
    expect(menu.open).toEqual([
      { tab: review(), closedAt: null },
      { tab: file('a.md'), closedAt: null }
    ])
    expect(menu.recent).toEqual([{ tab: file('b.md'), closedAt: 1000 }])
    expect(menu.matches).toEqual([...menu.open, ...menu.recent])
  })

  it('filters both sections by label, case-insensitively', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('App.tsx') })
    state = panelReducer(state, { type: 'open-tab', tab: file('main.ts') })
    state = panelReducer(state, { type: 'close-tab', tab: file('main.ts'), at: 1000 })
    state = panelReducer(state, { type: 'open-tab', tab: file('README.md') })
    const menu = buildTabMenu(state.openTabs, state.recentlyClosed, '  MAIN ')
    expect(menu.open).toEqual([])
    expect(menu.recent).toEqual([{ tab: file('main.ts'), closedAt: 1000 }])
    expect(menu.matches).toEqual(menu.recent)
  })
})

describe('normalizeRecentlyClosed (ticket 31 persistence)', () => {
  it('keeps valid file/trace entries only, newest first, capped', () => {
    const raw = [
      { tab: { kind: 'file', cwd: '/w', path: 'a.md' }, closedAt: 3000 },
      { tab: { kind: 'review' }, closedAt: 4000 },
      { tab: { kind: 'trace', sessionFile: '/s/one.jsonl' }, closedAt: 1000 },
      { tab: { kind: 'file', cwd: '/w', path: 'b.md' }, closedAt: 2000 },
      { tab: { kind: 'file', cwd: '/w', path: 'a.md' }, closedAt: 2500 }
    ]
    expect(normalizeRecentlyClosed(raw)).toEqual([
      { tab: { kind: 'file', cwd: '/w', path: 'a.md' }, closedAt: 3000 },
      { tab: { kind: 'file', cwd: '/w', path: 'b.md' }, closedAt: 2000 },
      { tab: { kind: 'trace', sessionFile: '/s/one.jsonl' }, closedAt: 1000 }
    ])
  })

  it('rejects garbage shapes entirely', () => {
    expect(normalizeRecentlyClosed('nope')).toEqual([])
    expect(normalizeRecentlyClosed([{ tab: 42, closedAt: 1 }])).toEqual([])
    expect(normalizeRecentlyClosed([{ tab: { kind: 'file', cwd: '/w', path: 'a.md' }, closedAt: 'x' }])).toEqual([])
  })

  it('caps the persisted history at the same capacity the reducer enforces', () => {
    const raw = Array.from({ length: 15 }, (_, i) => ({
      tab: { kind: 'file', cwd: '/w', path: `f${i}.md` },
      closedAt: i
    }))
    const normalized = normalizeRecentlyClosed(raw)
    expect(normalized).toHaveLength(RECENTLY_CLOSED_CAPACITY)
    expect(normalized[0]?.tab).toEqual({ kind: 'file', cwd: '/w', path: 'f14.md' })
  })
})

describe('panelReducer — retarget-tab (ticket 31 feedback: in-tab navigation)', () => {
  it('replaces the tab in place and keeps its strip position + active state', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('README.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('docs') })
    state = panelReducer(state, { type: 'retarget-tab', from: file('docs'), to: file('docs/spec.md') })
    expect(state.openTabs).toEqual([review(), file('README.md'), file('docs/spec.md')])
    expect(state.activeTab).toEqual(file('docs/spec.md'))
  })

  it('does not touch the recently closed history (nothing was closed)', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('b.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('b.md'), at: 1000 })
    state = panelReducer(state, { type: 'retarget-tab', from: file('a.md'), to: file('c.md') })
    expect(state.recentlyClosed).toEqual([{ tab: file('b.md'), closedAt: 1000 }])
  })

  it('keeps the open-tabs ∩ recently-closed = ∅ invariant when navigating to a closed path', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: file('a.md') })
    state = panelReducer(state, { type: 'open-tab', tab: file('b.md') })
    state = panelReducer(state, { type: 'close-tab', tab: file('b.md'), at: 1000 })
    // The open tab navigates to the path that sits in the closed history.
    state = panelReducer(state, { type: 'retarget-tab', from: file('a.md'), to: file('b.md') })
    expect(state.openTabs).toEqual([file('b.md')])
    expect(state.activeTab).toEqual(file('b.md'))
    expect(state.recentlyClosed).toEqual([])
  })

  it('navigating to an already-open path focuses it and retires the navigating tab (no duplicates)', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('docs') })
    state = panelReducer(state, { type: 'open-tab', tab: file('spec.md') })
    state = panelReducer(state, { type: 'activate-tab', tab: file('docs') })
    state = panelReducer(state, { type: 'retarget-tab', from: file('docs'), to: file('spec.md') })
    expect(state.openTabs).toEqual([review(), file('spec.md')])
    expect(state.activeTab).toEqual(file('spec.md'))
  })

  it('is a no-op when the navigating tab is not open', () => {
    const state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    expect(panelReducer(state, { type: 'retarget-tab', from: file('ghost.md'), to: file('a.md') })).toBe(state)
  })

  it('keeps the picker behaviour untouched when retargeting an inactive tab', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'open-tab', tab: file('docs') })
    state = panelReducer(state, { type: 'activate-tab', tab: review() })
    state = panelReducer(state, { type: 'show-picker' })
    state = panelReducer(state, { type: 'retarget-tab', from: file('docs'), to: file('spec.md') })
    expect(state.openTabs).toEqual([review(), file('spec.md')])
    expect(state.activeTab).toEqual(review())
    expect(state.pickerOpen).toBe(true)
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

describe('clampPanelWidth (ticket 30: drag-path/reducer parity)', () => {
  it('matches the reducer commit for every raw drag width', () => {
    // The rAF drag path writes clampPanelWidth straight to the DOM; the
    // pointerup commit dispatches set-width. Both paths must agree exactly,
    // or the panel would visibly jump when the drag commits.
    for (let raw = -500; raw <= 1600; raw += 37) {
      const committed = panelReducer(initialPanelState(), { type: 'set-width', width: raw }).width
      expect(clampPanelWidth(raw)).toBe(committed)
    }
  })

  it('clamps to the documented bounds and rounds to whole px', () => {
    expect(clampPanelWidth(Number.NaN)).toBe(PANEL_DEFAULT_WIDTH_PX)
    expect(clampPanelWidth(PANEL_MIN_WIDTH_PX - 1)).toBe(PANEL_MIN_WIDTH_PX)
    expect(clampPanelWidth(PANEL_MIN_WIDTH_PX)).toBe(PANEL_MIN_WIDTH_PX)
    expect(clampPanelWidth(PANEL_MAX_WIDTH_PX)).toBe(PANEL_MAX_WIDTH_PX)
    expect(clampPanelWidth(PANEL_MAX_WIDTH_PX + 1)).toBe(PANEL_MAX_WIDTH_PX)
    expect(clampPanelWidth(420.6)).toBe(421)
  })
})

describe('panelReducer — purity', () => {
  it('never mutates the previous state and ignores unknown actions', () => {
    const state = Object.freeze({
      ...initialPanelState(),
      openTabs: Object.freeze([review()]) as unknown as PanelTabId[],
      recentlyClosed: Object.freeze([{ tab: file('a.md'), closedAt: 1 }]) as never
    })
    const next = panelReducer(state, { type: 'open-tab', tab: file('b.md') })
    expect(next).not.toBe(state)
    expect(state.openTabs).toEqual([review()])
    expect(state.recentlyClosed).toEqual([{ tab: file('a.md'), closedAt: 1 }])
    expect(panelReducer(state, { type: 'nonsense' } as unknown as PanelAction)).toBe(state)
  })
})

describe('panelReducer — turn-diff tabs (ticket 78)', () => {
  it('opens, focuses and closes like any tab', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: turnDiff('m3') })
    expect(state.openTabs).toEqual([turnDiff('m3')])
    expect(state.activeTab).toEqual(turnDiff('m3'))
    state = panelReducer(state, { type: 'open-tab', tab: review() })
    state = panelReducer(state, { type: 'activate-tab', tab: turnDiff('m3') })
    expect(state.activeTab).toEqual(turnDiff('m3'))
    state = panelReducer(state, { type: 'close-tab', tab: turnDiff('m3'), at: 1 })
    expect(state.openTabs).toEqual([review()])
    expect(state.activeTab).toEqual(review())
  })

  it('closing a turn-diff tab is NOT remembered in the recently closed history (ephemeral like Review)', () => {
    let state = panelReducer(initialPanelState(), { type: 'open-tab', tab: turnDiff('m3') })
    state = panelReducer(state, { type: 'close-tab', tab: turnDiff('m3'), at: 1 })
    expect(state.recentlyClosed).toEqual([])
    // And a persisted history can never smuggle one back in.
    expect(normalizeRecentlyClosed([{ tab: turnDiff('m3'), closedAt: 1 }, { tab: file('a.md'), closedAt: 2 }])).toEqual([
      { tab: file('a.md'), closedAt: 2 }
    ])
  })
})
