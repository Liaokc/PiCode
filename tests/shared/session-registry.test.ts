import { describe, expect, it } from 'vitest'
import {
  awaitingApprovalSessionIds,
  focusedSession,
  initialRegistryState,
  registryReducer,
  runningSessionIds,
  sidebarDotState,
  sidebarRowState,
  liveSessionIds,
  type SessionRegistryState
} from '../../src/shared/session-registry'
import type { HostToParent, SessionScopedEvent } from '../../src/shared/contract'
import type { RegistryAction } from '../../src/shared/session-registry'
import { composerDraft } from '../../src/shared/composer/drafts'

/** Wrap a scoped event for a session (the supervisor's tagging shape). */
function scoped(sessionId: string, event: SessionScopedEvent): HostToParent {
  return { type: 'session_event', sessionId, event }
}

const CREATED_A = scoped('s-a', { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: 'm1' })
const CREATED_B = scoped('s-b', { type: 'session_created', sessionId: 's-b', cwd: '/tmp/b', model: 'm2', resumed: true })

function run(state: SessionRegistryState, ...actions: RegistryAction[]): SessionRegistryState {
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

describe('sidebarDotState — fixed-slot dot derivation (ticket 20 + 25 + 28)', () => {
  it.each([
    // awaitingApproval | runningHere | inApp | liveElsewhere | unread | expected
    [false, true, false, false, false, 'run-here'],
    [false, true, false, true, false, 'run-here'],
    [false, false, true, true, false, 'idle'], // an in-app session never shows the TUI green dot
    [false, false, true, false, false, 'idle'],
    [false, false, false, true, false, 'tui-live'],
    [false, false, false, false, false, 'idle'],
    // Ticket 25: the gate parked a pill — the orange badge wins over every
    // other state (the run is suspended at the gate, not visibly working).
    [true, true, false, false, false, 'awaiting-approval'],
    [true, true, false, true, false, 'awaiting-approval'],
    [true, false, true, false, false, 'awaiting-approval'],
    [true, false, false, true, false, 'awaiting-approval'],
    [true, false, false, false, false, 'awaiting-approval'],
    // Ticket 28: unread (indigo) sits BELOW the green TUI dot and above the
    // empty slot — higher-priority states mask it only while they apply.
    [false, false, false, false, true, 'unread'],
    [false, false, true, false, true, 'unread'], // an in-app idle session that grew shows unread, not the empty slot
    [false, false, true, true, true, 'unread'], // in-app suppresses green; unread shows
    [false, false, false, true, true, 'tui-live'], // green masks unread until the other end goes quiet
    [false, true, false, false, true, 'run-here'], // the animated dot masks unread while running here
    [false, true, false, true, true, 'run-here'],
    [true, false, false, false, true, 'awaiting-approval'], // orange beats unread
    [true, true, false, true, true, 'awaiting-approval']
  ])('awaiting=%p running=%p inApp=%p liveElsewhere=%p unread=%p → %p', (awaiting, runningHere, inApp, liveElsewhere, unread, expected) => {
    expect(
      sidebarDotState(awaiting as boolean, runningHere as boolean, inApp as boolean, liveElsewhere as boolean, unread as boolean)
    ).toBe(expected)
  })
})

describe('sidebarRowState — selection follows the view (ticket 28)', () => {
  it.each([
    // focusedId | followedFile | sessionId | sessionFile | expected
    ['s-a', '/b.jsonl', 's-b', '/b.jsonl', 'selected'], // Follow active: the followed row is selected
    ['s-a', '/b.jsonl', 's-a', '/a.jsonl', 'idle'], // Follow active: the previously focused row reverts
    ['s-a', '/b.jsonl', 's-c', '/c.jsonl', 'idle'], // Follow active: every other row stays plain
    ['s-a', null, 's-a', '/a.jsonl', 'selected'], // Follow inactive: the focused row is selected
    ['s-a', null, 's-b', '/b.jsonl', 'idle'],
    [null, null, 's-a', '/a.jsonl', 'idle'], // nothing focused, nothing followed
    [null, '/b.jsonl', 's-b', '/b.jsonl', 'selected'] // Follow with no focused session
  ])('focused=%p followed=%p row=%p/%p → %p', (focusedId, followedFile, sessionId, sessionFile, expected) => {
    expect(
      sidebarRowState(focusedId as string | null, followedFile as string | null, sessionId as string, sessionFile as string)
    ).toBe(expected)
  })
})

describe('awaitingApprovalSessionIds — ticket 25 background approval badge', () => {
  function approved(id: string): HostToParent {
    return scoped(id, { type: 'approval_resolved', toolCallId: 'tc-1', approved: true, reason: null })
  }

  function denied(id: string): HostToParent {
    return scoped(id, { type: 'approval_resolved', toolCallId: 'tc-1', approved: false, reason: 'no' })
  }

  it('lists sessions whose folded chat state holds a pending pill', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'approval_required', toolCallId: 'tc-1', toolName: 'bash', args: {} })
    )
    expect([...awaitingApprovalSessionIds(state)]).toEqual(['s-a'])
  })

  it('keeps the pill pending while the session is in the background (never auto-resolved)', () => {
    // The gate fires in s-a while the view has moved on to s-b: the pill
    // parks in s-a's registry state and the badge stays lit until a human
    // decides — nothing in the fold path resolves it on the session's behalf.
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'user_message', text: 'go' }),
      scoped('s-a', { type: 'agent_start' }),
      CREATED_B,
      scoped('s-a', { type: 'approval_required', toolCallId: 'tc-1', toolName: 'bash', args: {} })
    )
    expect(state.focusedId).toBe('s-b')
    expect([...awaitingApprovalSessionIds(state)]).toEqual(['s-a'])
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.chat.entries.some((e) => e.role === 'approval' && e.state === 'pending')).toBe(true)
    // The run is suspended at the gate, not finished.
    expect(a?.chat.agentRunning).toBe(true)
  })

  it('clears once the pill resolves — approve or deny (both are human decisions)', () => {
    const base = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'approval_required', toolCallId: 'tc-1', toolName: 'bash', args: {} })
    )
    expect([...awaitingApprovalSessionIds(run(base, approved('s-a')))]).toEqual([])
    expect([...awaitingApprovalSessionIds(run(base, denied('s-a')))]).toEqual([])
  })

  it('clears on settle — an agent_end denies undecided pills (suspension ended)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'approval_required', toolCallId: 'tc-1', toolName: 'bash', args: {} }),
      scoped('s-a', { type: 'agent_end' })
    )
    expect([...awaitingApprovalSessionIds(state)]).toEqual([])
  })

  it('is per session — another session\'s gate never lights this row', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      scoped('s-b', { type: 'approval_required', toolCallId: 'tc-1', toolName: 'bash', args: {} })
    )
    expect([...awaitingApprovalSessionIds(state)]).toEqual(['s-b'])
  })

  it('is empty for a fresh registry (idle world costs nothing)', () => {
    expect(awaitingApprovalSessionIds(initialRegistryState()).size).toBe(0)
  })
})

describe('registryReducer — failed spawn surfaces its banner (α parity)', () => {
  it('focuses the defensive entry on session_error for an unknown id', () => {
    const state = run(initialRegistryState(), CREATED_A)
    const failed = run(state, scoped('pending-1', { type: 'session_error', message: 'boot failed' }))
    expect(failed.focusedId).toBe('pending-1')
    const entry = failed.sessions.find((s) => s.id === 'pending-1')
    expect(entry?.chat.error).toEqual({ kind: 'session', message: 'boot failed' })
    // The previously focused session is untouched.
    expect(failed.sessions.find((s) => s.id === 's-a')?.chat.error).toBeNull()
  })

  it('focuses the defensive entry on host_exit for an unknown id (instant spawn death)', () => {
    const failed = run(
      initialRegistryState(),
      scoped('pending-2', { type: 'host_exit', clean: false, code: null, signal: 'SIGKILL' })
    )
    expect(failed.focusedId).toBe('pending-2')
    expect(failed.sessions.find((s) => s.id === 'pending-2')?.chat.error?.kind).toBe('host')
  })

  it('does NOT refocus on failures of already-known sessions (background crash stays put)', () => {
    const state = run(initialRegistryState(), CREATED_A, CREATED_B)
    const crashed = run(state, scoped('s-a', { type: 'host_exit', clean: false, code: 1, signal: null }))
    expect(crashed.focusedId).toBe('s-b')
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

  it('routes the unwrapped branch_info to the focused session', () => {
    const state = run(
      initialRegistryState(),
      { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: null },
      { type: 'branch_info', branch: 'main' }
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.branch).toBe('main')
  })
})

describe('registryReducer — branch readout (ticket 21, read-only)', () => {
  it('stores branch_info on the session it belongs to, isolated per session', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      scoped('s-a', { type: 'branch_info', branch: 'main' }),
      scoped('s-b', { type: 'branch_info', branch: null }) // s-b's workspace is not a git repo
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.branch).toBe('main')
    expect(state.sessions.find((s) => s.id === 's-b')?.branch).toBeNull()
  })

  it('opens a defensive entry for a branch_info racing its announcement', () => {
    const state = run(initialRegistryState(), scoped('s-x', { type: 'branch_info', branch: 'develop' }))
    expect(state.sessions.find((s) => s.id === 's-x')?.branch).toBe('develop')
  })

  it('a (re-)announcement resets the stale branch until the fresh readout arrives', () => {
    const state = run(initialRegistryState(), CREATED_A, scoped('s-a', { type: 'branch_info', branch: 'main' }))
    // Fork/resume/takeover re-announce: the workspace may have changed — the
    // old readout must not linger while the fresh one is in flight.
    const reannounced = run(state, scoped('s-a', { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: 'm1', resumed: true }))
    expect(reannounced.sessions.find((s) => s.id === 's-a')?.branch).toBeNull()
  })

  it('a later readout overwrites an earlier one (last write wins)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'branch_info', branch: 'main' }),
      scoped('s-a', { type: 'branch_info', branch: 'feature-late' })
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.branch).toBe('feature-late')
  })
})

describe('registryReducer — composer draft slots (ticket 74, per-session 槽)', () => {
  const DRAFT_A = composerDraft('remember the milk for s-a')
  const DRAFT_B = composerDraft('s-b draft', [{ mimeType: 'image/png', data: 'aGk=' }])

  it('starts with no draft slot (null) on a fresh entry', () => {
    const state = run(initialRegistryState(), CREATED_A)
    expect(state.sessions.find((s) => s.id === 's-a')?.draft).toBeNull()
  })

  it('parks a draft into the addressed session and restores it on read', () => {
    const state = run(initialRegistryState(), CREATED_A, { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A })
    expect(state.sessions.find((s) => s.id === 's-a')?.draft).toEqual(DRAFT_A)
  })

  it('keeps sessions isolated — A/B drafts never cross (会话 A/B 互不串)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A },
      { type: 'set_session_draft', sessionId: 's-b', draft: DRAFT_B }
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.draft).toEqual(DRAFT_A)
    expect(state.sessions.find((s) => s.id === 's-b')?.draft).toEqual(DRAFT_B)
  })

  it('an unknown session id is ignored (no defensive entry for a park)', () => {
    const state = run(initialRegistryState(), { type: 'set_session_draft', sessionId: 'ghost', draft: DRAFT_A })
    expect(state.sessions).toEqual([])
  })

  it('an EMPTY draft clears the slot (空槽不存 — set and clear are one rule)', () => {
    const parked = run(initialRegistryState(), CREATED_A, { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A })
    for (const empty of [composerDraft(''), composerDraft('  \n\t ')]) {
      const cleared = run(parked, { type: 'set_session_draft', sessionId: 's-a', draft: empty })
      expect(cleared.sessions.find((s) => s.id === 's-a')?.draft).toBeNull()
    }
    // Images are content: whitespace text + an image still parks.
    const imaged = run(parked, { type: 'set_session_draft', sessionId: 's-a', draft: composerDraft(' ', DRAFT_B.images) })
    expect(imaged.sessions.find((s) => s.id === 's-a')?.draft).toEqual(composerDraft(' ', DRAFT_B.images))
  })

  it('a later park replaces the earlier one (last write wins)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A },
      { type: 'set_session_draft', sessionId: 's-a', draft: composerDraft('replaced') }
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.draft).toEqual(composerDraft('replaced'))
  })

  it('focus switches never touch the slots (切走切回靠它们恢复)', () => {
    const parked = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A },
      { type: 'focus_session', sessionId: 's-b' },
      { type: 'focus_session', sessionId: 's-a' }
    )
    expect(parked.sessions.find((s) => s.id === 's-a')?.draft).toEqual(DRAFT_A)
    expect(parked.focusedId).toBe('s-a')
  })

  it('a (re-)announcement PRESERVES the draft (the resume flow parks before it announces)', () => {
    const parked = run(initialRegistryState(), CREATED_A, { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A })
    const reannounced = run(parked, scoped('s-a', { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a', model: 'm1', resumed: true }))
    expect(reannounced.sessions.find((s) => s.id === 's-a')?.draft).toEqual(DRAFT_A)
  })

  it('detaching the session drops its draft with the entry', () => {
    const parked = run(initialRegistryState(), CREATED_A, { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A })
    const detached = run(parked, scoped('s-a', { type: 'session_detached' }))
    expect(detached.sessions.find((s) => s.id === 's-a')).toBeUndefined()
  })

  it('draft parking does not disturb chat folding (adjacent events still fold)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      { type: 'set_session_draft', sessionId: 's-a', draft: DRAFT_A },
      scoped('s-a', { type: 'user_message', text: 'sent' }),
      scoped('s-a', { type: 'agent_start' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.chat.entries.map((e) => (e.role === 'user' ? e.text : ''))).toEqual(['sent'])
    expect(a?.chat.agentRunning).toBe(true)
    expect(a?.draft).toEqual(DRAFT_A)
  })
})

describe('registryReducer — the subagent bridge live state (ticket 90)', () => {
  it('folds a subagent_status snapshot as the runs record + fleet DTO', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', {
        type: 'subagent_status',
        requestId: 'req-1',
        available: true,
        runs: [{ runId: 'run-1', state: 'running', startedAt: 5 }],
        fleet: { entries: [], totalActive: 0, omitted: 0 }
      })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.runs['run-1']).toMatchObject({ runId: 'run-1', state: 'running' })
    expect(a?.subagents.fleet).toEqual({ entries: [], totalActive: 0, omitted: 0 })
  })

  it('a later AVAILABLE snapshot replaces the whole record (last writer wins)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', {
        type: 'subagent_status',
        requestId: 'req-1',
        available: true,
        runs: [{ runId: 'run-1', state: 'running' }],
        fleet: null
      }),
      scoped('s-a', {
        type: 'subagent_status',
        requestId: 'req-2',
        available: true,
        runs: [{ runId: 'run-2', state: 'complete', endedAt: 9 }],
        fleet: null
      })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(Object.keys(a?.subagents.runs ?? {})).toEqual(['run-2'])
    expect(a?.subagents.runs['run-2']?.state).toBe('complete')
  })

  it('a completion-event delta survives later snapshots that no longer see the run (artifact cleaned)', () => {
    // The P1 ordering: the async-complete event folds the terminal state
    // (no artifact left behind); the next AVAILABLE snapshot — built from
    // the artifacts, which no longer hold the run — must NOT erase it.
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'subagent_async_completed', runId: 'run-9', state: 'complete', success: true, summary: 'Done in 3 steps.' }),
      scoped('s-a', {
        type: 'subagent_status',
        requestId: 'req-later',
        available: true,
        runs: [{ runId: 'run-other', state: 'running' }],
        fleet: null
      })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.runs['run-9']).toMatchObject({ runId: 'run-9', state: 'complete', summary: 'Done in 3 steps.' })
    expect(a?.subagents.runs['run-other']?.state).toBe('running')
  })

  it('a foreground completion (no artifact at all) survives every later snapshot', () => {
    // Detached foreground children have NO async artifacts — the forwarded
    // foreground-complete event is their only terminal evidence, and
    // snapshots (artifact-derived) never contain them.
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'subagent_foreground_completed', runId: 'fg-7', success: true, state: 'complete', summary: 'ok' }),
      scoped('s-a', { type: 'subagent_status', requestId: 'req-1', available: true, runs: [], fleet: null }),
      scoped('s-a', { type: 'subagent_status', requestId: 'req-2', available: true, runs: [], fleet: null })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.runs['fg-7']).toMatchObject({ runId: 'fg-7', state: 'complete' })
  })

  it('a LIVE run missing from an available snapshot is dropped (no stale claim)', () => {
    // A running state whose artifact vanished (cleaned/repaired away) must
    // NOT stay running forever — the row falls back to the replay
    // projection's honest Lost.
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'subagent_async_started', runId: 'run-live' }),
      scoped('s-a', { type: 'subagent_status', requestId: 'req-1', available: true, runs: [], fleet: null })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.runs['run-live']).toBeUndefined()
  })

  it('an UNAVAILABLE snapshot means no information — the known live state stays', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', {
        type: 'subagent_status',
        requestId: 'req-1',
        available: true,
        runs: [{ runId: 'run-1', state: 'running' }],
        fleet: { entries: [], totalActive: 1, omitted: 0 }
      }),
      // The poll hitting a host-less session (supervisor degradation) must
      // not erase the last known live states.
      scoped('s-a', { type: 'subagent_status', requestId: 'req-2', available: false, runs: [], fleet: null }),
      scoped('s-a', { type: 'subagent_status', requestId: 'req-3', available: false, runs: [], fleet: null })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.runs['run-1']?.state).toBe('running')
    expect(a?.subagents.fleet).toEqual({ entries: [], totalActive: 1, omitted: 0 })
  })

  it('lifecycle events fold as deltas: async_started seeds Running, async_completed settles', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'subagent_async_started', runId: 'run-7', mode: 'single', agent: 'scout' }),
      scoped('s-a', { type: 'subagent_async_completed', runId: 'run-7', state: 'complete', success: true, summary: 'Done.' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.runs['run-7']).toMatchObject({ runId: 'run-7', state: 'complete', summary: 'Done.' })
  })

  it('a foreground completion settles a foreground run id (no asyncDir needed)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'subagent_foreground_completed', runId: 'fg-1', success: true, state: 'complete', summary: 'ok' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.runs['fg-1']).toMatchObject({ runId: 'fg-1', state: 'complete' })
  })

  it('child-status hints fold nowhere and unknown-scoped events do not crash', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'subagent_child_status', runId: 'r', childId: 'c', status: 'stopping', ts: 1 })
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.subagents.runs).toEqual({})
  })

  it('per-session isolation: the snapshot of session B never touches session A', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      scoped('s-b', {
        type: 'subagent_status',
        requestId: 'req-b',
        available: true,
        runs: [{ runId: 'run-b', state: 'running' }],
        fleet: null
      })
    )
    expect(state.sessions.find((s) => s.id === 's-a')?.subagents.runs).toEqual({})
    expect(state.sessions.find((s) => s.id === 's-b')?.subagents.runs['run-b']).toBeDefined()
  })

  it('session_created resets the live state (fresh session view, fresh snapshot)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      scoped('s-a', { type: 'subagent_async_started', runId: 'run-1' }),
      scoped('s-a', { type: 'session_created', sessionId: 's-a', cwd: '/tmp/a2', model: 'm3', resumed: true })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents).toEqual({ runs: {}, fleet: null, stopping: new Set() })
  })
})

// ---- ticket 101: the stop receipt's Stopping marker -------------------------

describe('registryReducer — the stop receipt fold (ticket 101)', () => {
  const STATUS_RUN = scoped('s-a', {
    type: 'subagent_status',
    requestId: 'req-0',
    available: true,
    runs: [{ runId: 'run-1', state: 'running', startedAt: 5 }],
    fleet: null
  })

  it('an accepted stop (ok:true) marks the run Stopping', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      STATUS_RUN,
      scoped('s-a', { type: 'subagent_stop_receipt', requestId: 'stop-1', asyncId: 'run-1', ok: true, state: 'stopping' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.stopping.has('run-1')).toBe(true)
    // The run itself keeps its live state — the terminal evidence hasn't
    // landed yet.
    expect(a?.subagents.runs['run-1']).toMatchObject({ state: 'running' })
  })

  it('a failed receipt changes nothing (the row keeps its live state)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      STATUS_RUN,
      scoped('s-a', { type: 'subagent_stop_receipt', requestId: 'stop-1', asyncId: 'run-1', ok: false, error: 'Async run not found' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.stopping.size).toBe(0)
  })

  it('a lifecycle completion clears the marker (terminal evidence landed)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      STATUS_RUN,
      scoped('s-a', { type: 'subagent_stop_receipt', requestId: 'stop-1', asyncId: 'run-1', ok: true, state: 'stopping' }),
      scoped('s-a', { type: 'subagent_async_completed', runId: 'run-1', state: 'stopped' })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.stopping.has('run-1')).toBe(false)
    expect(a?.subagents.runs['run-1']).toMatchObject({ state: 'stopped' })
  })

  it('a status snapshot that sees the run terminal clears the marker too', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      STATUS_RUN,
      scoped('s-a', { type: 'subagent_stop_receipt', requestId: 'stop-1', asyncId: 'run-1', ok: true, state: 'stopping' }),
      scoped('s-a', {
        type: 'subagent_status',
        requestId: 'req-2',
        available: true,
        runs: [{ runId: 'run-1', state: 'stopped', endedAt: 99 }],
        fleet: null
      })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.stopping.has('run-1')).toBe(false)
  })

  it('a status snapshot that still sees the run live keeps the marker', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      STATUS_RUN,
      scoped('s-a', { type: 'subagent_stop_receipt', requestId: 'stop-1', asyncId: 'run-1', ok: true, state: 'stopping' }),
      scoped('s-a', {
        type: 'subagent_status',
        requestId: 'req-2',
        available: true,
        runs: [{ runId: 'run-1', state: 'running', startedAt: 5 }],
        fleet: null
      })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.stopping.has('run-1')).toBe(true)
  })

  it('unavailable snapshots never touch the marker (no information, no change)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      STATUS_RUN,
      scoped('s-a', { type: 'subagent_stop_receipt', requestId: 'stop-1', asyncId: 'run-1', ok: true, state: 'stopping' }),
      scoped('s-a', { type: 'subagent_status', requestId: 'req-2', available: false, runs: [], fleet: null })
    )
    const a = state.sessions.find((s) => s.id === 's-a')
    expect(a?.subagents.stopping.has('run-1')).toBe(true)
  })

  it('the marker is per-session (session B never sees a stop of session A)', () => {
    const state = run(
      initialRegistryState(),
      CREATED_A,
      CREATED_B,
      STATUS_RUN,
      scoped('s-a', { type: 'subagent_stop_receipt', requestId: 'stop-1', asyncId: 'run-1', ok: true, state: 'stopping' })
    )
    const b = state.sessions.find((s) => s.id === 's-b')
    expect(b?.subagents.stopping.size).toBe(0)
  })
})
