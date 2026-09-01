import { describe, expect, it } from 'vitest'
import {
  focusedSession,
  initialRegistryState,
  registryReducer,
  runningSessionIds,
  sidebarDotState,
  liveSessionIds,
  type SessionRegistryState
} from '../../src/shared/session-registry'
import type { HostToParent } from '../../src/shared/contract'

/** Wrap a scoped event for a session (the supervisor's tagging shape). */
function scoped(sessionId: string, event: HostToParent): HostToParent {
  return { type: 'session_event', sessionId, event } as HostToParent
}

const CREATED_A = scoped('s-a', { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: 'm1' })
const CREATED_B = scoped('s-b', { type: 'session_created', sessionId: 's-b', cwd: '/tmp/b', model: 'm2', resumed: true })

function run(state: SessionRegistryState, ...actions: HostToParent[]): SessionRegistryState {
  return actions.reduce((acc, action) => registryReducer(acc, action), state)
}

describe('registryReducer — session registration + focus routing', () => {
  it('starts empty and unfocused', () => {
    expect(initialRegistryState()).toEqual({ sessions: [], focusedId: null })
    expect(focusedSession(initialRegistryState())).toBeNull()
  })

  it('registers a session on its wrapped session_created and focuses it', () => {
    const state = run(initialRegistryState(), CREATED_A)
    expect(state.focusedId).toBe('s-a')
    const focused = focusedSession(state)
    expect(focused?.id).toBe('s-a')
    expect(focused?.cwd).toBe('/tmp/a')
    expect(focused?.chat.session).toEqual({ sessionId: 's-a', cwd: '/tmp/a', model: 'm1' })
  })

  it('auto-switches focus as sessions are created (create/resume/fork announce)', () => {
    const state = run(initialRegistryState(), CREATED_A, CREATED_B)
    expect(state.focusedId).toBe('s-b')
    expect(state.sessions.map((s) => s.id)).toEqual(['s-a', 's-b'])
  })

  it('folds every following event of a session into ITS chat state (isolation)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      scoped('s-a', { type: 'user_message', text: 'for a' }),
      scoped('s-a', { type: 'agent_start' }),
      scoped('s-b', { type: 'user_message', text: 'for b' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    const b = state.sessions.find((s) => s.id === 's-b')
    expect(a?.chat.entries.map((e) => (e.role === 'user' ? e.text : ''))).toEqual(['for a'])
    expect(a?.chat.agentRunning).toBe(true)
    expect(b?.chat.entries.map((e) => (e.role === 'user' ? e.text : ''))).toEqual(['for b'])
    expect(b?.chat.agentRunning).toBe(false)
  })

  it('collects a background session stream while another session is focused (追平 source)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'user_message', text: 'count' }),
      scoped('s-a', { type: 'agent_start' }),
      CREATED_B, // focus switches to s-b; s-a keeps streaming in the background
      scoped('s-a', { type: 'message_start' }),
      scoped('s-a', { type: 'text_delta', delta: 'Hel' }),
      scoped('s-a', { type: 'text_delta', delta: 'lo' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.chat.entries.some((e) => e.role === 'assistant')).toBe(true)
    expect(a?.chat.agentRunning).toBe(true)
  })

  it('inserts a defensive entry for an unknown session id (provisional supervisor ids)', () => {
    const state = run(
      initialRegistryState(),
      scoped('pending-1', { type: 'session_error', message: 'boot failed' })
    )
    const pending = state.sessions.find((s) => s.id === 'pending-1')
    expect(pending?.cwd).toBeNull()
    expect(pending?.chat.error).toEqual({ kind: 'session', message: 'boot failed' })
  })

  it('runningSessionIds lists exactly the sessions with a live host and a run in flight', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'user_message', text: 'go' }),
      scoped('s-a', { type: 'agent_start' }),
      CREATED_B
    )
    expect([...runningSessionIds(state)]).toEqual(['s-a'])
    expect([...liveSessionIds(state)]).toEqual(['s-a', 's-b'])
  })
})

describe('sidebarDotState — fixed-slot dot derivation (ticket 20)', () => {
  it.each([
    // runningHere | inAppIdle | liveElsewhere | expected
    [true, false, false, 'run-here'],
    [true, false, true, 'run-here'],
    [false, true, true, 'idle'], // an in-app session never shows the TUI green dot
    [false, true, false, 'idle'],
    [false, false, true, 'tui-live'],
    [false, false, false, 'idle']
  ])('running=%p inAppIdle=%p liveElsewhere=%p → %p', (runningHere, inAppIdle, liveElsewhere, expected) => {
    expect(sidebarDotState(runningHere as boolean, inAppIdle as boolean, liveElsewhere as boolean)).toBe(expected)
  })
})

describe('registryReducer — focus + per-session UI actions', () => {
  it('focus_session switches the rendered session without touching either host', () => {
    const state = run(initialRegistryState(), CREATED_A, CREATED_B)
    const switched = registryReducer(state, { type: 'focus_session', sessionId: 's-a' })
    expect(switched.focusedId).toBe('s-a')
    expect(switched.sessions).toEqual(state.sessions) // view state untouched
  })

  it('focus_session ignores unknown ids', () => {
    const state = run(initialRegistryState(), CREATED_A)
    expect(registryReducer(state, { type: 'focus_session', sessionId: 'nope' })).toBe(state)
  })

  it('toggle_turn_expanded applies to the FOCUSED session only', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'user_message', text: 'turn a' }),
      CREATED_B,
      scoped('s-b', { type: 'user_message', text: 'turn b' })
    )
    const turnA = state.sessions.find((s) => s.id === 's-a')?.chat.entries[0]
    const toggled = registryReducer(state, { type: 'toggle_turn_expanded', turnId: turnA?.id ?? 'm0' })
    // s-b is focused: its turns untouched, s-a's turn opened.
    expect(toggled.sessions.find((s) => s.id === 's-b')?.chat.expandedTurns.size).toBe(0)
    expect(toggled.sessions.find((s) => s.id === 's-a')?.chat.expandedTurns.has(turnA?.id ?? 'm0')).toBe(true)
  })

  it('dismiss_error records the focused session\'s own dismissed banner', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      scoped('s-a', { type: 'host_exit', clean: false, code: 1, signal: null })
    )
    const errored = state.sessions.find((s) => s.id === 's-a')
    expect(errored?.chat.error?.kind).toBe('host')
    expect(errored?.chat.session).toBeNull() // dead but kept for the banner
    const dismissed = registryReducer(state, { type: 'dismiss_error' })
    // focus is on s-b, so s-a's banner is NOT the one dismissed
    expect(state.sessions.find((s) => s.id === 's-a')?.dismissedError).toBeNull()
    expect(dismissed.sessions.find((s) => s.id === 's-a')?.dismissedError).toBeNull()
    // Now focus the dead session and dismiss there.
    const refocused = registryReducer(state, { type: 'focus_session', sessionId: 's-a' })
    const dismissedThere = registryReducer(refocused, { type: 'dismiss_error' })
    expect(dismissedThere.sessions.find((s) => s.id === 's-a')?.dismissedError).toEqual(errored?.chat.error)
  })

  it('liveSessionIds excludes dead sessions (their rows must respawn, not focus)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'host_exit', clean: false, code: 1, signal: null }),
      CREATED_B
    )
    expect([...liveSessionIds(state)]).toEqual(['s-b'])
    expect(state.sessions.map((s) => s.id)).toEqual(['s-a', 's-b']) // entry kept
  })
})

describe('registryReducer — in-host fork (session_detached) + takeover re-announce', () => {
  const FORK_ANNOUNCE = scoped('s-b', { type: 'session_created', sessionId: 's-b', cwd: '/tmp/a', model: 'm1', sessionFile: '/tmp/b.jsonl', resumed: true })

  it('removes the detached session and focuses the fork announcement', () => {
    const state = run(initialRegistryState(), CREATED_A)
    const forked = run(state, scoped('s-a', { type: 'session_detached' }), FORK_ANNOUNCE)
    expect(forked.sessions.map((s) => s.id)).toEqual(['s-b'])
    expect(forked.focusedId).toBe('s-b')
    expect(forked.sessions[0]?.sessionFile).toBe('/tmp/b.jsonl')
  })

  it('clears focus when the detached session was focused (then the announce refocuses)', () => {
    const state = run(initialRegistryState(), CREATED_A)
    const detached = registryReducer(state, { type: 'session_event', sessionId: 's-a', event: { type: 'session_detached' } })
    expect(detached.focusedId).toBeNull()
  })

  it('a resume re-announcement of a known id resets that session in place (takeover)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'user_message', text: 'old' }),
      scoped('s-a', { type: 'agent_start' }),
      // The old host died; a fresh host re-announces the same session id.
      scoped('s-a', { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: 'm1', sessionFile: '/tmp/a.jsonl', resumed: true })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.chat.session).toEqual({ sessionId: 's-a', cwd: '/tmp/a', model: 'm1' })
    expect(a?.chat.entries).toEqual([]) // fresh transcript awaits the replay
    expect(a?.chat.agentRunning).toBe(false)
    expect(a?.sessionFile).toBe('/tmp/a.jsonl')
    expect(state.focusedId).toBe('s-a')
  })

  it('session metadata (tree) is per session and replaced on announce', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'session_tree', tree: { sessionId: 's-a', leafId: null, name: null, nodes: [] } }),
      CREATED_B
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.tree?.sessionId).toBe('s-a')
    expect(state.sessions.find((s) => s.id === 's-b')?.tree).toBeNull()
    // A re-announcement resets the stale tree until the fresh payload arrives.
    const reannounced = run(state, scoped('s-a', { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: 'm1', resumed: true }))
    expect(reannounced.sessions.find((s) => s.id === 's-a')?.tree).toBeNull()
  })
})

describe('registryReducer — legacy unwrapped events (visual-QA harness shape)', () => {
  it('routes unwrapped events to the focused session', () => {
    const state = run(
      initialRegistryState(),
      { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: null },
      { type: 'user_message', text: 'hello' },
      { type: 'agent_start' }
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.chat.entries.length).toBe(1)
    expect(a?.chat.agentRunning).toBe(true)
  })

  it('drops unwrapped events when nothing is focused', () => {
    expect(run(initialRegistryState(), { type: 'text_delta', delta: 'x' })).toEqual(initialRegistryState())
  })
})
