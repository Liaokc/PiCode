/**
 * Review tab state machine: load lifecycle (idle → loading → ready/error),
 * unified/split mode, and the selected file. Pure reducer so the tab's
 * behavior is testable without React or IPC (spec: testing seam style).
 */

import type { ReviewResult } from './types'

export interface ReviewTabState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  result: ReviewResult | null
  mode: 'unified' | 'split'
  selectedPath: string | null
}

export type ReviewAction =
  | { type: 'load-start' }
  | { type: 'load-success'; result: Extract<ReviewResult, { ok: true }> }
  | { type: 'load-failure'; result: Extract<ReviewResult, { ok: false }> }
  | { type: 'set-mode'; mode: 'unified' | 'split' }
  | { type: 'select-file'; path: string | null }

export function initialReviewTabState(): ReviewTabState {
  return { status: 'idle', result: null, mode: 'unified', selectedPath: null }
}

function snapshotFiles(state: ReviewTabState, result: Extract<ReviewResult, { ok: true }>): ReviewTabState {
  const paths = new Set(result.snapshot.files.map((file) => file.path))
  const selected = state.selectedPath !== null && paths.has(state.selectedPath) ? state.selectedPath : (result.snapshot.files[0]?.path ?? null)
  return { ...state, status: 'ready', result, selectedPath: selected }
}

export function reviewTabReducer(state: ReviewTabState, action: ReviewAction): ReviewTabState {
  switch (action.type) {
    case 'load-start':
      // Keep the previous snapshot visible while refreshing.
      return { ...state, status: 'loading' }
    case 'load-success':
      return snapshotFiles(state, action.result)
    case 'load-failure':
      return { ...state, status: 'error', result: action.result, selectedPath: null }
    case 'set-mode':
      return state.mode === action.mode ? state : { ...state, mode: action.mode }
    case 'select-file':
      return state.selectedPath === action.path ? state : { ...state, selectedPath: action.path }
    default:
      return state
  }
}
