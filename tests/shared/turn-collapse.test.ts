import { describe, expect, it } from 'vitest'
import {
  chatReducer,
  initialChatState,
  replayEntry,
  type ChatAction,
  type ChatState
} from '../../src/shared/chat-reducer'
import { groupTurns, HEAD_TURN_ID, stripSkillPrologue } from '../../src/shared/turn-collapse'
import type { HostToParent } from '../../src/shared/contract'
import type { TranscriptItem } from '../../src/shared/sessions/types'

const SESSION_CREATED: HostToParent = {
  type: 'session_created',
  sessionId: 's-1',
  cwd: '/tmp/proj',
  model: 'claude-opus-4-5'
}

function fold(state: ChatState, ...actions: ChatAction[]): ChatState {
  return actions.reduce((acc, action) => chatReducer(acc, action), state)
}

const USER = (text: string): HostToParent => ({ type: 'user_message', text })

/** One streamed thinking + tool + answer turn (not settled — no agent_end).
 * Ticket 53: the first text part is INTERIM NARRATION — the model's narration
 * between tool calls; the last text part is the turn's answer. */
function streamedWorkTurn(toolId = 'tc-1'): HostToParent[] {
  return [
    { type: 'agent_start' },
    { type: 'message_start' },
    { type: 'thinking_delta', delta: 'plan the work' },
    { type: 'thinking_end', durationMs: 1200 },
    { type: 'text_delta', delta: 'Running checks.' },
    { type: 'message_end' },
    { type: 'tool_start', toolCallId: toolId, name: 'bash', args: { command: 'npm test' } },
    { type: 'tool_end', toolCallId: toolId, output: 'ok', isError: false },
    { type: 'message_start' },
    { type: 'text_delta', delta: 'All green.' },
    { type: 'message_end' }
  ]
}

describe('turn grouping (groupTurns) — ticket 53 answer split', () => {
  it('table · last text block: the settled answer is the turn\u0027s LAST text part only', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('fix the bug'),
      ...streamedWorkTurn(),
      { type: 'agent_end' }
    )
    const turns = groupTurns(state.entries, state.agentRunning)
    expect(turns).toHaveLength(1)
    const turn = turns[0]
    expect(turn.id).toBe('m0')
    expect(turn.user?.text).toBe('fix the bug')
    expect(turn.skillName).toBeNull()
    expect(turn.answer?.text).toBe('All green.')
    expect(turn.pendingApproval).toBe(false)
  })

  it('table · interim narration: earlier text parts fold into the container in transcript order', () => {
    const state = fold(initialChatState(), SESSION_CREATED, USER('fix the bug'), ...streamedWorkTurn())
    const [turn] = groupTurns(state.entries, false)
    expect(turn.work.map((w) => w.kind)).toEqual(['thinking', 'narration', 'tool'])
    expect(turn.work[1]).toMatchObject({ kind: 'narration', entryId: 'm1', text: 'Running checks.' })
    expect(turn.afterAnswer).toEqual([])
    // Narration is foldable content: it alone justifies the container row.
    expect(turn.hasWork).toBe(true)
  })

  it('table · narration-only split: two texts with no tools still fold the first one', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('q'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Halfway there.' },
      { type: 'message_end' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Done.' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.work.map((w) => [w.kind, (w as { text?: string }).text])).toEqual([['narration', 'Halfway there.']])
    expect(turn.answer?.text).toBe('Done.')
    expect(turn.hasWork).toBe(true)
  })

  it('table · post-answer tools: a tool that ran after the final text stays visible below it, outside the fold', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('deploy'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Shipped.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'tc-after', name: 'bash', args: { command: 'git status' } },
      { type: 'tool_end', toolCallId: 'tc-after', output: 'clean', isError: false },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.answer?.text).toBe('Shipped.')
    expect(turn.work).toEqual([])
    expect(turn.afterAnswer.map((item) => item.kind)).toEqual(['tool'])
    expect(turn.afterAnswer[0]).toMatchObject({ kind: 'tool', entry: { id: 'tc-after' } })
    // The after-answer rows render without the container, so they do not
    // make hasWork true (the container only folds what needs folding).
    expect(turn.hasWork).toBe(false)
  })

  it('table · post-answer thinking joins the segment: ALL rows after the last text stay visible below it (ticket 56 revises the ticket-53 Q11a cut)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('deploy'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Shipped.' },
      { type: 'message_end' },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'verify once more' },
      { type: 'thinking_end', durationMs: 300 },
      { type: 'tool_start', toolCallId: 'tc-verify', name: 'bash', args: { command: 'git log' } },
      { type: 'tool_end', toolCallId: 'tc-verify', output: 'ok', isError: false },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.answer?.text).toBe('Shipped.')
    // The thinking and the tool came after the answer — both render below it,
    // in transcript order (ZCode assistantFollowingRows shape). Nothing crawls
    // back into the container.
    expect(turn.afterAnswer.map((item) => item.kind)).toEqual(['thinking', 'tool'])
    expect(turn.work).toEqual([])
    expect(turn.hasWork).toBe(false)
  })

  it('table · post-answer segment holds transcript order: a thinking block after a post-answer tool renders BELOW the tool', () => {
    // pi15-post-answer-thinking-misplaced, fixed shape: answer → tool result →
    // the model's next thinking. The thinking renders after the tool, below
    // the answer — never back in the container, never above the answer.
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('check the deploy'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Deployed.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'tc-check', name: 'bash', args: { command: 'curl health' } },
      { type: 'tool_end', toolCallId: 'tc-check', output: '200 OK', isError: false },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'the health check passed, wrap up' },
      { type: 'thinking_end', durationMs: 4800 },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.answer?.text).toBe('Deployed.')
    expect(turn.afterAnswer.map((item) => item.kind)).toEqual(['tool', 'thinking'])
    expect(turn.work).toEqual([])
  })

  it('table · transcript order survives the split: narration between tools rolls the tools back into work', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('q'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'First look.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'tc-mid', name: 'bash', args: { command: 'ls' } },
      { type: 'tool_end', toolCallId: 'tc-mid', output: 'files', isError: false },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Final answer.' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    // The tool ran between the two texts — it belongs BEFORE the answer,
    // inside the fold, after the narration it followed.
    expect(turn.work.map((w) => w.kind)).toEqual(['narration', 'tool'])
    expect(turn.work[0]).toMatchObject({ kind: 'narration', text: 'First look.' })
    expect(turn.answer?.text).toBe('Final answer.')
    expect(turn.afterAnswer).toEqual([])
  })

  it('table · live stream: every text block is an inline stream item in transcript order — no answer, no segment (ticket 82)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('q'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'hmm' },
      { type: 'text_delta', delta: 'part one.' },
      { type: 'thinking_delta', delta: 'more' },
      { type: 'text_delta', delta: 'part two' }
    )
    const [turn] = groupTurns(state.entries, true)
    // Pure chronological single stream: no temporary answer is promoted
    // below the container, no after-answer segment exists while live.
    expect(turn.answer).toBeNull()
    expect(turn.afterAnswer).toEqual([])
    expect(turn.work.map((w) => w.kind)).toEqual(['thinking', 'text', 'thinking', 'text'])
    expect(turn.work[1]).toMatchObject({ kind: 'text', text: 'part one.', streaming: false })
    expect(turn.work[3]).toMatchObject({ kind: 'text', text: 'part two', streaming: true })
  })

  it('table · settle transition: agent_end re-splits the SAME entries into the ticket-53/56 shape in one move (ticket 82)', () => {
    const liveState = fold(initialChatState(), SESSION_CREATED, USER('fix the bug'), { type: 'agent_start' }, ...streamedWorkTurn())
    const [live] = groupTurns(liveState.entries, true)
    expect(live.answer).toBeNull()
    expect(live.work.map((w) => w.kind)).toEqual(['thinking', 'text', 'tool', 'text'])

    const settledState = fold(liveState, { type: 'agent_end' })
    const [settled] = groupTurns(settledState.entries, settledState.agentRunning)
    // Byte-identical to the pre-82 settled shape: the last text lifts below
    // the container as the answer, earlier text stays foldable narration,
    // the segment stays empty.
    expect(settled.answer?.text).toBe('All green.')
    expect(settled.work.map((w) => w.kind)).toEqual(['thinking', 'narration', 'tool'])
    expect(settled.afterAnswer).toEqual([])
  })

  it('table · no-text turn: thinking and tools alone leave the answer null (no answer block)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('run it'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'thinking_delta', delta: 'just do it' },
      { type: 'thinking_end', durationMs: 100 },
      { type: 'tool_start', toolCallId: 'tc-quiet', name: 'bash', args: { command: 'true' } },
      { type: 'tool_end', toolCallId: 'tc-quiet', output: '', isError: false },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.answer).toBeNull()
    expect(turn.afterAnswer).toEqual([])
    expect(turn.work.map((w) => w.kind)).toEqual(['thinking', 'tool'])
    expect(turn.hasWork).toBe(true)
  })

  it('table · errored turn: turn_error settles the run — the partial tail text becomes the answer, narration stays folded', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('do it'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Working on it.' },
      { type: 'message_end' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'partial' },
      { type: 'turn_error', message: 'model overloaded' }
    )
    // turn_error settles (agentRunning=false): the settled split applies.
    const [turn] = groupTurns(state.entries, state.agentRunning)
    expect(turn.answer).toMatchObject({ text: 'partial', streaming: false })
    expect(turn.work.map((w) => w.kind)).toEqual(['narration'])
  })

  it('table · each user message opens a new turn — the boundary is the user entry', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('first'),
      ...streamedWorkTurn('tc-a'),
      { type: 'agent_end' },
      USER('second'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Second answer.' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    const turns = groupTurns(state.entries, false)
    expect(turns.map((t) => t.id)).toEqual(['m0', 'm4'])
    expect(turns[0].answer?.text).toBe('All green.')
    expect(turns[1].answer?.text).toBe('Second answer.')
    expect(turns[1].work).toEqual([])
  })

  it('table: entries before the first user message land in a defensive head segment', () => {
    const state = fold(initialChatState(), { type: 'tool_start', toolCallId: 'tc-x', name: 'bash', args: {} })
    const turns = groupTurns(state.entries, false)
    expect(turns).toHaveLength(1)
    expect(turns[0].id).toBe(HEAD_TURN_ID)
    expect(turns[0].user).toBeNull()
    expect(turns[0].work.map((w) => w.kind)).toEqual(['tool'])
    expect(turns[0].answer).toBeNull()
  })

  it('table: a sniffed skill marker rides on the turn of its user message', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('<skill name="grilling" location="~/.pi/agent/skills/grilling/SKILL.md">\nGrill the plan.\n</skill>\nNow go')
    )
    const turns = groupTurns(state.entries, false)
    expect(turns[0].skillName).toBe('grilling')
    expect(turns[0].hasWork).toBe(true)
    // The injected prologue never shows in the bubble — the marker row carries
    // it instead (ZCode evidence: clean user bubbles + skill row inside).
    expect(turns[0].userText).toBe('Now go')
    expect(turns[0].user?.text).toContain('<skill name="grilling"')
  })

  it('table: skill prologue stripping is defensive — plain text and odd shapes pass through', () => {
    expect(stripSkillPrologue('plain message', null)).toBe('plain message')
    expect(stripSkillPrologue('<skill name="x" location="l">\nbody\n</skill>\n', 'x')).toBe('')
    // Unbalanced markup with a sniffed name: raw text is the honest fallback.
    expect(stripSkillPrologue('<skill name="x"> never closed', 'x')).toBe('<skill name="x"> never closed')
  })

  it('table: replayed history groups isomorphically — thinking/tools inside, text outside', () => {
    const items: TranscriptItem[] = [
      { role: 'user', id: 'r-u1', text: 'investigate', timestamp: 't1', skillName: null },
      {
        role: 'assistant',
        id: 'r-a1',
        timestamp: 't2',
        text: '',
        parts: [{ kind: 'thinking', text: 'hmm', durationMs: null }]
      },
      { role: 'tool', id: 'r-t1', timestamp: 't3', name: 'bash', args: {}, output: 'out', isError: false },
      {
        role: 'assistant',
        id: 'r-a2',
        timestamp: 't4',
        text: 'done',
        parts: [
          { kind: 'thinking', text: 'again', durationMs: null },
          { kind: 'text', text: 'done' }
        ]
      }
    ]
    const state = fold(initialChatState(), SESSION_CREATED, { type: 'history_loaded', items })
    const turns = groupTurns(state.entries, false)
    expect(turns).toHaveLength(1)
    expect(turns[0].id).toBe('r-u1')
    expect(turns[0].work.map((w) => w.kind)).toEqual(['thinking', 'tool', 'thinking'])
    expect(turns[0].answer?.text).toBe('done')
  })

  it('table: only the last turn is live while the agent runs', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('first'),
      ...streamedWorkTurn('tc-a'),
      { type: 'agent_end' },
      USER('second'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'streaming…' }
    )
    const turns = groupTurns(state.entries, state.agentRunning)
    expect(turns.map((t) => t.live)).toEqual([false, true])
  })

  it('table: the answer carries its source entry id — the fork anchor (last text-bearing entry)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('fix the bug'),
      ...streamedWorkTurn(),
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    // Two text parts from two assistant entries; the answer is the LAST one,
    // and its entry is the fork anchor (unchanged semantics, ticket 53 —
    // forking there keeps the whole answer turn on the branch).
    expect(turn.answer?.entryId).toBe('m3')
  })

  it('table · no re-split while live: a new text block appends to the stream — nothing promotes, nothing demotes (ticket 82)', () => {
    // Stream text then a tool, then let a NEW text block start: the pure
    // chronological stream is append-only. The first text keeps its slot as
    // an inline stream item, the tool keeps the slot it happened in, the new
    // tail appends — no demotion carousel, no segment churn.
    const midStream = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('iterate'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'First cut.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'tc-mid2', name: 'bash', args: { command: 'ls' } },
      { type: 'tool_end', toolCallId: 'tc-mid2', output: 'files', isError: false }
    )
    const [before] = groupTurns(midStream.entries, true)
    expect(before.answer).toBeNull()
    expect(before.work.map((w) => w.kind)).toEqual(['text', 'tool'])

    const after = fold(midStream, { type: 'message_start' }, { type: 'text_delta', delta: 'Second cut' })
    const [turn] = groupTurns(after.entries, true)
    expect(turn.answer).toBeNull()
    expect(turn.afterAnswer).toEqual([])
    expect(turn.work.map((w) => w.kind)).toEqual(['text', 'tool', 'text'])
    expect(turn.work[0]).toMatchObject({ kind: 'text', text: 'First cut.', streaming: false })
    expect(turn.work[1]).toMatchObject({ kind: 'tool', entry: { id: 'tc-mid2' } })
    expect(turn.work[2]).toMatchObject({ kind: 'text', text: 'Second cut', streaming: true })
  })

  it('table · no re-split while live: a pending pill keeps its inline slot and the stream auto-stays open (ticket 82)', () => {
    const withPill = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('course correct'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Replanning.' },
      { type: 'message_end' },
      { type: 'approval_required', toolCallId: 'tc-roll', toolName: 'bash', args: { command: 'reset' } }
    )
    const [live] = groupTurns(withPill.entries, true)
    expect(live.work.map((w) => w.kind)).toEqual(['text', 'approval'])
    expect(live.pendingApproval).toBe(true)
    const after = fold(withPill, { type: 'message_start' }, { type: 'text_delta', delta: 'New plan' })
    const [turn] = groupTurns(after.entries, true)
    // The pill never rolls back — the stream is append-only; the pill keeps
    // the slot its tool card will occupy, and the gate ask keeps the fold open.
    expect(turn.work.map((w) => w.kind)).toEqual(['text', 'approval', 'text'])
    expect(turn.pendingApproval).toBe(true)
  })

  it('table: a pending approval keeps its turn flagged', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('deploy it'),
      { type: 'agent_start' },
      {
        type: 'approval_required',
        toolCallId: 'tc-9',
        toolName: 'bash',
        args: { command: 'deploy' }
      }
    )
    const [turn] = groupTurns(state.entries, true)
    expect(turn.pendingApproval).toBe(true)
    const [resolved] = groupTurns(
      chatReducer(state, { type: 'approval_resolved', toolCallId: 'tc-9', approved: false, reason: 'no' }).entries,
      false
    )
    expect(resolved.pendingApproval).toBe(false)
  })

  it('table · pending approval parks in the live stream at its tool\'s future slot (ticket 82 revises the ticket-56 live shape)', () => {
    // The gate asks after text streamed: the pill is INLINE in the
    // chronological stream — the exact slot its tool card will occupy —
    // never promoted above or below anything.
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('ship it'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Ready to deploy.' },
      { type: 'message_end' },
      { type: 'approval_required', toolCallId: 'tc-gate', toolName: 'bash', args: { command: 'deploy' } }
    )
    const [turn] = groupTurns(state.entries, true)
    expect(turn.answer).toBeNull()
    expect(turn.afterAnswer).toEqual([])
    expect(turn.work.map((w) => w.kind)).toEqual(['text', 'approval'])
    expect(turn.work[1]).toMatchObject({ kind: 'approval', entry: { id: 'tc-gate', state: 'pending' } })
    // The pill lives inside the fold (the whole stream is the fold while
    // live) — it keeps the container open for the decision.
    expect(turn.pendingApproval).toBe(true)
    expect(turn.hasWork).toBe(true)
  })

  it('table · approval two states, one slot: the pill converts IN PLACE to the tool card in the live stream, then joins the settled segment (ticket 82)', () => {
    // The host sequence after a real approve: approval_resolved(approved),
    // then tool_start (the reducer converts the pill at the SAME entry
    // index). While live, the stream slot holds first the pill, then the
    // card; at settle the tool joins the after-answer segment below the
    // answer — the ticket-56 settled shape, byte-identical.
    const pending = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('ship it'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Ready to deploy.' },
      { type: 'message_end' },
      { type: 'approval_required', toolCallId: 'tc-gate', toolName: 'bash', args: { command: 'deploy' } }
    )
    const resolved = fold(pending, { type: 'approval_resolved', toolCallId: 'tc-gate', approved: true, reason: null })
    const [resolvedTurn] = groupTurns(resolved.entries, true)
    expect(resolvedTurn.work).toHaveLength(2)
    expect(resolvedTurn.work[1]).toMatchObject({ kind: 'approval', entry: { id: 'tc-gate', state: 'approved' } })

    const executed = fold(
      resolved,
      { type: 'tool_start', toolCallId: 'tc-gate', name: 'bash', args: { command: 'deploy' } },
      { type: 'tool_end', toolCallId: 'tc-gate', output: 'deployed', isError: false }
    )
    const [executedTurn] = groupTurns(executed.entries, true)
    // Same single stream slot: the pill became the tool card. The stream
    // neither grew a duplicate row nor reordered.
    expect(executedTurn.work).toHaveLength(2)
    expect(executedTurn.work[1]).toMatchObject({ kind: 'tool', entry: { id: 'tc-gate', state: 'done' } })

    const settledState = fold(executed, { type: 'agent_end' })
    const [settled] = groupTurns(settledState.entries, false)
    expect(settled.answer?.text).toBe('Ready to deploy.')
    expect(settled.work).toEqual([])
    expect(settled.afterAnswer).toHaveLength(1)
    expect(settled.afterAnswer[0]).toMatchObject({ kind: 'tool', entry: { id: 'tc-gate', state: 'done' } })
  })

  it('table · pending approval BEFORE the answer stays foldable work — the fold auto-opens for it', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('deploy it'),
      { type: 'agent_start' },
      { type: 'approval_required', toolCallId: 'tc-early', toolName: 'bash', args: { command: 'deploy' } }
    )
    const [turn] = groupTurns(state.entries, true)
    expect(turn.work.map((w) => w.kind)).toEqual(['approval'])
    expect(turn.afterAnswer).toEqual([])
    // No answer yet — the pill lives inside the fold, so the fold opens.
    expect(turn.pendingApproval).toBe(true)
  })

  it('table: a plain question/answer turn has no foldable work — but still owns its container (ticket 55)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('hi'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Hello!' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.hasWork).toBe(false)
    expect(turn.hasContainer).toBe(true)
    expect(turn.answer?.text).toBe('Hello!')
  })
})

describe('worked container presence (groupTurns) — ticket 55, operator-approved ZCode deviation', () => {
  it('table · zero-work live: the silent-period turn owns its container before the first work item exists', () => {
    // The user message is echoed, the agent started, nothing streamed yet —
    // exactly the interval the old `(hasWork || live)` shell covered with a
    // row that vanished on settle. The container is now unconditional.
    const state = fold(initialChatState(), SESSION_CREATED, USER('hello?'), { type: 'agent_start' })
    const [turn] = groupTurns(state.entries, state.agentRunning)
    expect(turn.user).not.toBeNull()
    expect(turn.live).toBe(true)
    expect(turn.answer).toBeNull()
    expect(turn.hasWork).toBe(false) // empty body…
    expect(turn.hasContainer).toBe(true) // …but the row is there
  })

  it('table · zero-work settled: the streamed pure-text turn keeps its container after settling', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('hi'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Hello!' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, state.agentRunning)
    expect(turn.live).toBe(false)
    expect(turn.hasWork).toBe(false)
    expect(turn.hasContainer).toBe(true)
    expect(turn.answer?.text).toBe('Hello!')
  })

  it('table · zero-work replay: a replayed pure-text turn owns the same container (FollowView shares the model)', () => {
    const items: TranscriptItem[] = [
      { role: 'user', id: 'r-u1', text: 'hello', timestamp: 't1', skillName: null },
      {
        role: 'assistant',
        id: 'r-a1',
        timestamp: 't2',
        text: 'Hello!',
        parts: [{ kind: 'text', text: 'Hello!' }]
      }
    ]
    const state = fold(initialChatState(), SESSION_CREATED, { type: 'history_loaded', items })
    const [turn] = groupTurns(state.entries, false)
    expect(turn.hasWork).toBe(false)
    expect(turn.hasContainer).toBe(true)
  })

  it('table · with-work states: streamed and settled work turns keep their containers (ticket 23 unchanged)', () => {
    const liveState = fold(initialChatState(), SESSION_CREATED, USER('fix the bug'), { type: 'agent_start' }, ...streamedWorkTurn())
    const [live] = groupTurns(liveState.entries, liveState.agentRunning)
    expect(live.live).toBe(true)
    expect(live.hasWork).toBe(true)
    expect(live.hasContainer).toBe(true)

    const settledState = fold(liveState, { type: 'agent_end' })
    const [settled] = groupTurns(settledState.entries, settledState.agentRunning)
    expect(settled.live).toBe(false)
    expect(settled.hasWork).toBe(true)
    expect(settled.hasContainer).toBe(true)
  })

  it('table · HEAD turn status quo: a head segment with foldable work renders; an empty head segment does not', () => {
    // With work (entries before the first user message): renders, as before.
    const withWork = fold(initialChatState(), SESSION_CREATED, { type: 'tool_start', toolCallId: 'tc-x', name: 'bash', args: {} })
    const [head] = groupTurns(withWork.entries, false)
    expect(head.user).toBeNull()
    expect(head.hasWork).toBe(true)
    expect(head.hasContainer).toBe(true)

    // Defensive empty head (an assistant entry with no parts): nothing to
    // fold, not live — no row, exactly the ticket-23 behavior.
    const [emptyHead] = groupTurns([{ role: 'assistant', id: 'm0', parts: [], streaming: false }], false)
    expect(emptyHead.id).toBe(HEAD_TURN_ID)
    expect(emptyHead.hasWork).toBe(false)
    expect(emptyHead.hasContainer).toBe(false)
  })

  it('table · skill-only turn: the marker row is body content — the container stays expandable', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('<skill name="grilling" location="~/.pi/agent/skills/grilling/SKILL.md">\nGrill it.\n</skill>\nGo')
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.skillName).toBe('grilling')
    expect(turn.work).toEqual([])
    expect(turn.hasWork).toBe(true) // body non-empty (the marker row)…
    expect(turn.hasContainer).toBe(true) // …and the row, like every turn
  })

  it('table · live HEAD turn keeps the ticket-23 live-shell behavior', () => {
    const state = fold(initialChatState(), SESSION_CREATED, { type: 'tool_start', toolCallId: 'tc-x', name: 'bash', args: {} })
    const [head] = groupTurns(state.entries, true)
    expect(head.user).toBeNull()
    expect(head.live).toBe(true)
    expect(head.hasContainer).toBe(true)
  })
})

describe('turn-collapse state machine (chatReducer)', () => {
  it('live turn auto-expands at agent_start and stays open while streaming', () => {
    const state = fold(initialChatState(), SESSION_CREATED, USER('fix the bug'), { type: 'agent_start' })
    expect(state.expandedTurns.has('m0')).toBe(true)
    const streaming = fold(state, ...streamedWorkTurn())
    expect(streaming.expandedTurns.has('m0')).toBe(true)
    expect(streaming.agentRunning).toBe(true)
  })

  it('settle folds the finished turn away (agent_end auto-collapse)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('fix the bug'),
      { type: 'agent_start' },
      ...streamedWorkTurn(),
      { type: 'agent_end' }
    )
    expect(state.agentRunning).toBe(false)
    expect(state.expandedTurns.has('m0')).toBe(false)
    // And the grouping agrees: nothing is live anymore.
    expect(groupTurns(state.entries, state.agentRunning).map((t) => t.live)).toEqual([false])
  })

  it('opening a new turn folds the previous live one (steering mid-run)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('first'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'working…' },
      USER('steer: change course')
    )
    expect(state.expandedTurns.has('m0')).toBe(false)
    expect(state.expandedTurns.has('m2')).toBe(true)
  })

  it('exception: a turn_error keeps its turn expanded and marks it errored', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('do it'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'partial' },
      { type: 'turn_error', message: 'model overloaded' }
    )
    expect(state.erroredTurns.has('m0')).toBe(true)
    expect(state.expandedTurns.has('m0')).toBe(true)
    // A following turn does not fold the errored one away.
    const next = fold(state, USER('try again'), { type: 'agent_start' }, { type: 'message_start' }, { type: 'text_delta', delta: 'ok' }, { type: 'agent_end' })
    expect(next.expandedTurns.has('m0')).toBe(true)
    expect(next.expandedTurns.has('m2')).toBe(false)
    expect(next.erroredTurns.has('m0')).toBe(true)
  })

  it('a crashed host settles like any run end — the turn folds, the banner explains', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('do it'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'partial' },
      { type: 'host_exit', clean: false, code: 1, signal: null }
    )
    expect(state.expandedTurns.has('m0')).toBe(false)
    expect(state.erroredTurns.has('m0')).toBe(false)
    expect(state.error?.kind).toBe('host')
  })

  it('memory rule: replay (history_loaded) resets to all-collapsed — no expansion survives a switch', () => {
    const erroredAndOpen = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('do it'),
      { type: 'agent_start' },
      { type: 'turn_error', message: 'boom' }
    )
    expect(erroredAndOpen.expandedTurns.size).toBe(1)
    const items: TranscriptItem[] = [
      { role: 'user', id: 'r-u1', text: 'replayed', timestamp: 't1', skillName: null },
      {
        role: 'assistant',
        id: 'r-a1',
        timestamp: 't2',
        text: 'answer',
        parts: [{ kind: 'text', text: 'answer' }]
      }
    ]
    const state = fold(erroredAndOpen, { type: 'history_loaded', items })
    expect(state.expandedTurns.size).toBe(0)
    expect(state.erroredTurns.size).toBe(0)
  })

  it('memory rule: session_created starts from a clean machine', () => {
    const erroredAndOpen = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('do it'),
      { type: 'agent_start' },
      { type: 'turn_error', message: 'boom' }
    )
    const rebuilt = chatReducer(erroredAndOpen, { ...SESSION_CREATED, sessionId: 's-2' })
    expect(rebuilt.expandedTurns.size).toBe(0)
    expect(rebuilt.erroredTurns.size).toBe(0)
  })

  it('toggle flips a settled turn open and closed', () => {
    const settled = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('fix the bug'),
      { type: 'agent_start' },
      ...streamedWorkTurn(),
      { type: 'agent_end' }
    )
    expect(settled.expandedTurns.has('m0')).toBe(false)
    const opened = chatReducer(settled, { type: 'toggle_turn_expanded', turnId: 'm0' })
    expect(opened.expandedTurns.has('m0')).toBe(true)
    const closed = chatReducer(opened, { type: 'toggle_turn_expanded', turnId: 'm0' })
    expect(closed.expandedTurns.has('m0')).toBe(false)
  })

  it('a manual mid-stream collapse sticks until the turn settles', () => {
    const live = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('fix the bug'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'working…' }
    )
    const collapsed = chatReducer(live, { type: 'toggle_turn_expanded', turnId: 'm0' })
    expect(collapsed.expandedTurns.has('m0')).toBe(false)
    const more = fold(collapsed, { type: 'text_delta', delta: ' still working' }, { type: 'message_end' }, { type: 'agent_end' })
    expect(more.expandedTurns.has('m0')).toBe(false)
  })

  it('a new prompt folds manual opens too — only the new turn (and errored turns) stay open', () => {
    const settled = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('first'),
      { type: 'agent_start' },
      ...streamedWorkTurn('tc-a'),
      { type: 'agent_end' }
    )
    const opened = chatReducer(settled, { type: 'toggle_turn_expanded', turnId: 'm0' })
    expect(opened.expandedTurns.has('m0')).toBe(true)
    const second = fold(opened, USER('second'), { type: 'agent_start' }, ...streamedWorkTurn('tc-b'), { type: 'agent_end' })
    expect(second.expandedTurns.has('m0')).toBe(false)
    expect(second.expandedTurns.has('m2')).toBe(false)
    expect(second.erroredTurns.size).toBe(0)
  })

  it('machine invariants: expansion never contains unknown turns after settle', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('first'),
      { type: 'agent_start' },
      ...streamedWorkTurn('tc-a'),
      { type: 'agent_end' },
      USER('second'),
      { type: 'agent_start' },
      ...streamedWorkTurn('tc-b'),
      { type: 'agent_end' }
    )
    expect(state.expandedTurns.size).toBe(0)
    expect(state.erroredTurns.size).toBe(0)
  })
})

describe('chatReducer — UI toggle action', () => {
  it('the toggle action folds into the same reducer as contract events', () => {
    const settled = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('q'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'a' },
      { type: 'message_end' },
      { type: 'agent_end' }
    )
    const toggled = fold(settled, { type: 'toggle_turn_expanded', turnId: 'm0' })
    expect(toggled.entries).toBe(settled.entries)
    expect(toggled.expandedTurns.has('m0')).toBe(true)
  })
})

describe('groupTurns — turn file changes (ticket 78)', () => {
  const EDIT_DIFF_A = '+ 1 a-one'
  const EDIT_DIFF_B = '- 2 gone\n+ 2 back'

  /** One live turn: an edit inside the fold, an answer, an edit + a read
   * after it, a write at the tail. The bar aggregates every settled
   * edit/write in the TURN — fold and segment alike. */
  function mixedTurnState(): ChatState {
    return fold(
      initialChatState(),
      SESSION_CREATED,
      USER('change some files'),
      { type: 'agent_start' },
      { type: 'tool_start', toolCallId: 'e1', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e1', output: 'ok', isError: false, diff: EDIT_DIFF_A },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Done editing.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'e2', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e2', output: 'ok', isError: false, diff: EDIT_DIFF_B },
      { type: 'tool_start', toolCallId: 'r1', name: 'read', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'r1', output: 'contents', isError: false },
      { type: 'tool_start', toolCallId: 'w1', name: 'write', args: { path: 'docs/new.md' } },
      { type: 'tool_end', toolCallId: 'w1', output: 'Successfully wrote to docs/new.md', isError: false }
    )
  }

  it('aggregates the turn\u0027s settled edit/write calls across fold and after-answer segment', () => {
    const state = mixedTurnState()
    const [turn] = groupTurns(state.entries, false)
    expect(turn.fileChanges).toEqual([
      { path: 'src/a.ts', added: 2, removed: 1, diff: `${EDIT_DIFF_A}\n${EDIT_DIFF_B}`, calls: 2 },
      { path: 'docs/new.md', added: null, removed: 0, diff: '', calls: 1 }
    ])
  })

  it('a turn with no settled edit/write aggregates to NO bar (无更改回合不出条)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('just explain'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Explanation.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'r1', name: 'read', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'r1', output: 'contents', isError: false },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.fileChanges).toEqual([])
  })

  it('table · settled-only gate: a LIVE turn carries NO fileChanges even with settled edits in the stream (ticket 92)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('change files'),
      { type: 'agent_start' },
      { type: 'tool_start', toolCallId: 'e1', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e1', output: 'ok', isError: false, diff: EDIT_DIFF_A },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Halfway.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'e2', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e2', output: 'ok', isError: false, diff: EDIT_DIFF_B }
    )
    const [turn] = groupTurns(state.entries, true)
    expect(turn.answer).toBeNull()
    // Ticket 92: the bar is settled-only — the live stream never grows it,
    // no matter how many edit calls have already landed.
    expect(turn.fileChanges).toEqual([])
  })

  it('the same turn aggregates in transcript order the moment it settles (ticket-78 semantics intact)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('change files'),
      { type: 'agent_start' },
      { type: 'tool_start', toolCallId: 'e1', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e1', output: 'ok', isError: false, diff: EDIT_DIFF_A },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Halfway.' },
      { type: 'message_end' },
      { type: 'tool_start', toolCallId: 'e2', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e2', output: 'ok', isError: false, diff: EDIT_DIFF_B },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    // agent_end lands the bar in one move — the inline text between the
    // edits reorders nothing (same transcript-order aggregation as 78).
    expect(turn.fileChanges).toEqual([
      { path: 'src/a.ts', added: 2, removed: 1, diff: `${EDIT_DIFF_A}\n${EDIT_DIFF_B}`, calls: 2 }
    ])
  })

  it('while live even a DONE edit stays out of the bar — settle brings it in (ticket 92)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('edit away'),
      { type: 'agent_start' },
      { type: 'tool_start', toolCallId: 'e1', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e1', output: 'ok', isError: false, diff: EDIT_DIFF_A }
    )
    expect(groupTurns(state.entries, true)[0].fileChanges).toEqual([])
    const settled = fold(state, { type: 'agent_end' })
    const [turn] = groupTurns(settled.entries, false)
    expect(turn.fileChanges).toEqual([{ path: 'src/a.ts', added: 1, removed: 0, diff: EDIT_DIFF_A, calls: 1 }])
  })

  it('a STOP-interrupted turn still shows the bar — done edits count, the tool killed mid-run does not (票 92 中断照出)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('edit away'),
      { type: 'agent_start' },
      { type: 'tool_start', toolCallId: 'e1', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e1', output: 'ok', isError: false, diff: EDIT_DIFF_A },
      // The interrupt lands mid-tool: settle marks it error — it changed
      // nothing, the earlier done edit did. agent_end is exactly what a
      // user Stop produces (the aborted run's settle event).
      { type: 'tool_start', toolCallId: 'e2', name: 'edit', args: { path: 'src/b.ts' } },
      { type: 'agent_end' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.fileChanges).toEqual([{ path: 'src/a.ts', added: 1, removed: 0, diff: EDIT_DIFF_A, calls: 1 }])
  })

  it('an ERRORED turn still shows the bar (票 92 出错照出 — fact projection)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('edit away'),
      { type: 'agent_start' },
      { type: 'tool_start', toolCallId: 'e1', name: 'edit', args: { path: 'src/a.ts' } },
      { type: 'tool_end', toolCallId: 'e1', output: 'ok', isError: false, diff: EDIT_DIFF_A },
      { type: 'turn_error', message: 'model overloaded' }
    )
    const [turn] = groupTurns(state.entries, false)
    expect(turn.fileChanges).toEqual([{ path: 'src/a.ts', added: 1, removed: 0, diff: EDIT_DIFF_A, calls: 1 }])
  })

  it('FollowView projection: replayed items through groupTurns(entries, false) keep the settled bar (票 92 FollowView 同规)', () => {
    const items: TranscriptItem[] = [
      { role: 'user', id: 'fv-u1', text: 'change files', timestamp: 't1', skillName: null },
      {
        role: 'tool',
        id: 'fv-e1',
        timestamp: 't2',
        name: 'edit',
        args: { path: 'src/a.ts' },
        output: 'ok',
        isError: false,
        diff: EDIT_DIFF_A
      },
      { role: 'assistant', id: 'fv-a1', timestamp: 't3', text: 'Done.', parts: [{ kind: 'text', text: 'Done.' }] }
    ]
    // FollowView maps the transcript through replayEntry and groups with
    // agentRunning=false — replay IS the settled projection, so the bar
    // renders exactly where the chat view's settled turns render theirs.
    const [turn] = groupTurns(items.map(replayEntry), false)
    expect(turn.fileChanges).toEqual([{ path: 'src/a.ts', added: 1, removed: 0, diff: EDIT_DIFF_A, calls: 1 }])
  })
})
