import { describe, expect, it } from 'vitest'
import {
  formatMatchCount,
  initialTraceViewState,
  traceAllBlockKeys,
  traceBlockKey,
  traceMatches,
  traceViewReducer,
  TRACE_BLOCK_KINDS,
  type TraceViewState
} from '../../src/shared/sessions/trace-view'
import type { TraceBlockKind, TraceCall, TracePayload } from '../../src/shared/sessions/trace'

/**
 * Table-driven suite for the trace tab's rendering state (ticket 37): the
 * six block-type toggles, per-block collapse (expand-all ↔ collapse-all),
 * and search state (open/close, query, ↑↓ match navigation). The reducer and
 * the match selector are pure — the TraceTab component only dispatches and
 * projects; given the same payload structure and action history, the visible
 * output is fully determined here.
 */

function textBlock(kind: TraceBlockKind, text: string): TraceCall['outputBlocks'][number] {
  if (kind === 'tool-call') return { kind, toolName: 'bash', callId: `call-${text}`, args: text }
  if (kind === 'tool-result') return { kind, toolName: 'bash', callId: `call-${text}`, output: text, isError: false }
  return { kind, text } as TraceCall['outputBlocks'][number]
}

let callSeq = 0
function callWith(input: TraceCall['inputBlocks'], output: TraceCall['outputBlocks']): TraceCall {
  callSeq += 1
  return {
    index: callSeq,
    messageId: `msg-${callSeq}`,
    model: 'test-model',
    timestamp: '2026-09-02T10:00:00.000Z',
    durationMs: 1_000,
    stopReason: 'stop',
    usage: null,
    inputBlocks: input,
    outputBlocks: output
  }
}

const USER = (text: string): TraceCall['inputBlocks'] => [textBlock('user', text)]
const ASSISTANT = (text: string): TraceCall['outputBlocks'] => [textBlock('assistant', text)]

function payloadOf(calls: TraceCall[]): TracePayload {
  callSeq = 0
  for (const [i, call] of calls.entries()) {
    call.index = i + 1
    call.messageId = `msg-${i + 1}`
  }
  return { file: '/s/demo.jsonl', title: 'demo', model: 'test-model', calls }
}

function reduced(state: TraceViewState, ...actions: Parameters<typeof traceViewReducer>[1][]): TraceViewState {
  return actions.reduce(traceViewReducer, state)
}

describe('initialTraceViewState', () => {
  it('starts with all six block kinds visible, everything expanded, search closed', () => {
    const state = initialTraceViewState()
    for (const kind of TRACE_BLOCK_KINDS) {
      expect(state.visible[kind]).toBe(true)
    }
    expect(TRACE_BLOCK_KINDS).toEqual(['system-prompt', 'user', 'thinking', 'assistant', 'tool-call', 'tool-result'])
    expect(state.collapsed.size).toBe(0)
    expect(state.searchOpen).toBe(false)
    expect(state.query).toBe('')
    expect(state.matchIndex).toBe(0)
  })
})

describe('traceViewReducer — block-kind toggles', () => {
  const state = initialTraceViewState()

  it.each(TRACE_BLOCK_KINDS)('toggles only %s, in both directions', (kind) => {
    const off = traceViewReducer(state, { type: 'toggle-kind', kind })
    expect(off.visible[kind]).toBe(false)
    for (const other of TRACE_BLOCK_KINDS) {
      if (other !== kind) expect(off.visible[other]).toBe(true)
    }
    const on = traceViewReducer(off, { type: 'toggle-kind', kind })
    expect(on.visible[kind]).toBe(true)
  })

  it('is idempotent-safe: toggling twice returns to the start for every kind', () => {
    let current = state
    for (const kind of TRACE_BLOCK_KINDS) {
      current = traceViewReducer(current, { type: 'toggle-kind', kind })
    }
    // all off
    for (const kind of TRACE_BLOCK_KINDS) expect(current.visible[kind]).toBe(false)
    for (const kind of TRACE_BLOCK_KINDS) {
      current = traceViewReducer(current, { type: 'toggle-kind', kind })
    }
    expect(current.visible).toEqual(state.visible)
  })
})

describe('traceViewReducer — expand/collapse', () => {
  it('collapse-all materializes the given keys; expand-all clears them', () => {
    const keys = ['m1:input:0', 'm1:output:1', 'm2:output:0']
    const collapsed = traceViewReducer(initialTraceViewState(), { type: 'collapse-all', keys })
    expect([...collapsed.collapsed].sort()).toEqual([...keys].sort())
    const expanded = traceViewReducer(collapsed, { type: 'expand-all' })
    expect(expanded.collapsed.size).toBe(0)
  })

  it('collapse-all is a no-op returning the SAME state when nothing is collapsed yet', () => {
    const state = initialTraceViewState()
    expect(traceViewReducer(state, { type: 'collapse-all', keys: [] })).toBe(state)
  })

  it('expand-all is a no-op returning the SAME state when nothing is collapsed', () => {
    const state = initialTraceViewState()
    expect(traceViewReducer(state, { type: 'expand-all' })).toBe(state)
  })

  it('toggle-block collapses an expanded block and re-expands a collapsed one', () => {
    const afterCollapseAll = traceViewReducer(initialTraceViewState(), {
      type: 'collapse-all',
      keys: ['m1:input:0', 'm2:output:0']
    })
    const reExpanded = traceViewReducer(afterCollapseAll, { type: 'toggle-block', key: 'm1:input:0' })
    expect(reExpanded.collapsed.has('m1:input:0')).toBe(false)
    expect(reExpanded.collapsed.has('m2:output:0')).toBe(true)
    const backCollapsed = traceViewReducer(reExpanded, { type: 'toggle-block', key: 'm1:input:0' })
    expect(backCollapsed.collapsed.has('m1:input:0')).toBe(true)
  })

  it('blocks that arrive AFTER a collapse-all (live growth) are not collapsed', () => {
    const collapsed = traceViewReducer(initialTraceViewState(), { type: 'collapse-all', keys: ['m1:input:0'] })
    // The new block's key was never materialized — it renders expanded.
    expect(collapsed.collapsed.has('m2:output:0')).toBe(false)
  })
})

describe('traceViewReducer — search state', () => {
  it('open-search keeps the previous query, close-search hides the bar', () => {
    const typed = reduced(initialTraceViewState(), { type: 'open-search' }, { type: 'set-query', query: 'bash' })
    expect(typed.searchOpen).toBe(true)
    expect(typed.query).toBe('bash')
    const closed = traceViewReducer(typed, { type: 'close-search' })
    expect(closed.searchOpen).toBe(false)
    expect(closed.query).toBe('bash') // reopen keeps the needle
    const reopened = traceViewReducer(closed, { type: 'open-search' })
    expect(reopened.searchOpen).toBe(true)
    expect(reopened.query).toBe('bash')
  })

  it('opening search twice is a no-op on the SAME state', () => {
    const open = traceViewReducer(initialTraceViewState(), { type: 'open-search' })
    expect(traceViewReducer(open, { type: 'open-search' })).toBe(open)
    expect(traceViewReducer(open, { type: 'close-search' })).not.toBe(open)
  })

  it('set-query resets the match index to the first match', () => {
    const state = reduced(
      initialTraceViewState(),
      { type: 'open-search' },
      { type: 'set-query', query: 'a' },
      { type: 'next-match', total: 5 },
      { type: 'next-match', total: 5 }
    )
    expect(state.matchIndex).toBe(2)
    const retyped = traceViewReducer(state, { type: 'set-query', query: 'ab' })
    expect(retyped.query).toBe('ab')
    expect(retyped.matchIndex).toBe(0)
  })

  it('set-query with an unchanged value returns the SAME state (keeps the index)', () => {
    const state = reduced(initialTraceViewState(), { type: 'open-search' }, { type: 'set-query', query: 'keep' })
    expect(traceViewReducer(state, { type: 'set-query', query: 'keep' })).toBe(state)
  })

  it('next/prev navigate modulo the total (wrap-around), table-driven', () => {
    const cases: Array<{ steps: Array<{ type: 'next-match' | 'prev-match' }>; total: number; expected: number }> = [
      { steps: [{ type: 'next-match' }], total: 3, expected: 1 },
      { steps: [{ type: 'next-match' }, { type: 'next-match' }, { type: 'next-match' }], total: 3, expected: 0 },
      { steps: [{ type: 'prev-match' }], total: 3, expected: 2 },
      { steps: [{ type: 'prev-match' }, { type: 'prev-match' }], total: 3, expected: 1 },
      { steps: [{ type: 'next-match' }, { type: 'prev-match' }], total: 4, expected: 0 }
    ]
    for (const { steps, total, expected } of cases) {
      const state = reduced(initialTraceViewState(), { type: 'open-search' }, { type: 'set-query', query: 'x' }, ...steps.map((s) => ({ ...s, total })))
      expect(state.matchIndex).toBe(expected)
    }
  })

  it('navigation with zero matches leaves the state untouched', () => {
    const state = reduced(initialTraceViewState(), { type: 'open-search' }, { type: 'set-query', query: 'x' })
    expect(traceViewReducer(state, { type: 'next-match', total: 0 })).toBe(state)
    expect(traceViewReducer(state, { type: 'prev-match', total: 0 })).toBe(state)
  })
})

describe('traceMatches', () => {
  const payload = payloadOf([
    callWith(USER('fix the login bug'), [...ASSISTANT('I will check the login flow'), textBlock('tool-call', 'grep login src')]),
    callWith(
      [textBlock('tool-result', 'login.ts:12'), textBlock('user', 'now the logout bug')],
      [textBlock('thinking', 'the logout flow shares the login token cache'), ...ASSISTANT('Logout fixed.')]
    )
  ])

  it('empty/blank query matches nothing (count 0/0)', () => {
    expect(traceMatches(payload.calls, initialTraceViewState().visible, '')).toEqual([])
    expect(traceMatches(payload.calls, initialTraceViewState().visible, '   ')).toEqual([])
  })

  it('matches are case-insensitive substrings of the block text, in document order', () => {
    const matches = traceMatches(payload.calls, initialTraceViewState().visible, 'LOGOUT')
    expect(matches.map((m) => m.key)).toEqual([
      traceBlockKey('msg-2', 'input', 1),
      traceBlockKey('msg-2', 'output', 0),
      traceBlockKey('msg-2', 'output', 1)
    ])
  })

  it('hidden kinds drop their blocks from the match list', () => {
    const hiddenThinking = reduced(initialTraceViewState(), { type: 'toggle-kind', kind: 'thinking' })
    const matches = traceMatches(payload.calls, hiddenThinking.visible, 'logout')
    expect(matches.map((m) => m.key)).toEqual([traceBlockKey('msg-2', 'input', 1), traceBlockKey('msg-2', 'output', 1)])
  })

  it('every key the selector emits is a key traceAllBlockKeys also lists (scroll always lands)', () => {
    const all = new Set(traceAllBlockKeys(payload.calls))
    for (const needle of ['login', 'logout', 'token', 'grep']) {
      for (const match of traceMatches(payload.calls, initialTraceViewState().visible, needle)) {
        expect(all.has(match.key)).toBe(true)
      }
    }
  })
})

describe('traceAllBlockKeys', () => {
  it('lists every block of every call in document order, input before output', () => {
    const payload = payloadOf([
      callWith(USER('one'), ASSISTANT('two')),
      callWith([textBlock('tool-result', 'r')], [textBlock('tool-call', 'c')])
    ])
    expect(traceAllBlockKeys(payload.calls)).toEqual([
      traceBlockKey('msg-1', 'input', 0),
      traceBlockKey('msg-1', 'output', 0),
      traceBlockKey('msg-2', 'input', 0),
      traceBlockKey('msg-2', 'output', 0)
    ])
  })
})

describe('formatMatchCount', () => {
  it.each([
    [0, 0, '0/0'],
    [0, 5, '1/5'],
    [4, 5, '5/5']
  ])('renders %i/%i as %s (1-based current, total)', (index, total, expected) => {
    expect(formatMatchCount(index, total)).toBe(expected)
  })
})
