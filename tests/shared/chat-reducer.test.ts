import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState, type ChatState } from '../../src/shared/chat-reducer'
import type { HostToParent } from '../../src/shared/contract'

const SESSION_CREATED: HostToParent = {
  type: 'session_created',
  sessionId: 's-1',
  cwd: '/tmp/proj',
  model: 'claude-opus-4-5'
}

function run(state: ChatState, ...events: HostToParent[]): ChatState {
  return events.reduce((acc, event) => chatReducer(acc, event), state)
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.values(value)) deepFreeze(key)
    Object.freeze(value)
  }
  return value
}

/** A complete one-turn streaming exchange ending in a settled state. */
function streamedTurn(text: string): HostToParent[] {
  return [
    { type: 'user_message', text: 'hello' },
    { type: 'agent_start' },
    { type: 'message_start' },
    { type: 'text_delta', delta: 'Hel' },
    { type: 'text_delta', delta: text },
    { type: 'message_end' },
    { type: 'agent_end' }
  ]
}

describe('chatReducer — session lifecycle', () => {
  it('starts with no session, no messages, no error', () => {
    expect(initialChatState()).toEqual({
      session: null,
      messages: [],
      agentRunning: false,
      error: null
    })
  })

  it('session_created installs the session and clears stale state', () => {
    const state = run(initialChatState(), { type: 'session_error', message: 'boom' }, SESSION_CREATED)
    expect(state.session).toEqual({ sessionId: 's-1', cwd: '/tmp/proj', model: 'claude-opus-4-5' })
    expect(state.messages).toEqual([])
    expect(state.agentRunning).toBe(false)
    expect(state.error).toBeNull()
  })

  it('session_created replaces an existing session with a fresh transcript (rebuild)', () => {
    const afterCrash = run(
      initialChatState(),
      SESSION_CREATED,
      ...streamedTurn(' there'),
      { type: 'host_exit', clean: false, code: 1, signal: null }
    )
    const rebuilt = chatReducer(afterCrash, { ...SESSION_CREATED, sessionId: 's-2' })
    expect(rebuilt.session?.sessionId).toBe('s-2')
    expect(rebuilt.messages).toEqual([])
    expect(rebuilt.error).toBeNull()
    expect(rebuilt.agentRunning).toBe(false)
  })

  it('session_error records a session-kind error and leaves no usable session', () => {
    const state = chatReducer(initialChatState(), { type: 'session_error', message: 'no auth' })
    expect(state.session).toBeNull()
    expect(state.error).toEqual({ kind: 'session', message: 'no auth' })
  })
})

describe('chatReducer — streaming turn', () => {
  it('user_message appends a user message', () => {
    const state = run(initialChatState(), SESSION_CREATED, { type: 'user_message', text: 'hi there' })
    expect(state.messages).toEqual([{ id: 'm0', role: 'user', text: 'hi there', streaming: false }])
  })

  it('streams text deltas into one assistant message and settles on agent_end', () => {
    const state = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    expect(state.messages).toEqual([
      { id: 'm0', role: 'user', text: 'hello', streaming: false },
      { id: 'm1', role: 'assistant', text: 'Hel there', streaming: false }
    ])
    expect(state.agentRunning).toBe(false)
    expect(state.error).toBeNull()
  })

  it('agent_start flags the run and is idempotent', () => {
    const once = chatReducer(initialChatState(), { type: 'agent_start' })
    expect(once.agentRunning).toBe(true)
    expect(chatReducer(once, { type: 'agent_start' })).toBe(once)
  })

  it('message_start opens an empty streaming assistant message', () => {
    const state = run(initialChatState(), SESSION_CREATED, { type: 'user_message', text: 'q' }, { type: 'message_start' })
    expect(state.messages[1]).toEqual({ id: 'm1', role: 'assistant', text: '', streaming: true })
    expect(state.agentRunning).toBe(false) // only agent_start owns the running flag
  })

  it('text_delta without an open message defensively opens one', () => {
    const state = chatReducer(initialChatState(), { type: 'text_delta', delta: 'orphan' })
    expect(state.messages).toEqual([{ id: 'm0', role: 'assistant', text: 'orphan', streaming: true }])
  })

  it('message_end closes the open streaming message', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'text_delta', delta: 'partial' },
      { type: 'message_end' }
    )
    expect(state.messages[0]).toEqual({ id: 'm0', role: 'assistant', text: 'partial', streaming: false })
  })

  it('message_end on a settled transcript is a no-op', () => {
    const settled = run(initialChatState(), { type: 'message_start' }, { type: 'text_delta', delta: 'x' }, { type: 'message_end' })
    expect(chatReducer(settled, { type: 'message_end' })).toBe(settled)
  })

  it('agent_end finalizes messages still marked streaming', () => {
    const state = run(
      initialChatState(),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'cut short' },
      { type: 'agent_end' }
    )
    expect(state.agentRunning).toBe(false)
    expect(state.messages[0]).toEqual({ id: 'm0', role: 'assistant', text: 'cut short', streaming: false })
  })

  it('supports a second turn after the first settles', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      ...streamedTurn(' there'),
      { type: 'user_message', text: 'again' },
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'round two' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    expect(state.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'hello'],
      ['assistant', 'Hel there'],
      ['user', 'again'],
      ['assistant', 'round two']
    ])
    expect(state.agentRunning).toBe(false)
  })
})

describe('chatReducer — errors', () => {
  it('turn_error surfaces an agent error, stops the run, keeps partial text', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'user_message', text: 'q' },
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'partial out' },
      { type: 'turn_error', message: 'rate limited' }
    )
    expect(state.error).toEqual({ kind: 'agent', message: 'rate limited' })
    expect(state.agentRunning).toBe(false)
    expect(state.messages[1]).toEqual({ id: 'm1', role: 'assistant', text: 'partial out', streaming: false })
    expect(state.session).toEqual({ sessionId: 's-1', cwd: '/tmp/proj', model: 'claude-opus-4-5' })
  })

  it('host_exit crash clears the session, carries the cwd, keeps the transcript', () => {
    const beforeCrash = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    const state = chatReducer(beforeCrash, { type: 'host_exit', clean: false, code: 1, signal: null })
    expect(state.session).toBeNull()
    expect(state.error).toEqual({ kind: 'host', message: 'Agent host exited unexpectedly (exit code 1).', cwd: '/tmp/proj' })
    expect(state.messages).toHaveLength(2)
    expect(state.agentRunning).toBe(false)
  })

  it('host_exit crash reports a signal when the process was killed', () => {
    const beforeCrash = run(initialChatState(), SESSION_CREATED, { type: 'user_message', text: 'q' })
    const state = chatReducer(beforeCrash, { type: 'host_exit', clean: false, code: null, signal: 'SIGKILL' })
    expect(state.error).toEqual({ kind: 'host', message: 'Agent host exited unexpectedly (SIGKILL).', cwd: '/tmp/proj' })
  })

  it('host_exit crash without a session carries cwd null', () => {
    const state = chatReducer(initialChatState(), { type: 'host_exit', clean: false, code: 2, signal: null })
    expect(state.error).toEqual({ kind: 'host', message: 'Agent host exited unexpectedly (exit code 2).', cwd: null })
  })

  it('clean host_exit just detaches the session without an error banner', () => {
    const before = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    const state = chatReducer(before, { type: 'host_exit', clean: true, code: 0, signal: null })
    expect(state.session).toBeNull()
    expect(state.error).toBeNull()
    expect(state.messages).toHaveLength(2)
  })
})

describe('chatReducer — purity', () => {
  it('is deterministic: identical event sequences produce identical states', () => {
    const a = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    const b = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    expect(a).toEqual(b)
  })

  it('never mutates the incoming state or its nested data', () => {
    const frozen = deepFreeze(run(initialChatState(), SESSION_CREATED, { type: 'user_message', text: 'q' }))
    expect(() =>
      run(frozen, { type: 'agent_start' }, { type: 'message_start' }, { type: 'text_delta', delta: 'x' })
    ).not.toThrow()
  })
})
