import { describe, expect, it } from 'vitest'
import type { HostToParent } from '../../src/shared/contract'
import {
  initialBridgeFeedState,
  projectBridgeFeed,
  sanitizeBridgeCommand,
  type BridgeFeedState
} from '../../src/shared/bridge/feed'

function bashStart(id: string, command: string): HostToParent {
  return { type: 'tool_start', toolCallId: id, name: 'bash', args: { command } }
}

function bashUpdate(id: string, partial: string): HostToParent {
  return { type: 'tool_update', toolCallId: id, partial }
}

function bashEnd(id: string, output: string, isError = false): HostToParent {
  return { type: 'tool_end', toolCallId: id, output, isError }
}

function fold(events: HostToParent[]): BridgeFeedState {
  let state = initialBridgeFeedState
  for (const event of events) state = projectBridgeFeed(state, event)
  return state
}

describe('bridge feed — command entries', () => {
  it('opens a running entry when a bash tool call starts', () => {
    const state = fold([bashStart('t1', 'npm test')])

    expect(state.entries).toEqual([
      { toolCallId: 't1', command: 'npm test', status: 'running', output: '' }
    ])
  })

  it('accumulates streamed partial output into the live entry', () => {
    const state = fold([bashStart('t1', 'npm test'), bashUpdate('t1', 'running suite A\n')])

    expect(state.entries).toHaveLength(1)
    expect(state.entries[0].status).toBe('running')
    expect(state.entries[0].output).toBe('running suite A\n')
  })

  it('collapses multi-line commands into one sanitized header line', () => {
    const state = fold([bashStart('t1', 'echo one\necho two\x1b[31m-red\u0007')])

    expect(state.entries[0].command).toBe('echo one echo two-red')
    expect(state.entries[0].command).not.toMatch(/[\r\n]/)
  })

  it('ignores non-bash tools entirely', () => {
    const state = fold([
      { type: 'tool_start', toolCallId: 'r1', name: 'read', args: { path: '/tmp/x' } },
      { type: 'tool_update', toolCallId: 'r1', partial: 'contents' },
      { type: 'tool_end', toolCallId: 'r1', output: 'contents', isError: false }
    ])

    expect(state.entries).toEqual([])
  })
})

describe('bridge feed — completion', () => {
  it('appends the unseen tail of the final output, then settles as done', () => {
    const state = fold([bashStart('t1', 'echo abcdef'), bashUpdate('t1', 'abc'), bashEnd('t1', 'abcdef')])

    expect(state.entries[0].status).toBe('done')
    expect(state.entries[0].output).toBe('abcdef\n')
  })

  it('appends the whole final output when no partials ever streamed', () => {
    const state = fold([bashStart('t1', 'true'), bashEnd('t1', 'late result\n')])

    expect(state.entries[0].status).toBe('done')
    expect(state.entries[0].output).toBe('late result\n')
  })

  it('does not repeat already-streamed output on success', () => {
    const state = fold([bashStart('t1', 'seq 3'), bashUpdate('t1', '1\n2\n3\n'), bashEnd('t1', '1\n2\n3\n')])

    expect(state.entries[0].output).toBe('1\n2\n3\n')
    expect(state.entries[0].status).toBe('done')
  })

  it('marks a failed command and surfaces its unseen error tail', () => {
    const state = fold([
      bashStart('t1', 'make'),
      bashUpdate('t1', 'building…\n'),
      bashEnd('t1', 'building…\nerror: boom\n', true)
    ])

    expect(state.entries[0].status).toBe('failed')
    expect(state.entries[0].output).toContain('error: boom')
  })

  it('keeps a trailing newline on tails that lack one', () => {
    const state = fold([bashStart('t1', 'true'), bashEnd('t1', 'no newline tail')])

    expect(state.entries[0].output.endsWith('\n')).toBe(true)
  })
})

describe('bridge feed — session & run boundaries', () => {
  it('resets the feed when a new session is created (per-session history)', () => {
    const settled = fold([bashStart('t1', 'echo A'), bashEnd('t1', 'A\n')])
    const next = projectBridgeFeed(settled, { type: 'session_created', sessionId: 's2', cwd: '/tmp', model: null })

    expect(next).toBe(initialBridgeFeedState)
  })

  it('settles still-running entries as interrupted when the agent run ends', () => {
    const state = fold([bashStart('t1', 'sleep 100'), { type: 'agent_end' }])

    expect(state.entries[0].status).toBe('interrupted')
  })

  it('settles running entries on turn errors and host death, ignoring late events', () => {
    const errored = fold([bashStart('t1', 'sleep 100'), { type: 'turn_error', message: 'boom' }])
    expect(errored.entries[0].status).toBe('interrupted')

    const died = fold([bashStart('t1', 'sleep 100'), { type: 'host_exit', clean: false, code: 1, signal: null }])
    expect(died.entries[0].status).toBe('interrupted')

    // After settling, a late end for the stale id changes nothing.
    const late = projectBridgeFeed(errored, bashEnd('t1', 'late', false))
    expect(late).toBe(errored)
  })
})

describe('bridge feed — robustness & purity', () => {
  it('tracks interleaved calls by tool id and ends each exactly once', () => {
    const state = fold([
      bashStart('a', 'echo A'),
      bashStart('b', 'echo B'),
      bashUpdate('a', 'A-out '),
      bashUpdate('b', 'B-out '),
      bashEnd('a', 'A-out A-tail'),
      bashEnd('b', 'B-out B-tail')
    ])

    expect(state.entries.map((e) => [e.command, e.status, e.output])).toEqual([
      ['echo A', 'done', 'A-out A-tail\n'],
      ['echo B', 'done', 'B-out B-tail\n']
    ])
  })

  it('ignores tool events for ids it never saw (mid-run attach)', () => {
    const state = fold([bashUpdate('ghost', 'zzz'), bashEnd('ghost', 'zzz')])

    expect(state.entries).toEqual([])
  })

  it('passes chat noise through without touching state', () => {
    const events: HostToParent[] = [
      { type: 'agent_start' },
      { type: 'text_delta', delta: 'hello' },
      { type: 'thinking_delta', delta: 'hmm' },
      { type: 'session_tree', tree: { sessionId: 's', leafId: 'l', name: null, nodes: [] } }
    ]
    let state = initialBridgeFeedState
    for (const event of events) state = projectBridgeFeed(state, event)

    expect(state).toBe(initialBridgeFeedState)
  })

  it('never mutates the previous state', () => {
    const frozen = Object.freeze({
      entries: Object.freeze([{ toolCallId: 't1', command: 'x', status: 'running', output: '' }])
    }) as unknown as BridgeFeedState
    const next = projectBridgeFeed(frozen, bashUpdate('t1', 'more'))
    expect(next).not.toBe(frozen)
    expect(frozen.entries[0].output).toBe('')
  })
})

describe('sanitizeBridgeCommand', () => {
  it('strips ANSI escapes and control characters, caps the length', () => {
    expect(sanitizeBridgeCommand('printf\x1b]0;title')).toBe('printf')
    expect(sanitizeBridgeCommand('echo one\necho two')).toBe('echo one echo two')
    expect(sanitizeBridgeCommand('x'.repeat(300))).toHaveLength(160)
    expect(sanitizeBridgeCommand('x'.repeat(300)).endsWith('…')).toBe(true)
  })
})
