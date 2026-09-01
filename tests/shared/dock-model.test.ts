import { describe, expect, it } from 'vitest'
import {
  DOCK_DEFAULT_HEIGHT_PX,
  DOCK_MAX_HEIGHT_PX,
  DOCK_MIN_HEIGHT_PX,
  initialDockState,
  dockReducer,
  type DockAction
} from '../../src/shared/dock-model'

describe('initialDockState', () => {
  it('launches with the dock collapsed and no terminal tab (ticket 18f)', () => {
    expect(initialDockState()).toEqual({
      tabOpen: false,
      visible: false,
      height: DOCK_DEFAULT_HEIGHT_PX,
      gen: 0
    })
  })

  it('keeps the default height inside the drag clamp', () => {
    expect(DOCK_MIN_HEIGHT_PX).toBeLessThan(DOCK_DEFAULT_HEIGHT_PX)
    expect(DOCK_MAX_HEIGHT_PX).toBeGreaterThan(DOCK_DEFAULT_HEIGHT_PX)
  })
})

describe('dockReducer — visibility (⌘J / titlebar toggle)', () => {
  it('first toggle opens the dock AND opens the terminal tab (fresh shell)', () => {
    const state = dockReducer(initialDockState(), { type: 'toggle-dock' })
    expect(state.visible).toBe(true)
    expect(state.tabOpen).toBe(true)
    expect(state.gen).toBe(0)
  })

  it('second toggle hides the dock but keeps the tab (shell survives ⌘J)', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-dock' })
    const hidden = dockReducer(opened, { type: 'toggle-dock' })
    expect(hidden.visible).toBe(false)
    expect(hidden.tabOpen).toBe(true)
  })

  it('re-showing a hidden dock keeps the mount generation (same shell)', () => {
    let state = dockReducer(initialDockState(), { type: 'toggle-dock' })
    state = dockReducer(state, { type: 'toggle-dock' })
    const reshow = dockReducer(state, { type: 'toggle-dock' })
    expect(reshow.visible).toBe(true)
    expect(reshow.tabOpen).toBe(true)
    expect(reshow.gen).toBe(0)
  })

  it('hide-dock is an explicit idempotent hide that keeps the tab', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-dock' })
    const hidden = dockReducer(opened, { type: 'hide-dock' })
    expect(hidden.visible).toBe(false)
    expect(hidden.tabOpen).toBe(true)
    expect(dockReducer(hidden, { type: 'hide-dock' })).toEqual(hidden)
  })
})

describe('dockReducer — terminal tab lifecycle', () => {
  it('close-tab kills the tab and collapses the dock', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-dock' })
    const closed = dockReducer(opened, { type: 'close-tab' })
    expect(closed.tabOpen).toBe(false)
    expect(closed.visible).toBe(false)
  })

  it('toggle after close-tab opens a fresh tab again', () => {
    let state = dockReducer(initialDockState(), { type: 'toggle-dock' })
    state = dockReducer(state, { type: 'close-tab' })
    state = dockReducer(state, { type: 'toggle-dock' })
    expect(state.visible).toBe(true)
    expect(state.tabOpen).toBe(true)
  })

  it('new-session bumps the generation so the shell remounts fresh', () => {
    const opened = dockReducer(initialDockState(), { type: 'toggle-dock' })
    const next = dockReducer(opened, { type: 'new-session' })
    expect(next.tabOpen).toBe(true)
    expect(next.visible).toBe(true)
    expect(next.gen).toBe(opened.gen + 1)
  })

  it('new-session on a fully closed dock opens it with a fresh tab', () => {
    const state = dockReducer(initialDockState(), { type: 'new-session' })
    expect(state.visible).toBe(true)
    expect(state.tabOpen).toBe(true)
    expect(state.gen).toBe(1)
  })

  it('close-tab is idempotent', () => {
    const closed = dockReducer(initialDockState(), { type: 'close-tab' })
    expect(dockReducer(closed, { type: 'close-tab' })).toEqual(closed)
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
    const next = dockReducer(state, { type: 'toggle-dock' })
    expect(next).not.toBe(state)
    expect(state.visible).toBe(false)
    expect(state.tabOpen).toBe(false)
    expect(dockReducer(state, { type: 'nonsense' } as unknown as DockAction)).toBe(state)
  })
})
