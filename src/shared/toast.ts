/**
 * Global toast model (ticket 11): the single notification surface for
 * non-blocking feedback — host notices (compaction, etc.) and session
 * command errors. Pure list operations; the component owns timers and
 * rendering. Newest toast renders last; the stack caps at MAX_TOASTS by
 * dropping the oldest. An identical message+level re-raises in place
 * (refreshing its timer) instead of stacking duplicates.
 */

export type ToastLevel = 'info' | 'error'

export interface Toast {
  /** Monotonic id supplied by the caller (a counter is fine). */
  id: number
  level: ToastLevel
  message: string
}

export type ToastList = readonly Toast[]

export const MAX_TOASTS = 3

export function pushToast(state: ToastList, message: string, level: ToastLevel, id: number): ToastList {
  const trimmed = message.trim()
  if (trimmed === '') return state
  const withoutDuplicate = state.filter((t) => !(t.message === trimmed && t.level === level))
  return [...withoutDuplicate, { id, level, message: trimmed }].slice(-MAX_TOASTS)
}

export function dismissToast(state: ToastList, id: number): ToastList {
  const next = state.filter((t) => t.id !== id)
  return next.length === state.length ? state : next
}

/** Reducer wrapper for useReducer hosts (the App shell). */
export type ToastAction =
  | { type: 'push'; message: string; level: ToastLevel; id: number }
  | { type: 'dismiss'; id: number }

export function toastReducer(state: ToastList, action: ToastAction): ToastList {
  switch (action.type) {
    case 'push':
      return pushToast(state, action.message, action.level, action.id)
    case 'dismiss':
      return dismissToast(state, action.id)
    default:
      return state
  }
}
