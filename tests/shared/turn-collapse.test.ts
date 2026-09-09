import { describe, expect, it } from 'vitest'
import {
  chatReducer,
  initialChatState,
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
    const state = fold(initialChatState(), SESSION_CREATED, USER('fix the bug'), ...streamedWorkTurn())
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

  it('table · post-answer thinking stays folded: only TOOLS leave the container after the answer', () => {
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
    expect(turn.work.map((w) => w.kind)).toEqual(['thinking'])
    expect(turn.afterAnswer.map((item) => item.kind)).toEqual(['tool'])
    expect(turn.hasWork).toBe(true)
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

  it('table · streaming tail: the in-flight last text streams as the answer, earlier text already folded', () => {
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
    expect(turn.answer).toMatchObject({ text: 'part two', streaming: true })
    expect(turn.work.map((w) => w.kind)).toEqual(['thinking', 'narration', 'thinking'])
    expect(turn.work[1]).toMatchObject({ kind: 'narration', text: 'part one.' })
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

  it('table · errored turn: the partial tail text is still the answer, narration stays folded', () => {
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
    const [turn] = groupTurns(state.entries, true)
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

  it('table: a plain question/answer turn has no work — no container', () => {
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
    expect(turn.answer?.text).toBe('Hello!')
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
