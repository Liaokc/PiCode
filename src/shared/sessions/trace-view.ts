/**
 * Call-trace tab rendering state (ticket 37). Pure reducer + selectors — no
 * fs, no SDK, no React — so the Seam-1 suite drives every visible behavior
 * of the tab's tool surfaces: the six block-type toggles, the per-block
 * collapse (expand-all ↔ collapse-all), and in-trace search (query, match
 * index, wrap-around navigation).
 *
 * State model decisions:
 *
 * - Visibility is a per-kind record (default all true). Hiding a kind drops
 *   its blocks from BOTH the render and the search corpus — a match must
 *   never scroll to an invisible block.
 * - Collapse is a materialized key set: collapse-all snapshots the current
 *   block keys, expand-all empties the set, per-block toggles amend it.
 *   Blocks that arrive after a collapse-all (live-follow growth) render
 *   expanded — predictable and append-friendly.
 * - Block keys are positional and stable under append-only growth:
 *   `messageId:section:index` (traceBlockKey). A payload refresh rebuilds
 *   the same keys for existing content, so collapse/search state survives
 *   live refreshes.
 * - Search keeps its query across open/close (ZCode reopens with the last
 *   needle); typing resets the match index; ↑/↓ wrap around modulo the
 *   match total; with zero matches the count reads 0/0 and navigation is a
 *   no-op.
 */

import type { TraceBlock, TraceBlockKind, TraceCall } from './trace.ts'

/** The six block kinds, in toggle-panel order (ZCode reference order). */
export const TRACE_BLOCK_KINDS: readonly TraceBlockKind[] = [
  'system-prompt',
  'user',
  'thinking',
  'assistant',
  'tool-call',
  'tool-result'
]

/** Per-kind visibility (true = shown). Default: all six shown. */
export type TraceKindVisibility = Readonly<Record<TraceBlockKind, boolean>>

/** Which section of a call a block sits in. */
export type TraceSectionId = 'input' | 'output'

/** Stable block identity: positional, append-only-safe (see module doc). */
export function traceBlockKey(messageId: string, section: TraceSectionId, index: number): string {
  return `${messageId}:${section}:${index}`
}

export interface TraceViewState {
  visible: TraceKindVisibility
  /** Blocks the user collapsed (see module doc for the materialization rule). */
  collapsed: ReadonlySet<string>
  searchOpen: boolean
  query: string
  /** 0-based index into the current matches; clamped by the renderer. */
  matchIndex: number
}

export type TraceViewAction =
  | { type: 'toggle-kind'; kind: TraceBlockKind }
  | { type: 'toggle-block'; key: string }
  | { type: 'collapse-all'; keys: readonly string[] }
  | { type: 'expand-all' }
  | { type: 'open-search' }
  | { type: 'close-search' }
  | { type: 'set-query'; query: string }
  | { type: 'next-match'; total: number }
  | { type: 'prev-match'; total: number }

function allVisible(): TraceKindVisibility {
  return {
    'system-prompt': true,
    user: true,
    thinking: true,
    assistant: true,
    'tool-call': true,
    'tool-result': true
  }
}

export function initialTraceViewState(): TraceViewState {
  return { visible: allVisible(), collapsed: new Set(), searchOpen: false, query: '', matchIndex: 0 }
}

export function traceViewReducer(state: TraceViewState, action: TraceViewAction): TraceViewState {
  switch (action.type) {
    case 'toggle-kind': {
      const visible: TraceKindVisibility = { ...state.visible, [action.kind]: !state.visible[action.kind] }
      return { ...state, visible }
    }
    case 'toggle-block': {
      const collapsed = new Set(state.collapsed)
      if (collapsed.has(action.key)) collapsed.delete(action.key)
      else collapsed.add(action.key)
      return { ...state, collapsed }
    }
    case 'collapse-all': {
      if (action.keys.length === 0) return state
      return { ...state, collapsed: new Set(action.keys) }
    }
    case 'expand-all': {
      if (state.collapsed.size === 0) return state
      return { ...state, collapsed: new Set() }
    }
    case 'open-search':
      return state.searchOpen ? state : { ...state, searchOpen: true }
    case 'close-search':
      return state.searchOpen || state.matchIndex !== 0
        ? { ...state, searchOpen: false, matchIndex: 0 }
        : state
    case 'set-query': {
      if (state.query === action.query) return state
      return { ...state, query: action.query, matchIndex: 0 }
    }
    case 'next-match': {
      if (action.total <= 0) return state
      return { ...state, matchIndex: (state.matchIndex + 1) % action.total }
    }
    case 'prev-match': {
      if (action.total <= 0) return state
      return { ...state, matchIndex: (state.matchIndex - 1 + action.total) % action.total }
    }
    default:
      return state
  }
}

// ---- selectors ---------------------------------------------------------------

/** The search corpus / display text of one block — its full text (tool
 * blocks expose their args/output), regardless of display truncation. The
 * renderer's block rows consume the SAME projection, so a search hit can
 * never point at a block whose text the row would show differently. */
export function traceBlockText(block: TraceBlock): string {
  switch (block.kind) {
    case 'system-prompt':
    case 'user':
    case 'thinking':
    case 'assistant':
      return block.text
    case 'tool-call':
      return block.args
    case 'tool-result':
      return block.output
  }
}

/** One search hit: the block it lives in, addressed the same way the
 * renderer addresses DOM nodes (traceBlockKey). */
export interface TraceMatch {
  key: string
  messageId: string
  section: TraceSectionId
  index: number
}

/**
 * Document-order matches of `query` (case-insensitive substring of the
 * trimmed needle) over the VISIBLE blocks of every call — input section
 * before output, calls in file order. An empty needle matches nothing so
 * the count reads 0/0 before the user types.
 */
export function traceMatches(
  calls: readonly TraceCall[],
  visible: TraceKindVisibility,
  query: string
): TraceMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  const matches: TraceMatch[] = []
  for (const call of calls) {
    collectMatches(call.messageId, 'input', call.inputBlocks, visible, needle, matches)
    collectMatches(call.messageId, 'output', call.outputBlocks, visible, needle, matches)
  }
  return matches
}

function collectMatches(
  messageId: string,
  section: TraceSectionId,
  blocks: readonly TraceBlock[],
  visible: TraceKindVisibility,
  needle: string,
  out: TraceMatch[]
): void {
  blocks.forEach((block, index) => {
    if (!visible[block.kind]) return
    if (traceBlockText(block).toLowerCase().includes(needle)) {
      out.push({ key: traceBlockKey(messageId, section, index), messageId, section, index })
    }
  })
}

/** Every block key of the payload in document order — the collapse-all
 * input (hidden kinds included: re-enabling a kind keeps the collapsed
 * semantics consistent). */
export function traceAllBlockKeys(calls: readonly TraceCall[]): string[] {
  const keys: string[] = []
  for (const call of calls) {
    call.inputBlocks.forEach((_, index) => keys.push(traceBlockKey(call.messageId, 'input', index)))
    call.outputBlocks.forEach((_, index) => keys.push(traceBlockKey(call.messageId, 'output', index)))
  }
  return keys
}

/** '2/9' — 1-based current over total; '0/0' when nothing matches. */
export function formatMatchCount(matchIndex: number, total: number): string {
  if (total <= 0) return '0/0'
  return `${Math.min(matchIndex, total - 1) + 1}/${total}`
}
