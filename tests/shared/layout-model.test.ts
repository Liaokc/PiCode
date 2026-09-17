import { describe, expect, it } from 'vitest'
import {
  PANEL_EMPTY_TABS,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_WIDTH_PX,
  MAIN_ZONE_MIN_WIDTH_PX,
  clampSidebarWidth,
  initialShellUiState,
  shellUiReducer,
  shouldAutoCollapseSidePanel,
  type ShellUiAction,
  type ShellUiState
} from '../../src/shared/layout-model'
import { PANEL_MIN_WIDTH_PX as PANEL_MIN_WIDTH } from '../../src/shared/panel-model'

describe('initial shell UI state', () => {
  it('opens on the workspace with the sidebar visible and the side panel collapsed', () => {
    // Composition must match reference screenshot 02 on launch.
    expect(initialShellUiState()).toEqual({
      sidebarOpen: true,
      sidebarWidth: SIDEBAR_WIDTH_PX,
      sidePanelOpen: false,
      view: 'workspace'
    })
  })

  it('launches the sidebar at its 320px baseline (ticket 29)', () => {
    expect(SIDEBAR_WIDTH_PX).toBe(320)
    expect(initialShellUiState().sidebarWidth).toBe(320)
  })
})

describe('clampSidebarWidth (ticket 29: drag range 240–520px, default 320)', () => {
  const cases: Array<[number, number, string]> = [
    [Number.NaN, 320, 'NaN falls back to the default'],
    [-1_000, 240, 'far below the floor clamps to the min'],
    [239, 240, 'just below the floor clamps up'],
    [240, 240, 'the exact min passes'],
    [320.4, 320, 'fractions round to whole pixels'],
    [400, 400, 'an in-range width passes through'],
    [520, 520, 'the exact max passes'],
    [521, 520, 'just above the ceiling clamps down'],
    [1_200, 520, 'far above the ceiling clamps to the max']
  ]
  for (const [input, expected, label] of cases) {
    it(`${label} (${input} → ${expected})`, () => {
      expect(clampSidebarWidth(input)).toBe(expected)
    })
  }

  it('exposes the documented drag range', () => {
    expect(SIDEBAR_MIN_WIDTH_PX).toBe(240)
    expect(SIDEBAR_MAX_WIDTH_PX).toBe(520)
  })

  it('keeps a usable main zone at the tightest layout (ticket-29 feedback round 2)', () => {
    // The operator's floor ask: at max-max the composer must keep enough
    // width for a one-line placeholder + the compact chip row.
    expect(MAIN_ZONE_MIN_WIDTH_PX).toBe(420)
    // Worst case fits the smallest window: 240 + 280 + 420 ≤ 1040.
    expect(SIDEBAR_MIN_WIDTH_PX + PANEL_MIN_WIDTH + MAIN_ZONE_MIN_WIDTH_PX).toBeLessThanOrEqual(1040)
  })
})

describe('sidebar width actions (ticket 29)', () => {
  it('commits a dragged width clamped into the drag range', () => {
    const dragged = shellUiReducer(initialShellUiState(), { type: 'set-sidebar-width', width: 640 })
    expect(dragged.sidebarWidth).toBe(520)
    expect(shellUiReducer(dragged, { type: 'set-sidebar-width', width: 400 }).sidebarWidth).toBe(400)
  })

  it('ignores a width commit that would not change anything', () => {
    const state = initialShellUiState()
    expect(shellUiReducer(state, { type: 'set-sidebar-width', width: 320 })).toBe(state)
  })

  it('resets to the default on a double-click and stays put when already default', () => {
    const wide = shellUiReducer(initialShellUiState(), { type: 'set-sidebar-width', width: 480 })
    const reset = shellUiReducer(wide, { type: 'reset-sidebar-width' })
    expect(reset.sidebarWidth).toBe(320)
    expect(shellUiReducer(reset, { type: 'reset-sidebar-width' })).toBe(reset)
  })

  it('keeps the width across unrelated shell actions', () => {
    const wide = shellUiReducer(initialShellUiState(), { type: 'set-sidebar-width', width: 460 })
    const toggled = shellUiReducer(wide, { type: 'toggle-sidebar' })
    expect(toggled.sidebarWidth).toBe(460)
  })

  it('never mutates the previous state on width actions', () => {
    const frozen: Readonly<ShellUiState> = Object.freeze(initialShellUiState())
    const next = shellUiReducer(frozen, { type: 'set-sidebar-width', width: 400 })
    expect(next).not.toBe(frozen)
    expect(frozen.sidebarWidth).toBe(320)
  })
})

describe('shellUiReducer', () => {
  const toggle = (action: ShellUiAction) => (state: ShellUiState): ShellUiState =>
    shellUiReducer(state, action)

  it('toggles the sidebar open and closed', () => {
    const once = toggle({ type: 'toggle-sidebar' })(initialShellUiState())
    expect(once.sidebarOpen).toBe(false)
    const twice = toggle({ type: 'toggle-sidebar' })(once)
    expect(twice.sidebarOpen).toBe(true)
  })

  it('toggles the side panel open and closed', () => {
    const open = toggle({ type: 'toggle-side-panel' })(initialShellUiState())
    expect(open.sidePanelOpen).toBe(true)
    expect(toggle({ type: 'toggle-side-panel' })(open).sidePanelOpen).toBe(false)
  })

  it('opening and closing the panel are explicit, idempotent actions', () => {
    const opened = toggle({ type: 'open-side-panel' })(initialShellUiState())
    expect(toggle({ type: 'open-side-panel' })(opened)).toEqual(opened)
    const closed = toggle({ type: 'close-side-panel' })(opened)
    expect(closed.sidePanelOpen).toBe(false)
    expect(toggle({ type: 'close-side-panel' })(closed)).toEqual(closed)
  })

  it('navigates between the workspace and the settings shell idempotently', () => {
    const opened = toggle({ type: 'open-settings' })(initialShellUiState())
    expect(opened.view).toBe('settings')
    expect(toggle({ type: 'open-settings' })(opened)).toEqual(opened)
    const back = toggle({ type: 'back-to-workspace' })(opened)
    expect(back.view).toBe('workspace')
    expect(toggle({ type: 'back-to-workspace' })(back)).toEqual(back)
  })

  it('toggle-settings is the self-inverting ⌘, action (ticket 63)', () => {
    const opened = toggle({ type: 'toggle-settings' })(initialShellUiState())
    expect(opened.view).toBe('settings')
    expect(toggle({ type: 'toggle-settings' })(opened).view).toBe('workspace')
    // Open settings explicitly, then the toggle closes from the settings view.
    const settings = toggle({ type: 'open-settings' })(initialShellUiState())
    expect(toggle({ type: 'toggle-settings' })(settings).view).toBe('workspace')
  })

  it('never mutates the previous state', () => {
    const frozen: Readonly<ShellUiState> = Object.freeze(initialShellUiState())
    expect(() => shellUiReducer(frozen, { type: 'toggle-side-panel' })).not.toThrow()
    const next = shellUiReducer(frozen, { type: 'toggle-side-panel' })
    expect(next).not.toBe(frozen)
    expect(frozen.sidePanelOpen).toBe(false)
  })

  it('ignores unknown actions instead of corrupting state', () => {
    const state = initialShellUiState()
    expect(shellUiReducer(state, { type: 'nonsense' } as unknown as ShellUiAction)).toBe(state)
  })

  it('keeps the sidebar width through open/close and view actions', () => {
    const wide = shellUiReducer(initialShellUiState(), { type: 'set-sidebar-width', width: 500 })
    const reopened = shellUiReducer(shellUiReducer(wide, { type: 'toggle-sidebar' }), { type: 'toggle-sidebar' })
    expect(reopened.sidebarWidth).toBe(500)
  })
})

describe('side panel tab slots', () => {
  it('offers only the Review card since the terminal moved to the bottom dock (ticket 18)', () => {
    // Spec (18e): the picker shrinks to a single Review card; File Preview
    // stays deep-link-only and the terminal docks at the bottom.
    expect(PANEL_EMPTY_TABS).toEqual(['review'])
    expect(PANEL_EMPTY_TABS).not.toContain('browser')
  })
})

describe('shouldAutoCollapseSidePanel (ticket 86: zero-tabs auto-collapse)', () => {
  /** Decision table for the App shell effect: it feeds the previously
   * committed tab count, the committed one and the shell open state, and
   * dispatches close-side-panel exactly when this predicate fires. Only
   * the >0 → 0 transition while the panel is OPEN collapses — anything
   * else must leave the shell state alone. */
  const TABLE: Array<{ prev: number; next: number; open: boolean; collapse: boolean; why: string }> = [
    { prev: 1, next: 0, open: true, collapse: true, why: 'the last tab closes → collapse' },
    { prev: 3, next: 0, open: true, collapse: true, why: 'the last of several tabs closes → collapse' },
    { prev: 2, next: 1, open: true, collapse: false, why: 'an ordinary close keeps the panel open' },
    { prev: 1, next: 1, open: true, collapse: false, why: 'activate/retarget noise never collapses' },
    { prev: 0, next: 0, open: true, collapse: false, why: 'reopened (⌥⌘B / titlebar) with zero tabs: the picker page must stay up' },
    { prev: 0, next: 1, open: true, collapse: false, why: 'a tab opened from the picker never collapses' },
    { prev: 1, next: 0, open: false, collapse: false, why: 'an already-closed panel: no redundant close' },
    { prev: 0, next: 0, open: false, collapse: false, why: 'boot baseline (closed, no tabs) never dispatches' }
  ]
  for (const row of TABLE) {
    it(`${row.why} (${row.prev}→${row.next} tabs, panel ${row.open ? 'open' : 'closed'})`, () => {
      expect(shouldAutoCollapseSidePanel(row.prev, row.next, row.open)).toBe(row.collapse)
    })
  }

  it('is satisfied by the close-side-panel reducer being idempotent, so a late dispatch cannot corrupt state', () => {
    // Belt-and-braces: even if the effect raced a manual toggle, feeding the
    // predicate's outcome through the real reducer lands on closed either way.
    const open = shellUiReducer(initialShellUiState(), { type: 'open-side-panel' })
    const closed = shellUiReducer(open, { type: 'close-side-panel' })
    expect(shellUiReducer(closed, { type: 'close-side-panel' })).toEqual(closed)
  })
})
