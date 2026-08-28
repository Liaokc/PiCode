/**
 * Seam-3 tests for the Bridge projector (CONTEXT.md: 桥接 — the one-way
 * observation channel that projects agent bash commands + output into the
 * terminal tab). The projector is a pure function over the Seam-1 contract
 * event stream: HostToParent in, display frames out. There is no input path —
 * frames are the ONLY thing it produces, so user keystrokes can never reach
 * the agent's execution stream.
 */
import { describe, expect, it } from 'vitest'
import type { HostToParent } from '../../src/shared/contract'
import {
  initialBridgeProjectorState,
  projectBridgeEvent,
  sanitizeBridgeCommand
} from '../../src/shared/bridge/projector'

function bashStart(id: string, command: string): HostToParent {
  return { type: 'tool_start', toolCallId: id, name: 'bash', args: { command } }
}

function bashUpdate(id: string, partial: string): HostToParent {
  return { type: 'tool_update', toolCallId: id, partial }
}

function bashEnd(id: string, output: string, isError = false): HostToParent {
  return { type: 'tool_end', toolCallId: id, output, isError }
}

function project(events: HostToParent[]): { frames: string[]; streamed: Record<string, number> } {
  let state = initialBridgeProjectorState
  const frames: string[] = []
  for (const event of events) {
    const result = projectBridgeEvent(state, event)
    state = result.state
    frames.push(...result.frames)
  }
  return { frames, streamed: { ...state.streamed } }
}

describe('bridge projector — 投屏 (projection)', () => {
  it('opens a command frame when a bash tool call starts', () => {
    const { frames } = project([bashStart('t1', 'npm test')])

    expect(frames).toHaveLength(1)
    expect(frames[0]).toContain('$ npm test')
  })

  it('streams partial output as it arrives', () => {
    const { frames } = project([bashStart('t1', 'npm test'), bashUpdate('t1', 'running suite A\n')])

    expect(frames[1]).toBe('running suite A\n')
  })

  it('collapses multi-line commands into one sanitized header line', () => {
    const { frames } = project([
      bashStart('t1', 'echo one\necho two\x1b[31m-red\u0007')
    ])

    // Frame shape: CRLF + exactly one line + CRLF (no interior line breaks).
    expect(frames[0].startsWith('\r\n')).toBe(true)
    expect(frames[0].endsWith('\r\n')).toBe(true)
    expect(frames[0].slice(2, -2)).not.toMatch(/[\r\n]/)
    expect(frames[0]).toContain('echo one echo two-red')
  })

  it('ignores non-bash tools entirely', () => {
    const events: HostToParent[] = [
      { type: 'tool_start', toolCallId: 'r1', name: 'read', args: { path: '/tmp/x' } },
      { type: 'tool_update', toolCallId: 'r1', partial: 'contents' },
      { type: 'tool_end', toolCallId: 'r1', output: 'contents', isError: false }
    ]
    const { frames, streamed } = project(events)

    expect(frames).toEqual([])
    expect(streamed).toEqual({})
  })

  it('prints the unseen tail of the final output, then a done status', () => {
    const { frames } = project([
      bashStart('t1', 'echo abcdef'),
      bashUpdate('t1', 'abc'),
      bashEnd('t1', 'abcdef')
    ])

    const tail = frames[frames.length - 2]
    const status = frames[frames.length - 1]
    expect(tail).toBe('def\r\n')
    expect(status).toContain('✓ done')
    expect(status).not.toContain('✗')
  })

  it('prints the whole final output when no partials ever streamed', () => {
    const { frames } = project([bashStart('t1', 'true'), bashEnd('t1', 'late result\n')])

    expect(frames).toHaveLength(3) // command header, unseen tail, status
    expect(frames[1]).toBe('late result\n')
    expect(frames[2]).toContain('✓ done')
  })

  it('does not repeat already-streamed output on success', () => {
    const { frames } = project([
      bashStart('t1', 'seq 3'),
      bashUpdate('t1', '1\n2\n3\n'),
      bashEnd('t1', '1\n2\n3\n')
    ])

    expect(frames.filter((f) => f.includes('1\n')).length).toBeLessThanOrEqual(1)
    expect(frames[frames.length - 1]).toContain('✓ done')
  })
})

describe('bridge projector — 结束状态 (end states)', () => {
  it('marks a failed command with a visible failed status', () => {
    const { frames } = project([bashStart('t1', 'exit 3'), bashEnd('t1', '', true)])

    const status = frames[frames.length - 1]
    expect(status).toContain('✗ failed')
  })

  it('surfaces the unseen error tail of a failed command', () => {
    const { frames } = project([
      bashStart('t1', 'make'),
      bashUpdate('t1', 'building…\n'),
      bashEnd('t1', 'building…\nerror: boom\n', true)
    ])

    expect(frames).toContain('error: boom\n')
    expect(frames[frames.length - 1]).toContain('✗ failed')
  })

  it('interrupts still-active calls when the session is replaced', () => {
    const { frames, streamed } = project([bashStart('t1', 'sleep 100'), { type: 'session_created', sessionId: 's2', cwd: '/tmp', model: null }])

    expect(frames[frames.length - 1]).toContain('✗ interrupted')
    expect(streamed).toEqual({})
  })

  it('settles still-active calls when the agent run ends', () => {
    const { frames, streamed } = project([
      bashStart('t1', 'sleep 100'),
      { type: 'agent_end' }
    ])

    expect(frames[frames.length - 1]).toContain('✗ interrupted')
    expect(streamed).toEqual({})
  })

  it('settles still-active calls when the run errors or the host dies', () => {
    const runError = project([bashStart('t1', 'sleep 100'), { type: 'turn_error', message: 'boom' }])
    expect(runError.frames[runError.frames.length - 1]).toContain('✗ interrupted')
    expect(runError.streamed).toEqual({})

    const hostDied = project([
      bashStart('t1', 'sleep 100'),
      { type: 'host_exit', clean: false, code: 1, signal: null }
    ])
    expect(hostDied.frames[hostDied.frames.length - 1]).toContain('✗ interrupted')
    expect(hostDied.streamed).toEqual({})

    // After settling, a late end for the stale id stays silent.
    const { frames } = project([
      bashStart('t1', 'sleep 100'),
      { type: 'turn_error', message: 'boom' },
      bashEnd('t1', 'late', false)
    ])
    expect(frames.filter((f) => f.includes('late'))).toEqual([])
  })
})

describe('bridge projector — robustness', () => {
  it('tracks interleaved calls by tool id and ends each exactly once', () => {
    const { frames, streamed } = project([
      bashStart('a', 'echo A'),
      bashStart('b', 'echo B'),
      bashUpdate('a', 'A-out '),
      bashUpdate('b', 'B-out '),
      bashEnd('a', 'A-out A-tail'),
      bashEnd('b', 'B-out B-tail')
    ])

    const joined = frames.join('')
    expect(joined).toContain('A-tail')
    expect(joined).toContain('B-tail')
    expect(joined.indexOf('✓ done')).toBeLessThan(joined.lastIndexOf('✓ done'))
    expect(streamed).toEqual({})
  })

  it('ignores tool events for ids it never saw (mid-run attach)', () => {
    const { frames, streamed } = project([bashUpdate('ghost', 'zzz'), bashEnd('ghost', 'zzz')])

    expect(frames).toEqual([])
    expect(streamed).toEqual({})
  })

  it('passes chat noise through without frames', () => {
    const events: HostToParent[] = [
      { type: 'agent_start' },
      { type: 'text_delta', delta: 'hello' },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'hmm' },
      { type: 'session_tree', tree: { sessionId: 's', leafId: 'l', name: null, nodes: [] } }
    ]
    const { frames } = project(events)

    expect(frames).toEqual([])
  })

  it('sanitizes control characters in commands but keeps real output raw', () => {
    // The command header is sanitized; the frame's own dim styling is
    // intentional ANSI, so assert on the sanitized command text instead.
    expect(sanitizeBridgeCommand('printf\x1b]0;title')).toBe('printf')
    expect(sanitizeBridgeCommand('echo one\necho two')).toBe('echo one echo two')

    const { frames } = project([bashStart('t1', 'printf\x1b]0;title'), bashUpdate('t1', '\x1b[31mred\x1b[0m')])
    // Real command OUTPUT passes through untouched.
    expect(frames[1]).toBe('\x1b[31mred\x1b[0m')
  })
})
