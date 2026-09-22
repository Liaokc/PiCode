import { describe, expect, it } from 'vitest'
import {
  DOCK_DEFAULT_HEIGHT_PX,
  DOCK_MAX_HEIGHT_PX,
  DOCK_MIN_HEIGHT_PX,
  clampDockHeight,
  initialDockState,
  dockReducer,
  dockForNewTask,
  terminalFocusServeDecision,
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
      gen: 0,
      focusSeq: 0
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

describe('dockReducer — focus request sequence (ticket 105: ⌘J means type into the shell)', () => {
  it('⌘J opening the terminal bumps the focus request', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    expect(opened.focusSeq).toBe(1)
  })

  it('⌘J closing the dock does not request focus', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    const closed = dockReducer(opened, { type: 'toggle-terminal-panel' })
    expect(closed.open).toBe(false)
    expect(closed.focusSeq).toBe(opened.focusSeq)
  })

  it('⌘J reopen/close cycles keep requesting focus (never stale)', () => {
    let state = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    for (let expected = 2; expected <= 5; expected++) {
      state = dockReducer(state, { type: 'toggle-terminal-panel' }) // close
      state = dockReducer(state, { type: 'toggle-terminal-panel' }) // open
      expect(state.focusSeq).toBe(expected)
    }
  })

  it('⌘J switching back from the bridge requests focus', () => {
    const atTerminal = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    let state = dockReducer(atTerminal, { type: 'toggle-bridge-panel' })
    expect(state.focusSeq).toBe(atTerminal.focusSeq)
    state = dockReducer(state, { type: 'toggle-terminal-panel' })
    expect(state.panel).toBe('terminal')
    expect(state.focusSeq).toBe(atTerminal.focusSeq + 1)
  })

  it('bridge-only actions never request focus (the terminal must not steal)', () => {
    let state = dockReducer(initialDockState(), { type: 'toggle-bridge-panel' })
    expect(state.focusSeq).toBe(0)
    state = dockReducer(state, { type: 'open-bridge-panel' })
    expect(state.focusSeq).toBe(0)
    state = dockReducer(state, { type: 'toggle-bridge-panel' }) // close
    expect(state.focusSeq).toBe(0)
  })

  it('hides and tab closes never request focus', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    expect(dockReducer(opened, { type: 'hide-dock' }).focusSeq).toBe(opened.focusSeq)
    expect(dockReducer(opened, { type: 'close-terminal-tab' }).focusSeq).toBe(opened.focusSeq)
  })

  it('new-session (+) requests focus for the fresh shell when the terminal shows', () => {
    // Same decision as restart()'s kit.userTerm.focus(): a fresh shell is
    // spawn-to-type; focus must not stay parked on the + button.
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    const next = dockReducer(opened, { type: 'new-session' })
    expect(next.gen).toBe(opened.gen + 1)
    expect(next.focusSeq).toBe(opened.focusSeq + 1)
  })

  it('new-session never requests focus for a hidden terminal (bridge showing)', () => {
    const bridge = dockReducer(
      dockReducer(initialDockState(), { type: 'toggle-terminal-panel' }),
      { type: 'toggle-bridge-panel' }
    )
    const next = dockReducer(bridge, { type: 'new-session' })
    expect(next.panel).toBe('bridge')
    expect(next.focusSeq).toBe(bridge.focusSeq)
  })

  it('a plain workspace remount (task switch) carries the old sequence: no bump, no steal', () => {
    // Switching tasks re-keys TerminalWorkspace but dispatches NO dock
    // action — the state (and its focusSeq) is untouched, so the renderer
    // must not focus the new shell.
    const opened = dockReducer(initialDockState(), { type: 'toggle-terminal-panel' })
    expect(dockForNewTask(opened)).toBe(opened)
    expect(opened.focusSeq).toBe(1)
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

describe('clampDockHeight (ticket 30: drag-path/reducer parity)', () => {
  it('matches the reducer commit for every raw drag height', () => {
    // The rAF drag path writes clampDockHeight straight to the DOM; the
    // pointerup commit dispatches set-height. Both paths must agree exactly,
    // or the dock would visibly jump when the drag commits.
    for (let raw = -300; raw <= 1100; raw += 29) {
      const committed = dockReducer(initialDockState(), { type: 'set-height', height: raw }).height
      expect(clampDockHeight(raw)).toBe(committed)
    }
  })

  it('clamps to the documented bounds and rounds to whole px', () => {
    expect(clampDockHeight(Number.NaN)).toBe(DOCK_DEFAULT_HEIGHT_PX)
    expect(clampDockHeight(DOCK_MIN_HEIGHT_PX - 1)).toBe(DOCK_MIN_HEIGHT_PX)
    expect(clampDockHeight(DOCK_MIN_HEIGHT_PX)).toBe(DOCK_MIN_HEIGHT_PX)
    expect(clampDockHeight(DOCK_MAX_HEIGHT_PX)).toBe(DOCK_MAX_HEIGHT_PX)
    expect(clampDockHeight(DOCK_MAX_HEIGHT_PX + 1)).toBe(DOCK_MAX_HEIGHT_PX)
    expect(clampDockHeight(320.4)).toBe(320)
  })
})

describe('terminalFocusServeDecision (ticket 132: the ⌘J request survives the mounting races)', () => {
  // Full decision table — armed × receiver, then the held-by-replacement
  // restore with its live-caret guard. The two regression shapes the table
  // pins: (a) armed with no receiver yet HOLDS (boot empty / create in
  // flight — pre-fix the request was consumed as a no-op and focus landed
  // on <body>); (b) a replaced shell that held focus RESTORES it unless an
  // editable took the caret (a task-switch click reclaims the composer
  // first, so unrelated remounts never steal — ticket 105 survives).
  const cases: Array<{
    name: string
    state: { armed: boolean; receiver: boolean; heldByReplaced: boolean; activeIsEditable: boolean }
    want: 'serve' | 'hold' | 'stand-down'
  }> = [
    // armed requests
    { name: 'armed + receiver → serve (the ticket-105 path)', state: { armed: true, receiver: true, heldByReplaced: false, activeIsEditable: false }, want: 'serve' },
    { name: 'armed + receiver (editable holds focus) → serve (⌘J explicitly moves focus)', state: { armed: true, receiver: true, heldByReplaced: false, activeIsEditable: true }, want: 'serve' },
    { name: 'armed + no receiver → hold (boot empty / create in flight)', state: { armed: true, receiver: false, heldByReplaced: false, activeIsEditable: false }, want: 'hold' },
    { name: 'armed + no receiver + held lingering → hold (the request outlives the replaced shell)', state: { armed: true, receiver: false, heldByReplaced: true, activeIsEditable: false }, want: 'hold' },
    // replacement restores
    { name: 'held by replaced + receiver + focus fell to body → serve (the create-announcement remount)', state: { armed: false, receiver: true, heldByReplaced: true, activeIsEditable: false }, want: 'serve' },
    { name: 'held by replaced + receiver + composer took the caret → stand-down (task-switch click reclaimed it)', state: { armed: false, receiver: true, heldByReplaced: true, activeIsEditable: true }, want: 'stand-down' },
    { name: 'held by replaced + no receiver yet → stand-down (nothing to restore into; the flag is spent)', state: { armed: false, receiver: false, heldByReplaced: true, activeIsEditable: false }, want: 'stand-down' },
    // nothing outstanding
    { name: 'no arm, no hold → stand-down', state: { armed: false, receiver: true, heldByReplaced: false, activeIsEditable: false }, want: 'stand-down' },
    { name: 'no arm, no hold, receiver absent → stand-down', state: { armed: false, receiver: false, heldByReplaced: false, activeIsEditable: true }, want: 'stand-down' }
  ]
  for (const { name, state, want } of cases) {
    it(name, () => {
      expect(terminalFocusServeDecision(state)).toBe(want)
    })
  }
})
