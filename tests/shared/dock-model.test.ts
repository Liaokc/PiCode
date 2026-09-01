import { describe, expect, it } from 'vitest'
import {
  DOCK_DEFAULT_HEIGHT_PX,
  DOCK_MAX_HEIGHT_PX,
  DOCK_MIN_HEIGHT_PX,
  initialDockState,
  dockReducer,
  dockForNewTask,
  type DockAction,
  type DockState
} from '../../src/shared/dock-model'

describe('initialDockState', () => {
  it('launches hidden, terminal panel preselected, no shell (ticket 18f)', () => {
    expect(initialDockState()).toEqual({
      open: false,
      panel: 'terminal',
      height: DOCK_DEFAULT_HEIGHT_PX,
      tabOpen: false,
      gen: 0
    })
  })

  it('keeps the default height inside the drag clamp', () => {
    expect(DOCK_MIN_HEIGHT_PX).toBeLessThan(DOCK_DEFAULT_HEIGHT_PX)
    expect(DOCK_MAX_HEIGHT_PX).toBeGreaterThan(DOCK_DEFAULT_HEIGHT_PX)
  })
})

describe('dockReducer — ⌘J terminal panel', () => {
  it('opens the dock showing the terminal and spawns the tab', () => {
    const state = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    expect(state.open).toBe(true)
    expect(state.panel).toBe('terminal')
    expect(state.tabOpen).toBe(true)
  })

  it('second ⌘J closes the dock; the shell survives (tab stays open)', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    const closed = dockReducer(opened, { type: 'toggle-terminal-panel' })
    expect(closed.open).toBe(false)
    expect(closed.tabOpen).toBe(true)
    // Re-opening shows the SAME shell (no gen bump).
    expect(dockReducer(closed, { type: 'toggle-terminal-panel' }).gen).toBe(0)
  })

  it('⌘J while the bridge shows switches to the terminal in place', () => {
    let state = dockReducer(initialDockState(), { type: 'toggle-bridge-panel' })
    state = dockReducer(state, { type: 'toggle-terminal-panel' })
    expect(state.open).toBe(true)
    expect(state.panel).toBe('terminal')
    expect(state.tabOpen).toBe(true)
  })
})

describe('dockReducer — ⌘B bridge panel (same frame, sibling panel)', () => {
  it('opens the dock showing the bridge; no terminal tab is spawned', () => {
    const state = dockReducer(initialDockState(), { type: 'toggle-bridge-panel' })
    expect(state.open).toBe(true)
    expect(state.panel).toBe('bridge')
    expect(state.tabOpen).toBe(false)
  })

  it('⌘B while the terminal shows switches panels and keeps the shell', () => {
    const terminal = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    const bridge = dockReducer(terminal, { type: 'toggle-bridge-panel' })
    expect(bridge.open).toBe(true)
    expect(bridge.panel).toBe('bridge')
    expect(bridge.tabOpen).toBe(true)
    expect(bridge.gen).toBe(terminal.gen)
  })

  it('second ⌘B closes the dock', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-bridge-panel' })
    expect(dockReducer(opened, { type: 'toggle-bridge-panel' }).open).toBe(false)
  })
})

describe('dockReducer — deep link (tool card → bridge)', () => {
  it('open-bridge-panel shows the bridge and is idempotent', () => {
    const opened = dockReducer(initialDockState(), { type: 'open-bridge-panel' })
    expect(opened.open).toBe(true)
    expect(opened.panel).toBe('bridge')
    expect(dockReducer(opened, { type: 'open-bridge-panel' })).toEqual(opened)
  })
})

describe('dockReducer — terminal tab lifecycle', () => {
  it('close-tab kills the tab and collapses the dock', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    const closed = dockReducer(opened, { type: 'close-terminal-tab' })
    expect(closed.tabOpen).toBe(false)
    expect(closed.open).toBe(false)
  })

  it('toggle after close-tab opens a fresh tab again', () => {
    let state = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    state = dockReducer(state, { type: 'close-terminal-tab' })
    state = dockReducer(state, { type: 'toggle-terminal-panel' })
    expect(state.open).toBe(true)
    expect(state.panel).toBe('terminal')
    expect(state.tabOpen).toBe(true)
  })

  it('new-session bumps the generation so the shell remounts fresh', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    const next = dockReducer(opened, { type: 'new-session' })
    expect(next.tabOpen).toBe(true)
    expect(next.open).toBe(true)
    expect(next.gen).toBe(opened.gen + 1)
  })

  it('hide-dock is an explicit idempotent hide that keeps the shell', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    const hidden = dockReducer(opened, { type: 'hide-dock' })
    expect(hidden.open).toBe(false)
    expect(hidden.tabOpen).toBe(true)
    expect(dockReducer(hidden, { type: 'hide-dock' })).toEqual(hidden)
  })
})

describe('dockReducer — height drag', () => {
  it('clamps drag heights into the allowed range', () => {
    const tooSmall = dockReducer(initialDockState(), { type: 'set-height', height: 10 })
    expect(tooSmall.height).toBe(DOCK_MIN_HEIGHT_PX)
    const tooBig = dockReducer(initialDockState(), { type: 'set-height', height: 50_000 })
    expect(tooBig.height).toBe(DOCK_MAX_HEIGHT_PX)
    const ok = dockReducer(initialDockState(), { type: 'set-height', height: 450 })
    expect(ok.height).toBe(450)
  })

  it('ignores NaN and rounds fractional drag positions', () => {
    const nan = dockReducer(initialDockState(), { type: 'set-height', height: Number.NaN })
    expect(nan.height).toBe(DOCK_DEFAULT_HEIGHT_PX)
    const fractional = dockReducer(initialDockState(), { type: 'set-height', height: 301.7 })
    expect(fractional.height).toBe(302)
  })

  it('double-click reset restores the default height', () => {
    const dragged = dockReducer(initialDockState(), { type: 'set-height', height: 600 })
    expect(dockReducer(dragged, { type: 'reset-height' }).height).toBe(DOCK_DEFAULT_HEIGHT_PX)
  })
})

describe('dockReducer — purity', () => {
  it('never mutates the previous state and ignores unknown actions', () => {
    const state = Object.freeze(initialDockState())
    const next = dockReducer(state, { type: 'toggle-terminal-panel' })
    expect(next).not.toBe(state)
    expect(state.open).toBe(false)
    expect(state.panel).toBe('terminal')
    expect(dockReducer(state, { type: 'nonsense' } as unknown as DockAction)).toBe(state)
  })
})

describe('dockForNewTask — ⌘N × dock combination (ticket 17×18 decision)', () => {
  const table: Array<[string, DockState]> = [
    ['hidden dock stays hidden', initialDockState()],
    [
      'open terminal panel stays exactly as-is (shell keeps running behind ⌘N)',
      dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    ],
    [
      'open bridge panel stays exactly as-is',
      dockReducer(initialDockState(), { type: 'toggle-bridge-panel' })
    ],
    [
      'open bridge over a live shell keeps both the shell and the bridge view',
      dockReducer(
        dockReducer(initialDockState(), { type: 'toggle-terminal-panel' }),
        { type: 'toggle-bridge-panel' }
      )
    ],
    [
      'dragged height is untouched',
      dockReducer(
        dockReducer(initialDockState(), { type: 'toggle-terminal-panel' }),
        { type: 'set-height', height: 520 }
      )
    ],
    [
      'closed-after-live-shell stays closed with its tab',
      dockReducer(
        dockReducer(initialDockState(), { type: 'toggle-terminal-panel' }),
        { type: 'toggle-terminal-panel' }
      )
    ]
  ]

  it.each(table)('%s', (_name, state) => {
    expect(dockForNewTask(state)).toBe(state)
  })
})

describe('dockReducer — dock-for-new-task action (⌘N marker)', () => {
  it('folds through dockForNewTask: the dock is untouched by ⌘N', () => {
    const open = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    expect(dockReducer(open, { type: 'dock-for-new-task' })).toBe(open)
    const pristine = initialDockState()
    expect(dockReducer(pristine, { type: 'dock-for-new-task' })).toBe(pristine)
  })
})
