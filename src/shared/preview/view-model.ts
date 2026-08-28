/**
 * Preview tab state machine (ticket 07): load lifecycle, rendered/source
 * view mode, and the large-file line window. Pure reducer so the tab's
 * behavior is testable without React or IPC (spec: testing seam style).
 */

import { PREVIEW_SOURCE_MAX_LINES, PREVIEW_SOURCE_WINDOW_LINES, displayModeFor } from './policy'
import type { PreviewResult } from './types'

/** What the tab is pointed at. `token` increments to force a reload of the same path. */
export interface PreviewSelection {
  cwd: string
  path: string
  token: number
}

export interface PreviewTabState {
  sel: PreviewSelection | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  result: PreviewResult | null
  view: 'rendered' | 'source'
  /** Source-view display mode: soft-wrapped lines (default) or truncated with horizontal scroll. */
  wrapLines: boolean
  /** Source-view line window (large-file policy layer 3). */
  visibleLines: number
}

export type PreviewAction =
  | { type: 'load-start'; sel: PreviewSelection }
  | { type: 'load-success'; result: Extract<PreviewResult, { ok: true }> }
  | { type: 'load-failure'; result: Extract<PreviewResult, { ok: false }> }
  | { type: 'set-view'; view: 'rendered' | 'source' }
  | { type: 'toggle-wrap-lines' }
  | { type: 'show-more-lines' }

export function initialPreviewTabState(): PreviewTabState {
  return { sel: null, status: 'idle', result: null, view: 'rendered', wrapLines: true, visibleLines: PREVIEW_SOURCE_WINDOW_LINES }
}

export function previewTabReducer(state: PreviewTabState, action: PreviewAction): PreviewTabState {
  switch (action.type) {
    case 'load-start':
      // Adopt the new selection and reset per-file view state, but keep the
      // previous file's content visible so retargeting doesn't flash empty.
      return {
        ...state,
        sel: action.sel,
        status: 'loading',
        view: 'rendered',
        visibleLines: PREVIEW_SOURCE_WINDOW_LINES
      }
    case 'load-success': {
      // Markdown that is too big to parse presents as source from the start.
      const view =
        action.result.kind === 'file' && displayModeFor(action.result.file) === 'markdown' ? 'rendered' : 'source'
      return { ...state, status: 'ready', result: action.result, view }
    }
    case 'load-failure':
      return { ...state, status: 'error', result: action.result }
    case 'set-view':
      return state.view === action.view ? state : { ...state, view: action.view }
    case 'toggle-wrap-lines':
      // A display preference — survives file loads and retargeting on purpose.
      return { ...state, wrapLines: !state.wrapLines }
    case 'show-more-lines': {
      if (state.sel === null) return state
      const next = Math.min(state.visibleLines + PREVIEW_SOURCE_WINDOW_LINES, PREVIEW_SOURCE_MAX_LINES)
      return next === state.visibleLines ? state : { ...state, visibleLines: next }
    }
    default:
      return state
  }
}
