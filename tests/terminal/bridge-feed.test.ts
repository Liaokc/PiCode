import { describe, expect, it } from 'vitest'
import type { HostToParent } from '../../src/shared/contract'
import {
  MAX_FEED_ENTRIES,
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

/** Ticket 20: the supervisor wraps session-scoped events for session `id`. */
function wrapped(sessionId: string, event: HostToParent): HostToParent {
  return { type: 'session_event', sessionId, event: event as never }
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
      { toolCallId: 't1', sessionId: null, command: 'npm test', status: 'running', output: '' }
    ])
  })

  it('unwraps supervisor-wrapped events and tags the entry with its session', () => {
    const state = fold([wrapped('s1', bashStart('t1', 'npm test')), wrapped('s1', bashUpdate('t1', 'running\n'))])

    expect(state.entries).toEqual([
      { toolCallId: 't1', sessionId: 's1', command: 'npm test', status: 'running', output: 'running\n' }
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

  it('ignores non-bash tools entirely (wrapped or not)', () => {
    const state = fold([
      { type: 'tool_start', toolCallId: 'r1', name: 'read', args: { path: '/tmp/x' } },
      wrapped('s1', { type: 'tool_start', toolCallId: 'r2', name: 'read', args: { path: '/tmp/y' } }),
      wrapped('s1', { type: 'tool_update', toolCallId: 'r2', partial: 'contents' })
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

describe('bridge feed — session scope (ticket 20 registry stream)', () => {
  it('does NOT reset on session_created: background sessions keep running and their entries stay', () => {
    const running = fold([wrapped('s1', bashStart('t1', 'sleep 100'))])
    const next = projectBridgeFeed(
      running,
      wrapped('s2', { type: 'session_created', sessionId: 's2', cwd: '/tmp', model: null })
    )

    expect(next.entries).toHaveLength(1)
    expect(next.entries[0].status).toBe('running')
  })

  it('settles only the owning session\u0027s running entries when its run ends', () => {
    const state = fold([
      wrapped('s1', bashStart('t1', 'sleep 100')),
      wrapped('s2', bashStart('t2', 'sleep 200')),
      wrapped('s1', { type: 'agent_end' })
    ])

    expect(state.entries.map((e) => [e.toolCallId, e.status])).toEqual([
      ['t1', 'interrupted'],
      ['t2', 'running']
    ])
  })

  it('settles per session on turn errors and host death (wrapped)', () => {
    const errored = fold([wrapped('s1', bashStart('t1', 'sleep 100')), wrapped('s1', { type: 'turn_error', message: 'boom' })])
    expect(errored.entries[0].status).toBe('interrupted')

    const died = fold([wrapped('s1', bashStart('t1', 'sleep 100')), wrapped('s1', { type: 'host_exit', clean: false, code: 1, signal: null })])
    expect(died.entries[0].status).toBe('interrupted')

    // A late end for a settled id changes nothing.
    const late = projectBridgeFeed(errored, wrapped('s1', bashEnd('t1', 'late', false)))
    expect(late).toBe(errored)
  })

  it('unwrapped lifecycle events settle EVERYTHING (legacy single-session shape)', () => {
    const state = fold([
      wrapped('s1', bashStart('t1', 'sleep 100')),
      bashStart('t2', 'sleep 200'),
      { type: 'agent_end' }
    ])

    expect(state.entries.map((e) => e.status)).toEqual(['interrupted', 'interrupted'])
  })

  it('caps the feed length, dropping the oldest entries', () => {
    let state = initialBridgeFeedState
    for (let i = 0; i < MAX_FEED_ENTRIES + 10; i++) {
      state = projectBridgeFeed(state, bashStart(`t${i}`, `cmd ${i}`))
      state = projectBridgeFeed(state, bashEnd(`t${i}`, 'ok\n'))
    }

    expect(state.entries).toHaveLength(MAX_FEED_ENTRIES)
    expect(state.entries[0].toolCallId).toBe('t10')
    expect(state.entries[state.entries.length - 1].toolCallId).toBe(`t${MAX_FEED_ENTRIES + 9}`)
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
      { type: 'session_tree', tree: { sessionId: 's', leafId: 'l', name: null, nodes: [] } },
      wrapped('s1', { type: 'text_delta', delta: 'wrapped hello' }),
      { type: 'session_detached' }
    ]
    let state = initialBridgeFeedState
    for (const event of events) state = projectBridgeFeed(state, event)

    expect(state).toBe(initialBridgeFeedState)
  })

  it('never mutates the previous state', () => {
    const frozen = Object.freeze({
      entries: Object.freeze([{ toolCallId: 't1', sessionId: null, command: 'x', status: 'running', output: '' }])
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
