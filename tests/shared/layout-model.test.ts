import { describe, expect, it } from 'vitest'
import {
  PANEL_EMPTY_TABS,
  initialShellUiState,
  shellUiReducer,
  type ShellUiAction,
  type ShellUiState
} from '../../src/shared/layout-model'

describe('initial shell UI state', () => {
  it('opens with the sidebar visible and the side panel collapsed', () => {
    // Composition must match reference screenshot 02 on launch.
    expect(initialShellUiState()).toEqual({ sidebarOpen: true, sidePanelOpen: false })
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
})

describe('side panel tab slots', () => {
  it('offers exactly the Review and Terminal tabs in the empty picker', () => {
    // Spec: the side panel hosts Terminal + Review only; browser tabs are out of scope.
    expect(PANEL_EMPTY_TABS).toEqual(['review', 'terminal'])
    expect(PANEL_EMPTY_TABS).not.toContain('browser')
  })
})
