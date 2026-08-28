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

const TOOL_START: HostToParent = {
  type: 'tool_start',
  toolCallId: 'tc-1',
  name: 'bash',
  args: { command: 'npm test' }
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
  it('starts with no session, no entries, no error', () => {
    expect(initialChatState()).toEqual({
      session: null,
      entries: [],
      agentRunning: false,
      error: null
    })
  })

  it('session_created installs the session and clears stale state', () => {
    const state = run(initialChatState(), { type: 'session_error', message: 'boom' }, SESSION_CREATED)
    expect(state.session).toEqual({ sessionId: 's-1', cwd: '/tmp/proj', model: 'claude-opus-4-5' })
    expect(state.entries).toEqual([])
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
    expect(rebuilt.entries).toEqual([])
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
  it('user_message appends a user entry', () => {
    const state = run(initialChatState(), SESSION_CREATED, { type: 'user_message', text: 'hi there' })
    expect(state.entries).toEqual([{ id: 'm0', role: 'user', text: 'hi there' }])
  })

  it('streams text deltas into one assistant entry and settles on agent_end', () => {
    const state = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    expect(state.entries).toEqual([
      { id: 'm0', role: 'user', text: 'hello' },
      { id: 'm1', role: 'assistant', parts: [{ kind: 'text', text: 'Hel there' }], streaming: false }
    ])
    expect(state.agentRunning).toBe(false)
    expect(state.error).toBeNull()
  })

  it('agent_start flags the run and is idempotent', () => {
    const once = chatReducer(initialChatState(), { type: 'agent_start' })
    expect(once.agentRunning).toBe(true)
    expect(chatReducer(once, { type: 'agent_start' })).toBe(once)
  })

  it('message_start opens an empty streaming assistant entry', () => {
    const state = run(initialChatState(), SESSION_CREATED, { type: 'user_message', text: 'q' }, { type: 'message_start' })
    expect(state.entries[1]).toEqual({ id: 'm1', role: 'assistant', parts: [], streaming: true })
    expect(state.agentRunning).toBe(false) // only agent_start owns the running flag
  })

  it('text_delta without an open entry defensively opens one', () => {
    const state = chatReducer(initialChatState(), { type: 'text_delta', delta: 'orphan' })
    expect(state.entries).toEqual([
      { id: 'm0', role: 'assistant', parts: [{ kind: 'text', text: 'orphan' }], streaming: true }
    ])
  })

  it('text_delta after a closed entry starts a new assistant entry', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'text_delta', delta: 'first' },
      { type: 'message_end' },
      { type: 'text_delta', delta: 'second' }
    )
    expect(state.entries).toHaveLength(2)
    expect(state.entries[1]).toEqual({
      id: 'm1',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'second' }],
      streaming: true
    })
  })

  it('message_end closes the open streaming entry', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'text_delta', delta: 'partial' },
      { type: 'message_end' }
    )
    expect(state.entries[0]).toEqual({
      id: 'm0',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'partial' }],
      streaming: false
    })
  })

  it('message_end on a settled transcript is a no-op', () => {
    const settled = run(initialChatState(), { type: 'message_start' }, { type: 'text_delta', delta: 'x' }, { type: 'message_end' })
    expect(chatReducer(settled, { type: 'message_end' })).toBe(settled)
  })

  it('agent_end finalizes entries still marked streaming', () => {
    const state = run(
      initialChatState(),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'cut short' },
      { type: 'agent_end' }
    )
    expect(state.agentRunning).toBe(false)
    expect(state.entries[0]).toEqual({
      id: 'm0',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'cut short' }],
      streaming: false
    })
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
    expect(state.entries.map((e) => [e.role, e.role === 'user' ? e.text : e.role === 'assistant' ? e.parts : null])).toEqual([
      ['user', 'hello'],
      ['assistant', [{ kind: 'text', text: 'Hel there' }]],
      ['user', 'again'],
      ['assistant', [{ kind: 'text', text: 'round two' }]]
    ])
    expect(state.agentRunning).toBe(false)
  })
})

describe('chatReducer — thinking blocks', () => {
  it('thinking_delta opens a streaming thinking part inside the open assistant entry', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'Let me think' }
    )
    expect(state.entries[0]).toEqual({
      id: 'm0',
      role: 'assistant',
      parts: [{ kind: 'thinking', text: 'Let me think', streaming: true, durationMs: null }],
      streaming: true
    })
  })

  it('further thinking_deltas accumulate into the same part', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'a' },
      { type: 'thinking_delta', delta: 'b' },
      { type: 'thinking_delta', delta: 'c' }
    )
    const parts = state.entries[0].role === 'assistant' ? state.entries[0].parts : []
    expect(parts).toEqual([{ kind: 'thinking', text: 'abc', streaming: true, durationMs: null }])
  })

  it('thinking_end closes the thinking part with its measured duration', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'reasoning…' },
      { type: 'thinking_end', durationMs: 29_000 }
    )
    // The assistant entry itself is still open — text may follow.
    expect(state.entries[0]).toEqual({
      id: 'm0',
      role: 'assistant',
      parts: [{ kind: 'thinking', text: 'reasoning…', streaming: false, durationMs: 29_000 }],
      streaming: true
    })
  })

  it('thinking_end with no open thinking part is a no-op (same state)', () => {
    const state = run(initialChatState(), { type: 'message_start' }, { type: 'text_delta', delta: 'plain' })
    expect(chatReducer(state, { type: 'thinking_end', durationMs: 5_000 })).toBe(state)
  })

  it('thinking_delta without an open assistant entry defensively opens one', () => {
    const state = chatReducer(initialChatState(), { type: 'thinking_delta', delta: 'orphan thought' })
    expect(state.entries).toEqual([
      {
        id: 'm0',
        role: 'assistant',
        parts: [{ kind: 'thinking', text: 'orphan thought', streaming: true, durationMs: null }],
        streaming: true
      }
    ])
  })

  it('text_delta after thinking closes the open thinking part and appends a text part', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'hmm' },
      { type: 'text_delta', delta: 'answer' }
    )
    expect(state.entries[0]).toEqual({
      id: 'm0',
      role: 'assistant',
      parts: [
        { kind: 'thinking', text: 'hmm', streaming: false, durationMs: null },
        { kind: 'text', text: 'answer' }
      ],
      streaming: true
    })
  })

  it('message_end closes a thinking part that never saw thinking_end', () => {
    const state = run(
      initialChatState(),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'cut' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    expect(state.entries[0]).toEqual({
      id: 'm0',
      role: 'assistant',
      parts: [{ kind: 'thinking', text: 'cut', streaming: false, durationMs: null }],
      streaming: false
    })
  })

  it('supports two thinking blocks in one entry (interleaved with text)', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'first pass' },
      { type: 'thinking_end', durationMs: 1_000 },
      { type: 'text_delta', delta: 'draft' },
      { type: 'thinking_delta', delta: 'revisit' },
      { type: 'thinking_end', durationMs: 2_000 },
      { type: 'text_delta', delta: ' final' }
    )
    expect(state.entries[0]).toEqual({
      id: 'm0',
      role: 'assistant',
      parts: [
        { kind: 'thinking', text: 'first pass', streaming: false, durationMs: 1_000 },
        { kind: 'text', text: 'draft' },
        { kind: 'thinking', text: 'revisit', streaming: false, durationMs: 2_000 },
        { kind: 'text', text: ' final' }
      ],
      streaming: true
    })
  })
})

describe('chatReducer — tool calls', () => {
  it('tool_start appends a running tool entry', () => {
    const state = run(initialChatState(), SESSION_CREATED, { type: 'message_start' }, { type: 'message_end' }, TOOL_START)
    expect(state.entries[1]).toEqual({
      id: 'tc-1',
      role: 'tool',
      name: 'bash',
      args: { command: 'npm test' },
      state: 'running',
      output: ''
    })
  })

  it('tool_start works with no assistant entry in the transcript (defensive)', () => {
    const state = chatReducer(initialChatState(), TOOL_START)
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({ id: 'tc-1', role: 'tool', state: 'running' })
  })

  it('tool_update appends partial output to the matching entry', () => {
    const state = run(initialChatState(), TOOL_START, { type: 'tool_update', toolCallId: 'tc-1', partial: 'line 1\n' })
    expect(state.entries[0]).toMatchObject({ id: 'tc-1', state: 'running', output: 'line 1\n' })
    const state2 = run(state, { type: 'tool_update', toolCallId: 'tc-1', partial: 'line 2' })
    expect(state2.entries[0]).toMatchObject({ output: 'line 1\nline 2' })
  })

  it('tool_update for an unknown tool call is a no-op (same state)', () => {
    const state = run(initialChatState(), TOOL_START)
    expect(chatReducer(state, { type: 'tool_update', toolCallId: 'nope', partial: 'x' })).toBe(state)
  })

  it('tool_end marks the card done and installs the final full output', () => {
    const state = run(
      initialChatState(),
      TOOL_START,
      { type: 'tool_update', toolCallId: 'tc-1', partial: 'partial…' },
      { type: 'tool_end', toolCallId: 'tc-1', output: 'all tests passed', isError: false }
    )
    expect(state.entries[0]).toEqual({
      id: 'tc-1',
      role: 'tool',
      name: 'bash',
      args: { command: 'npm test' },
      state: 'done',
      output: 'all tests passed'
    })
  })

  it('tool_end with isError surfaces the error state (failure path)', () => {
    const state = run(
      initialChatState(),
      TOOL_START,
      { type: 'tool_end', toolCallId: 'tc-1', output: 'command not found: fizz', isError: true }
    )
    expect(state.entries[0]).toMatchObject({ id: 'tc-1', state: 'error', output: 'command not found: fizz' })
    // Tool-level errors do not hijack the run-level error banner.
    expect(state.error).toBeNull()
    expect(state.agentRunning).toBe(false)
  })

  it('tool_end for an unknown tool call is a no-op (same state)', () => {
    const state = run(initialChatState(), TOOL_START)
    expect(chatReducer(state, { type: 'tool_end', toolCallId: 'nope', output: 'x', isError: false })).toBe(state)
  })

  it('a full tool round keeps transcript order: message → tool → follow-up message', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'user_message', text: 'run the tests' },
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'need to check' },
      { type: 'thinking_end', durationMs: 3_000 },
      { type: 'text_delta', delta: 'Checking now.' },
      { type: 'message_end' },
      TOOL_START,
      { type: 'tool_update', toolCallId: 'tc-1', partial: 'ok' },
      { type: 'tool_end', toolCallId: 'tc-1', output: '3 passed', isError: false },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'All green.' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    expect(state.entries.map((e) => e.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(state.agentRunning).toBe(false)
    expect(state.error).toBeNull()
  })

  it('agent_end settles a tool that never finished into an error state', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'message_end' },
      TOOL_START,
      { type: 'tool_update', toolCallId: 'tc-1', partial: 'working…' },
      { type: 'agent_end' }
    )
    expect(state.entries[1]).toEqual({
      id: 'tc-1',
      role: 'tool',
      name: 'bash',
      args: { command: 'npm test' },
      state: 'error',
      output: 'working…'
    })
    expect(state.agentRunning).toBe(false)
  })

  it('agent_end settling an output-less tool writes an explanatory placeholder', () => {
    const state = run(initialChatState(), { type: 'agent_start' }, TOOL_START, { type: 'agent_end' })
    expect(state.entries[0]).toMatchObject({ id: 'tc-1', state: 'error', output: 'The tool call ended without a result.' })
  })

  it('turn_error mid-tool settles the tool as failed and raises the agent error', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'agent_start' },
      TOOL_START,
      { type: 'turn_error', message: 'rate limited' }
    )
    expect(state.entries[0]).toMatchObject({ id: 'tc-1', state: 'error' })
    expect(state.error).toEqual({ kind: 'agent', message: 'rate limited' })
    expect(state.agentRunning).toBe(false)
    expect(state.session).toEqual({ sessionId: 's-1', cwd: '/tmp/proj', model: 'claude-opus-4-5' })
  })

  it('host_exit crash mid-tool keeps the settled transcript and reports the host error', () => {
    const beforeCrash = run(initialChatState(), SESSION_CREATED, { type: 'agent_start' }, TOOL_START)
    const state = chatReducer(beforeCrash, { type: 'host_exit', clean: false, code: 1, signal: null })
    expect(state.session).toBeNull()
    expect(state.error).toEqual({ kind: 'host', message: 'Agent host exited unexpectedly (exit code 1).', cwd: '/tmp/proj' })
    expect(state.entries[0]).toMatchObject({ id: 'tc-1', state: 'error' })
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
    expect(state.entries[1]).toEqual({
      id: 'm1',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'partial out' }],
      streaming: false
    })
    expect(state.session).toEqual({ sessionId: 's-1', cwd: '/tmp/proj', model: 'claude-opus-4-5' })
  })

  it('host_exit crash clears the session, carries the cwd, keeps the transcript', () => {
    const beforeCrash = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    const state = chatReducer(beforeCrash, { type: 'host_exit', clean: false, code: 1, signal: null })
    expect(state.session).toBeNull()
    expect(state.error).toEqual({ kind: 'host', message: 'Agent host exited unexpectedly (exit code 1).', cwd: '/tmp/proj' })
    expect(state.entries).toHaveLength(2)
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
    expect(state.entries).toHaveLength(2)
  })
})

describe('chatReducer — resumed history (ticket 04)', () => {
  const HISTORY_LOADED: HostToParent = {
    type: 'history_loaded',
    items: [
      { id: 'e1', role: 'user', text: 'earlier question', timestamp: 't1' },
      { id: 'e2', role: 'assistant', text: 'earlier answer', timestamp: 't2' }
    ]
  }

  it('history_loaded installs the replayed transcript with stable entry ids', () => {
    const state = run(initialChatState(), SESSION_CREATED, HISTORY_LOADED)
    expect(state.entries).toEqual([
      { id: 'e1', role: 'user', text: 'earlier question' },
      { id: 'e2', role: 'assistant', parts: [{ kind: 'text', text: 'earlier answer' }], streaming: false }
    ])
    expect(state.error).toBeNull()
  })

  it('history is replaceable — tree navigation re-emits the new leaf path', () => {
    const navigated = run(initialChatState(), SESSION_CREATED, HISTORY_LOADED, {
      type: 'history_loaded',
      items: [{ id: 'e1', role: 'user', text: 'earlier question', timestamp: 't1' }]
    })
    expect(navigated.entries).toEqual([{ id: 'e1', role: 'user', text: 'earlier question' }])
  })

  it('a fresh turn after resume appends to the replayed transcript', () => {
    const state = run(initialChatState(), SESSION_CREATED, HISTORY_LOADED, ...streamedTurn(' there'))
    const texts = state.entries.map((entry) =>
      entry.role === 'assistant'
        ? entry.parts.map((part) => (part.kind === 'text' ? part.text : '')).join('')
        : entry.role === 'user'
          ? entry.text
          : `[tool:${entry.name}]`
    )
    expect(texts).toEqual(['earlier question', 'earlier answer', 'hello', 'Hel there'])
    const last = state.entries[state.entries.length - 1]
    expect(last?.role === 'assistant' && last.streaming).toBe(false)
  })
})

describe('chatReducer — purity', () => {
  it('is deterministic: identical event sequences produce identical states', () => {
    const events: HostToParent[] = [
      SESSION_CREATED,
      { type: 'user_message', text: 'go' },
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'hmm' },
      { type: 'thinking_end', durationMs: 1_500 },
      { type: 'text_delta', delta: 'hi' },
      { type: 'message_end' },
      TOOL_START,
      { type: 'tool_end', toolCallId: 'tc-1', output: 'done', isError: false },
      { type: 'agent_end' }
    ]
    const a = run(initialChatState(), ...events)
    const b = run(initialChatState(), ...events)
    expect(a).toEqual(b)
  })

  it('never mutates the incoming state or its nested data', () => {
    const frozen = deepFreeze(run(initialChatState(), SESSION_CREATED, { type: 'user_message', text: 'q' }))
    expect(() =>
      run(
        frozen,
        { type: 'agent_start' },
        { type: 'message_start' },
        { type: 'thinking_delta', delta: 'x' },
        { type: 'thinking_end', durationMs: 1 },
        { type: 'text_delta', delta: 'y' },
        TOOL_START,
        { type: 'tool_update', toolCallId: 'tc-1', partial: 'z' }
      )
    ).not.toThrow()
  })
})
