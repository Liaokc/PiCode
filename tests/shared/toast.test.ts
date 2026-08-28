import { describe, expect, it } from 'vitest'
import {
  MAX_TOASTS,
  dismissToast,
  pushToast,
  toastReducer,
  type ToastList
} from '../../src/shared/toast.ts'

const empty: ToastList = []

describe('pushToast', () => {
  it('appends toasts newest-last and caps the stack, dropping the oldest', () => {
    let state = pushToast(empty, 'First', 'info', 1)
    state = pushToast(state, 'Second', 'info', 2)
    state = pushToast(state, 'Third', 'error', 3)
    expect(state.map((t) => t.id)).toEqual([1, 2, 3])
    state = pushToast(state, 'Fourth', 'info', 4)
    expect(state.map((t) => t.id)).toEqual([2, 3, 4])
    expect(state).toHaveLength(MAX_TOASTS)
  })

  it('re-raises an identical message (same level) instead of stacking duplicates', () => {
    let state = pushToast(empty, 'Compacting context…', 'info', 1)
    state = pushToast(state, 'Something else', 'error', 2)
    state = pushToast(state, 'Compacting context…', 'info', 3)
    expect(state.map((t) => t.id)).toEqual([2, 3])
  })

  it('keeps the same message at different levels separate', () => {
    let state = pushToast(empty, 'Heads up', 'info', 1)
    state = pushToast(state, 'Heads up', 'error', 2)
    expect(state).toHaveLength(2)
  })

  it('ignores empty messages', () => {
    expect(pushToast(empty, '  ', 'info', 1)).toEqual(empty)
  })
})

describe('dismissToast', () => {
  it('removes by id and ignores unknown ids', () => {
    const state = pushToast(pushToast(empty, 'A', 'info', 1), 'B', 'info', 2)
    expect(dismissToast(state, 1).map((t) => t.id)).toEqual([2])
    expect(dismissToast(state, 99)).toEqual(state)
  })
})

describe('toastReducer', () => {
  it('pushes and dismisses through the action shape', () => {
    let state = toastReducer(empty, { type: 'push', message: 'Hello', level: 'info', id: 1 })
    state = toastReducer(state, { type: 'push', message: 'Oops', level: 'error', id: 2 })
    expect(state.map((t) => t.id)).toEqual([1, 2])
    state = toastReducer(state, { type: 'dismiss', id: 1 })
    expect(state.map((t) => t.id)).toEqual([2])
    // Unknown actions are no-ops (defensive default arm).
    expect(toastReducer(state, { type: 'dismiss', id: 123 } as never)).toEqual(state)
  })
})
