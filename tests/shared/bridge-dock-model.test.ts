import { describe, expect, it } from 'vitest'
import {
  BRIDGE_DOCK_DEFAULT_HEIGHT_PX,
  BRIDGE_DOCK_MAX_HEIGHT_PX,
  BRIDGE_DOCK_MIN_HEIGHT_PX,
  initialBridgeDockState,
  bridgeDockReducer,
  type BridgeDockAction
} from '../../src/shared/bridge-dock-model'

describe('initialBridgeDockState', () => {
  it('launches hidden at the default height (first screen stays about the conversation)', () => {
    expect(initialBridgeDockState()).toEqual({ open: false, height: BRIDGE_DOCK_DEFAULT_HEIGHT_PX })
  })

  it('keeps the default height inside the drag clamp', () => {
    expect(BRIDGE_DOCK_MIN_HEIGHT_PX).toBeLessThan(BRIDGE_DOCK_DEFAULT_HEIGHT_PX)
    expect(BRIDGE_DOCK_MAX_HEIGHT_PX).toBeGreaterThan(BRIDGE_DOCK_DEFAULT_HEIGHT_PX)
  })
})

describe('bridgeDockReducer — visibility (⌘B / titlebar toggle)', () => {
  it('toggles open and hidden', () => {
    const opened = bridgeDockReducer(initialBridgeDockState(), { type: 'toggle-bridge-dock' })
    expect(opened.open).toBe(true)
    expect(bridgeDockReducer(opened, { type: 'toggle-bridge-dock' }).open).toBe(false)
  })

  it('hiding keeps the dragged height', () => {
    const dragged = bridgeDockReducer(initialBridgeDockState(), { type: 'set-bridge-height', height: 400 })
    const hidden = bridgeDockReducer(dragged, { type: 'hide-bridge-dock' })
    expect(hidden.open).toBe(false)
    expect(hidden.height).toBe(400)
  })

  it('hide and open are explicit, idempotent actions', () => {
    const closed = bridgeDockReducer(initialBridgeDockState(), { type: 'hide-bridge-dock' })
    expect(closed).toEqual(initialBridgeDockState())
    const opened = bridgeDockReducer(closed, { type: 'open-bridge-dock' })
    expect(bridgeDockReducer(opened, { type: 'open-bridge-dock' })).toEqual(opened)
  })
})

describe('bridgeDockReducer — height drag', () => {
  it('clamps drag heights into the allowed range', () => {
    const tooSmall = bridgeDockReducer(initialBridgeDockState(), { type: 'set-bridge-height', height: 10 })
    expect(tooSmall.height).toBe(BRIDGE_DOCK_MIN_HEIGHT_PX)
    const tooBig = bridgeDockReducer(initialBridgeDockState(), { type: 'set-bridge-height', height: 50_000 })
    expect(tooBig.height).toBe(BRIDGE_DOCK_MAX_HEIGHT_PX)
    const ok = bridgeDockReducer(initialBridgeDockState(), { type: 'set-bridge-height', height: 400 })
    expect(ok.height).toBe(400)
  })

  it('ignores NaN and rounds fractional drag positions', () => {
    const nan = bridgeDockReducer(initialBridgeDockState(), { type: 'set-bridge-height', height: Number.NaN })
    expect(nan.height).toBe(BRIDGE_DOCK_DEFAULT_HEIGHT_PX)
    const fractional = bridgeDockReducer(initialBridgeDockState(), { type: 'set-bridge-height', height: 288.6 })
    expect(fractional.height).toBe(289)
  })

  it('double-click reset restores the default height', () => {
    const dragged = bridgeDockReducer(initialBridgeDockState(), { type: 'set-bridge-height', height: 500 })
    expect(bridgeDockReducer(dragged, { type: 'reset-bridge-height' }).height).toBe(BRIDGE_DOCK_DEFAULT_HEIGHT_PX)
  })
})

describe('bridgeDockReducer — purity', () => {
  it('never mutates the previous state and ignores unknown actions', () => {
    const state = Object.freeze(initialBridgeDockState())
    const next = bridgeDockReducer(state, { type: 'toggle-bridge-dock' })
    expect(next).not.toBe(state)
    expect(state.open).toBe(false)
    expect(bridgeDockReducer(state, { type: 'nonsense' } as unknown as BridgeDockAction)).toBe(state)
  })
})
