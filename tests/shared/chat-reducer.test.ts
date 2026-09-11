import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState, type ChatState, type UserEntry } from '../../src/shared/chat-reducer'
import type { ChatAction } from '../../src/shared/chat-reducer'
import type { HostToParent } from '../../src/shared/contract'
import type { TranscriptItem } from '../../src/shared/sessions/types'
import { UNFINISHED_TOOL_OUTPUT } from '../../src/shared/tool-format'
import { groupTurns } from '../../src/shared/turn-collapse'

const SESSION_CREATED: HostToParent = {
  type: 'session_created',
  sessionId: 's-1',
  cwd: '/tmp/proj',
  model: 'claude-opus-4-5'
}

function run(state: ChatState, ...events: ChatAction[]): ChatState {
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
      error: null,
      expandedTurns: new Set(),
      erroredTurns: new Set(),
      model: null,
      thinkingLevel: null,
      availableLevels: [],
      accessMode: 'standard',
      providers: [],
      slashCommands: [],
      queue: { steering: [], followUp: [] }
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
    expect(state.entries).toEqual([{ id: 'm0', role: 'user', text: 'hi there', skillName: null }])
  })

  it('streams text deltas into one assistant entry and settles on agent_end', () => {
    const state = run(initialChatState(), SESSION_CREATED, ...streamedTurn(' there'))
    expect(state.entries).toEqual([
      { id: 'm0', role: 'user', text: 'hello', skillName: null },
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
      parts: [{ kind: 'thinking', text: 'Let me think', streaming: true, durationMs: null, startedAtMs: null }],
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
    expect(parts).toEqual([{ kind: 'thinking', text: 'abc', streaming: true, durationMs: null, startedAtMs: null }])
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
      parts: [{ kind: 'thinking', text: 'reasoning…', streaming: false, durationMs: 29_000, startedAtMs: null }],
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
        parts: [{ kind: 'thinking', text: 'orphan thought', streaming: true, durationMs: null, startedAtMs: null }],
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
        { kind: 'thinking', text: 'hmm', streaming: false, durationMs: null, startedAtMs: null },
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
      parts: [{ kind: 'thinking', text: 'cut', streaming: false, durationMs: null, startedAtMs: null }],
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
        { kind: 'thinking', text: 'first pass', streaming: false, durationMs: 1_000, startedAtMs: null },
        { kind: 'text', text: 'draft' },
        { kind: 'thinking', text: 'revisit', streaming: false, durationMs: 2_000, startedAtMs: null },
        { kind: 'text', text: ' final' }
      ],
      streaming: true
    })
  })
})

describe('chatReducer — thinking start stamps (ticket 61, entry-level timer anchor)', () => {
  it('a stamped thinking_delta records the renderer receipt time on the new part', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'Let me think', receivedAtMs: 1_000 }
    )
    const entry = state.entries[0]
    expect(entry.role === 'assistant' && entry.parts[0]).toEqual({
      kind: 'thinking',
      text: 'Let me think',
      streaming: true,
      durationMs: null,
      startedAtMs: 1_000
    })
  })

  it('an unstamped thinking_delta records null — the view falls back to its local tick', () => {
    const state = run(initialChatState(), { type: 'message_start' }, { type: 'thinking_delta', delta: 'legacy' })
    const entry = state.entries[0]
    expect(entry.role === 'assistant' && entry.parts[0]).toEqual({
      kind: 'thinking',
      text: 'legacy',
      streaming: true,
      durationMs: null,
      startedAtMs: null
    })
  })

  it('continuation deltas keep the original start stamp (later stamps never overwrite it)', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'a', receivedAtMs: 1_000 },
      { type: 'thinking_delta', delta: 'b', receivedAtMs: 2_400 },
      { type: 'thinking_delta', delta: 'c', receivedAtMs: 3_900 }
    )
    const entry = state.entries[0]
    expect(entry.role === 'assistant' && entry.parts[0]).toMatchObject({ startedAtMs: 1_000 })
  })

  it('a part defensively opened after text (fallback branch) carries the stamp too', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'text_delta', delta: 'answer' },
      { type: 'thinking_delta', delta: 'second thought', receivedAtMs: 7_700 }
    )
    const entry = state.entries[0]
    expect(entry.role === 'assistant' && entry.parts[1]).toEqual({
      kind: 'thinking',
      text: 'second thought',
      streaming: true,
      durationMs: null,
      startedAtMs: 7_700
    })
  })

  it('thinking_end freezes durationMs alongside the stamp — freeze wins in the view', () => {
    const state = run(
      initialChatState(),
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'reasoning…', receivedAtMs: 1_000 },
      { type: 'thinking_end', durationMs: 29_000 }
    )
    const entry = state.entries[0]
    expect(entry.role === 'assistant' && entry.parts[0]).toEqual({
      kind: 'thinking',
      text: 'reasoning…',
      streaming: false,
      durationMs: 29_000,
      startedAtMs: 1_000
    })
  })

  it('replayed thinking parts carry no stamp (session files record none — ticket 14)', () => {
    const state = run(initialChatState(), SESSION_CREATED, {
      type: 'history_loaded',
      items: [
        { role: 'assistant', id: 'e1', timestamp: 't1', text: 'done', parts: [{ kind: 'thinking', text: 'hmm', durationMs: null }] }
      ]
    })
    const entry = state.entries[0]
    expect(entry.role === 'assistant' && entry.parts[0]).toEqual({
      kind: 'thinking',
      text: 'hmm',
      streaming: false,
      durationMs: null
    })
  })
})

describe('chatReducer — real entry id backfill (ticket 51)', () => {
  /** Table: [user_message echo, expected user-entry id]. The host carries
   * the real session entry id when it read it back at persistence (live
   * fork anchor, ticket 51); absence (aborted/failed prompt shapes) falls
   * back to the positional synthetic id. */
  const userMessageCases: Array<{ name: string; event: HostToParent; expectedId: string }> = [
    {
      name: 'adopts the real session entry id when the event carries one',
      event: { type: 'user_message', text: 'hi there', entryId: 'u-real-1' },
      expectedId: 'u-real-1'
    },
    {
      name: 'falls back to the synthetic positional id when the event carries none',
      event: { type: 'user_message', text: 'hi there' },
      expectedId: 'm0'
    }
  ]
  for (const tc of userMessageCases) {
    it(`user_message ${tc.name}`, () => {
      const state = run(initialChatState(), SESSION_CREATED, tc.event)
      expect(state.entries).toEqual([{ id: tc.expectedId, role: 'user', text: 'hi there', skillName: null }])
    })
  }

  it('synthetic ids stay positional across turns so a late real id never collides', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'user_message', text: 'first', entryId: 'u-real-1' },
      { type: 'user_message', text: 'second' }
    )
    expect(state.entries.map((e) => (e.role === 'user' ? e.id : null))).toEqual(['u-real-1', 'm1'])
  })

  it('message_end backfills the real entry id onto the open streaming assistant entry', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'user_message', text: 'q', entryId: 'u-real-1' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'a' },
      { type: 'message_end', entryId: 'a-real-1' }
    )
    expect(state.entries[1]).toEqual({
      id: 'a-real-1',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'a' }],
      streaming: false
    })
  })

  it('message_end without an id keeps the synthetic id (aborted-turn robustness)', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'user_message', text: 'q', entryId: 'u-real-1' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'a' },
      { type: 'message_end' }
    )
    expect(state.entries[1]).toMatchObject({ id: 'm1', streaming: false })
  })

  it('a full turn with real ids leaves both entries fork-addressable', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'user_message', text: 'hello', entryId: 'u-real-1' },
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Hel' },
      { type: 'text_delta', delta: 'lo' },
      { type: 'message_end', entryId: 'a-real-1' },
      { type: 'agent_end' }
    )
    expect(state.entries.map((e) => e.id)).toEqual(['u-real-1', 'a-real-1'])
    // The turn-collapse fork anchor follows the backfilled id (ticket 16;
    // the ticket-53 split keeps the anchor on the last text part's entry).
    const [turn] = groupTurns(state.entries, state.agentRunning)
    expect(turn.answer?.entryId).toBe('a-real-1')
  })

  it('agent_end settle without message_end never invents a real id (aborted turn)', () => {
    const state = run(
      initialChatState(),
      SESSION_CREATED,
      { type: 'user_message', text: 'q', entryId: 'u-real-1' },
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'partial' },
      { type: 'agent_end' }
    )
    expect(state.entries[1]).toMatchObject({ id: 'm1', streaming: false })
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
      { id: 'e1', role: 'user', text: 'earlier question', timestamp: 't1', skillName: null },
      {
        id: 'e2',
        role: 'assistant',
        timestamp: 't2',
        text: 'earlier answer',
        parts: [{ kind: 'text', text: 'earlier answer' }]
      }
    ]
  }

  it('history_loaded installs the replayed transcript with stable entry ids', () => {
    const state = run(initialChatState(), SESSION_CREATED, HISTORY_LOADED)
    expect(state.entries).toEqual([
      { id: 'e1', role: 'user', text: 'earlier question', skillName: null },
      { id: 'e2', role: 'assistant', parts: [{ kind: 'text', text: 'earlier answer' }], streaming: false }
    ])
    expect(state.error).toBeNull()
  })

  it('history is replaceable — tree navigation re-emits the new leaf path', () => {
    const navigated = run(initialChatState(), SESSION_CREATED, HISTORY_LOADED, {
      type: 'history_loaded',
      items: [{ id: 'e1', role: 'user', text: 'earlier question', timestamp: 't1', skillName: null }]
    })
    expect(navigated.entries).toEqual([{ id: 'e1', role: 'user', text: 'earlier question', skillName: null }])
  })

  it('a fresh turn after resume appends to the replayed transcript', () => {
    const state = run(initialChatState(), SESSION_CREATED, HISTORY_LOADED, ...streamedTurn(' there'))
    const texts = state.entries.map((entry) =>
      entry.role === 'assistant'
        ? entry.parts.map((part) => (part.kind === 'text' ? part.text : '')).join('')
        : entry.role === 'user'
          ? entry.text
          : entry.role === 'approval'
            ? '[approval]'
            : `[tool:${entry.name}]`
    )
    expect(texts).toEqual(['earlier question', 'earlier answer', 'hello', 'Hel there'])
    const last = state.entries[state.entries.length - 1]
    expect(last?.role === 'assistant' && last.streaming).toBe(false)
  })
})

describe('chatReducer — structured replay (ticket 14)', () => {
  /** Table-driven: every history item kind maps onto the SAME entry shape
   * the live stream produces, so replay renders isomorphic to live. */
  interface ReplayCase {
    name: string
    item: TranscriptItem
    expected: ChatState['entries'][number]
  }

  const cases: ReplayCase[] = [
    {
      name: 'user item carrying a sniffed skill marker',
      item: {
        role: 'user',
        id: 'e1',
        text: '<skill name="implement" location="/x/SKILL.md">\nbody\n</skill>\n\ndo it',
        timestamp: 't1',
        skillName: 'implement'
      },
      expected: {
        id: 'e1',
        role: 'user',
        text: '<skill name="implement" location="/x/SKILL.md">\nbody\n</skill>\n\ndo it',
        skillName: 'implement'
      }
    },
    {
      name: 'user item without skill text',
      item: { role: 'user', id: 'e2', text: 'plain message', timestamp: 't2', skillName: null },
      expected: { id: 'e2', role: 'user', text: 'plain message', skillName: null }
    },
    {
      name: 'assistant item with thinking (degraded duration) + text parts',
      item: {
        role: 'assistant',
        id: 'e3',
        timestamp: 't3',
        text: 'the answer',
        parts: [
          { kind: 'thinking', text: 'reasoning…', durationMs: null },
          { kind: 'text', text: 'the answer' }
        ]
      },
      expected: {
        id: 'e3',
        role: 'assistant',
        parts: [
          { kind: 'thinking', text: 'reasoning…', streaming: false, durationMs: null },
          { kind: 'text', text: 'the answer' }
        ],
        streaming: false
      }
    },
    {
      name: 'tool item that finished successfully',
      item: { role: 'tool', id: 'c1', timestamp: 't4', name: 'bash', args: { command: 'ls' }, output: 'a.txt', isError: false },
      expected: { id: 'c1', role: 'tool', name: 'bash', args: { command: 'ls' }, state: 'done', output: 'a.txt' }
    },
    {
      name: 'tool item that finished in error',
      item: { role: 'tool', id: 'c2', timestamp: 't5', name: 'bash', args: { command: 'exit 1' }, output: 'boom', isError: true },
      expected: { id: 'c2', role: 'tool', name: 'bash', args: { command: 'exit 1' }, state: 'error', output: 'boom' }
    },
    {
      name: 'tool item degraded for an unresolved call (aborted turn)',
      item: { role: 'tool', id: 'c3', timestamp: 't6', name: 'read', args: { path: '/a' }, output: UNFINISHED_TOOL_OUTPUT, isError: true },
      expected: { id: 'c3', role: 'tool', name: 'read', args: { path: '/a' }, state: 'error', output: UNFINISHED_TOOL_OUTPUT }
    }
  ]

  for (const c of cases) {
    it(`replays a ${c.name}`, () => {
      const state = run(initialChatState(), SESSION_CREATED, { type: 'history_loaded', items: [c.item] })
      expect(state.entries).toEqual([c.expected])
    })
  }

  it('re-replaying identical history is idempotent — repeated resume / tree round-trips never duplicate entries', () => {
    const items: TranscriptItem[] = cases.map((c) => c.item)
    const once = run(initialChatState(), SESSION_CREATED, { type: 'history_loaded', items })
    const twice = run(once, { type: 'history_loaded', items })
    expect(twice.entries).toEqual(once.entries)
    expect(twice.entries.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'c1', 'c2', 'c3'])
  })

  it('replayed thinking parts are never streaming — settle state survives re-replay', () => {
    const state = run(initialChatState(), SESSION_CREATED, {
      type: 'history_loaded',
      items: [
        { role: 'user', id: 'e1', text: 'go', timestamp: 't1', skillName: null },
        { role: 'assistant', id: 'e2', timestamp: 't2', text: 'done', parts: [{ kind: 'thinking', text: 'hmm', durationMs: null }] }
      ]
    })
    const assistant = state.entries[1]
    expect(assistant?.role === 'assistant' && assistant.streaming).toBe(false)
    expect(state.agentRunning).toBe(false)
  })

  it('live user_message events sniff the skill marker from injected skill text (same payload as replay)', () => {
    const injected = '<skill name="tdd" location="/x/SKILL.md">\nbody\n</skill>\n\nmake it red first'
    const state = run(initialChatState(), { type: 'user_message', text: injected })
    const entry = state.entries[0] as UserEntry
    expect(entry.skillName).toBe('tdd')
    expect(state.entries[0]).toEqual({ id: 'm0', role: 'user', text: injected, skillName: 'tdd' })
    const plain = run(initialChatState(), { type: 'user_message', text: 'no skill here' })
    expect((plain.entries[0] as UserEntry).skillName).toBeNull()
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
})

describe('chatReducer — composer + approval gate (ticket 05)', () => {
  const COMPOSER_STATE: HostToParent = {
    type: 'composer_state',
    model: { providerId: 'anthropic', modelId: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
    thinkingLevel: 'medium',
    availableLevels: ['off', 'medium', 'high'],
    accessMode: 'standard'
  }

  it('composer_state installs model, thinking tier and access mode', () => {
    const state = chatReducer(initialChatState(), COMPOSER_STATE)
    expect(state.model?.modelId).toBe('claude-opus-4-5')
    expect(state.thinkingLevel).toBe('medium')
    expect(state.availableLevels).toEqual(['off', 'medium', 'high'])
    expect(state.accessMode).toBe('standard')
  })

  it('models_available stores provider groupings and the current model', () => {
    const state = chatReducer(initialChatState(), {
      type: 'models_available',
      providers: [{ providerId: 'anthropic', name: 'Anthropic', models: [COMPOSER_STATE.model!] }],
      current: COMPOSER_STATE.model!
    })
    expect(state.providers[0]?.name).toBe('Anthropic')
  })

  it('model_changed carries the clamped thinking state with it', () => {
    const state = run(initialChatState(), COMPOSER_STATE, {
      type: 'model_changed',
      model: { providerId: 'openai', modelId: 'gpt-5', name: 'GPT-5' },
      thinkingLevel: 'low',
      availableLevels: ['off', 'low']
    })
    expect(state.model).toEqual({ providerId: 'openai', modelId: 'gpt-5', name: 'GPT-5' })
    expect(state.thinkingLevel).toBe('low')
    expect(state.availableLevels).toEqual(['off', 'low'])
  })

  it('thinking_level_changed and access_mode_changed update their slices', () => {
    const state = run(
      initialChatState(),
      COMPOSER_STATE,
      { type: 'thinking_level_changed', level: 'high', availableLevels: ['off', 'high'] },
      { type: 'access_mode_changed', mode: 'read-only' }
    )
    expect(state.thinkingLevel).toBe('high')
    expect(state.accessMode).toBe('read-only')
  })

  it('slash_commands and queue_update store their payloads', () => {
    const state = run(
      initialChatState(),
      {
        type: 'slash_commands',
        commands: [{ name: 'review', description: 'Review the diff', source: 'prompt' }]
      },
      { type: 'queue_update', steering: ['a'], followUp: ['b'] }
    )
    expect(state.slashCommands).toHaveLength(1)
    expect(state.queue).toEqual({ steering: ['a'], followUp: ['b'] })
  })

  it('approval_required appends a pending approval entry keyed by toolCallId', () => {
    const state = chatReducer(initialChatState(), {
      type: 'approval_required',
      toolCallId: 'tc-9',
      toolName: 'bash',
      args: { command: 'rm -rf /' }
    })
    expect(state.entries).toEqual([
      { id: 'tc-9', role: 'approval', toolName: 'bash', args: { command: 'rm -rf /' }, state: 'pending', reason: null }
    ])
  })

  it('approval_required replaces a stale same-id entry (defensive)', () => {
    const state = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} },
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: { command: 'ls' } }
    )
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({ state: 'pending', args: { command: 'ls' } })
  })

  it('approval_resolved flips the pill to approved / denied', () => {
    const approved = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} },
      { type: 'approval_resolved', toolCallId: 'tc-9', approved: true, reason: null }
    )
    expect(approved.entries[0]).toMatchObject({ state: 'approved' })
    const denied = chatReducer(approved, {
      type: 'approval_required',
      toolCallId: 'tc-10',
      toolName: 'edit',
      args: {}
    })
    const afterDeny = chatReducer(denied, {
      type: 'approval_resolved',
      toolCallId: 'tc-10',
      approved: false,
      reason: 'Do not touch that file'
    })
    expect(afterDeny.entries[1]).toMatchObject({ state: 'denied', reason: 'Do not touch that file' })
  })

  it('approval_resolved for an unknown id is a no-op (same state)', () => {
    const state = chatReducer(initialChatState(), {
      type: 'approval_resolved',
      toolCallId: 'nope',
      approved: true,
      reason: null
    })
    expect(state.entries).toEqual([])
  })

  it('tool_start converts the approval entry into a running tool card (same id)', () => {
    const state = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: { command: 'ls' } },
      { type: 'approval_resolved', toolCallId: 'tc-9', approved: true, reason: null },
      { type: 'tool_start', toolCallId: 'tc-9', name: 'bash', args: { command: 'ls' } }
    )
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({ role: 'tool', state: 'running', output: '' })
  })

  it('approval_required converts an already-started tool card back into a pill (SDK emits tool_execution_start first)', () => {
    const state = run(
      initialChatState(),
      { type: 'tool_start', toolCallId: 'tc-9', name: 'bash', args: { command: 'ls' } },
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: { command: 'ls' } }
    )
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({ role: 'approval', state: 'pending' })
  })

  it('tool_end after an approve converts the pill into the finished card', () => {
    const state = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} },
      { type: 'approval_resolved', toolCallId: 'tc-9', approved: true, reason: null },
      { type: 'tool_end', toolCallId: 'tc-9', output: 'ran fine', isError: false }
    )
    expect(state.entries[0]).toMatchObject({ role: 'tool', state: 'done', output: 'ran fine' })
  })

  it('tool_end after a denial keeps the denied pill (no duplicate card)', () => {
    const state = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} },
      { type: 'approval_resolved', toolCallId: 'tc-9', approved: false, reason: 'not today' },
      { type: 'tool_end', toolCallId: 'tc-9', output: 'Denied by the user.', isError: true }
    )
    expect(state.entries[0]).toMatchObject({ role: 'approval', state: 'denied', reason: 'not today' })
  })

  it('tool_end landing on a still-pending approval converts then finalizes (defensive)', () => {
    const state = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} },
      { type: 'tool_end', toolCallId: 'tc-9', output: 'denied upstream', isError: true }
    )
    expect(state.entries[0]).toMatchObject({ role: 'tool', state: 'error', output: 'denied upstream' })
  })

  it('agent_end settles a pending approval into denied (run ended over it)', () => {
    const state = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} },
      { type: 'agent_end' }
    )
    expect(state.entries[0]).toMatchObject({ state: 'denied', reason: 'The turn ended before a decision.' })
  })

  it('agent_end settles an approved-but-never-started approval into denied', () => {
    const state = run(
      initialChatState(),
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} },
      { type: 'approval_resolved', toolCallId: 'tc-9', approved: true, reason: null },
      { type: 'agent_end' }
    )
    expect(state.entries[0]).toMatchObject({ state: 'denied', reason: 'Approved, but the turn ended before the tool ran.' })
  })

  it('session_created resets composer state, queue and live approvals', () => {
    const dirty = run(
      initialChatState(),
      COMPOSER_STATE,
      { type: 'slash_commands', commands: [{ name: 'x', description: '', source: 'builtin' }] },
      { type: 'queue_update', steering: ['a'], followUp: [] },
      { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: {} }
    )
    const fresh = chatReducer(dirty, { ...SESSION_CREATED, sessionId: 's-2' })
    expect(fresh.model).toBeNull()
    expect(fresh.slashCommands).toEqual([])
    expect(fresh.queue).toEqual({ steering: [], followUp: [] })
    expect(fresh.entries).toEqual([])
    expect(fresh.accessMode).toBe('standard')
  })

  it('never mutates the incoming state or its nested data (ticket 05 events included)', () => {
    const frozen = deepFreeze(
      run(
        initialChatState(),
        COMPOSER_STATE,
        { type: 'user_message', text: 'q' },
        { type: 'queue_update', steering: ['a'], followUp: [] },
        { type: 'approval_required', toolCallId: 'tc-9', toolName: 'bash', args: { command: 'ls' } }
      )
    )
    expect(() =>
      run(
        frozen,
        { type: 'agent_start' },
        { type: 'message_start' },
        { type: 'thinking_delta', delta: 'x' },
        { type: 'thinking_end', durationMs: 1 },
        { type: 'text_delta', delta: 'y' },
        TOOL_START,
        { type: 'tool_update', toolCallId: 'tc-1', partial: 'z' },
        { type: 'model_changed', model: COMPOSER_STATE.model!, thinkingLevel: 'low', availableLevels: ['low'] },
        { type: 'approval_resolved', toolCallId: 'tc-9', approved: true, reason: null }
      )
    ).not.toThrow()
  })
})
