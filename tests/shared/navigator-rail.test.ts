import { describe, expect, it } from 'vitest'
import {
  ANCHORED_OPACITY,
  BUBBLE_CLOSE_DELAY_MS,
  BUBBLE_OPEN_DELAY_MS,
  LIVE_MIN_OPACITY,
  LIVE_OPACITY,
  MUTED_OPACITY,
  RAIL_MIN_TICKS,
  RAIL_MIN_WINDOW_PX,
  TICK_SCALE_DECAY,
  TICK_SCALE_FLOOR,
  anchoredTurnId,
  railAnchors,
  railRenders,
  railShown,
  railTicks,
  type AnchorGeometry,
  type RailAnchor
} from '../../src/shared/navigator-rail'
import { chatReducer, initialChatState, type ChatState } from '../../src/shared/chat-reducer'
import { groupTurns } from '../../src/shared/turn-collapse'
import type { HostToParent } from '../../src/shared/contract'

const SESSION_CREATED: HostToParent = {
  type: 'session_created',
  sessionId: 's-1',
  cwd: '/tmp/proj',
  model: 'claude-opus-4-5'
}

function fold(state: ChatState, ...actions: HostToParent[]): ChatState {
  return actions.reduce((acc, action) => chatReducer(acc, action), state)
}

const USER = (text: string): HostToParent => ({ type: 'user_message', text })

/** One minimal settled turn: user message + streamed answer text. */
function answeredTurn(text: string): HostToParent[] {
  return [
    { type: 'agent_start' },
    { type: 'message_start' },
    { type: 'text_delta', delta: text },
    { type: 'message_end' },
    { type: 'agent_end' }
  ]
}

/** Build anchors from a scripted transcript (the real reducer → groupTurns path). */
function anchorsFor(...script: HostToParent[]): RailAnchor[] {
  const state = fold(initialChatState(), SESSION_CREATED, ...script)
  const running = state.agentRunning
  return railAnchors(groupTurns(state.entries, running))
}

describe('railAnchors (one tick per real user message, incl. steer/follow-up)', () => {
  it('derives one anchor per user turn with preview texts from the turn group', () => {
    const anchors = anchorsFor(
      USER('fix the bug'),
      ...answeredTurn('Fixed it.'),
      USER('now add tests'),
      ...answeredTurn('Tests added.')
    )
    expect(anchors).toHaveLength(2)
    expect(anchors[0].turnId).toBe('m0')
    expect(anchors[0].userText).toBe('fix the bug')
    expect(anchors[0].replyText).toBe('Fixed it.')
    expect(anchors[0].live).toBe(false)
    expect(anchors[1].turnId).toBe('m2')
    expect(anchors[1].userText).toBe('now add tests')
    expect(anchors[1].replyText).toBe('Tests added.')
  })

  it('marks only the live (streaming) turn as live', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      USER('first'),
      ...answeredTurn('done'),
      USER('second'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'working…' }
    )
    const anchors = railAnchors(groupTurns(state.entries, state.agentRunning))
    expect(anchors).toHaveLength(2)
    expect(anchors[0].live).toBe(false)
    expect(anchors[1].live).toBe(true)
  })

  it('strips the injected skill prologue from the preview text', () => {
    const anchors = anchorsFor(
      USER('<skill name="review" location="/skills/review/SKILL.md">\nReview body.\n</skill>\nReview my diff'),
      ...answeredTurn('Reviewed.')
    )
    expect(anchors).toHaveLength(1)
    expect(anchors[0].userText).toBe('Review my diff')
  })

  it('previews the LAST text block as the reply and keeps answerless turns empty (ticket 53)', () => {
    const anchors = anchorsFor(
      USER('two parts'),
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Part one.' },
      { type: 'message_end' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'Part two.' },
      { type: 'message_end' },
      { type: 'agent_end' },
      USER('no reply yet'),
      { type: 'agent_start' }
    )
    // The bubble preview mirrors the transcript: the turn's answer is its
    // last text block — the interim narration stays in the fold container.
    expect(anchors[0].replyText).toBe('Part two.')
    expect(anchors[1].replyText).toBe('')
  })

  it('skips the defensive head segment (entries before any user message)', () => {
    const state = fold(
      initialChatState(),
      SESSION_CREATED,
      { type: 'agent_start' },
      { type: 'message_start' },
      { type: 'text_delta', delta: 'orphan answer' },
      { type: 'message_end' },
      { type: 'agent_end' },
      USER('first real question'),
      ...answeredTurn('answer')
    )
    const anchors = railAnchors(groupTurns(state.entries, state.agentRunning))
    expect(anchors).toHaveLength(1)
    expect(anchors[0].turnId).toBe(state.entries.find((e) => e.role === 'user')?.id ?? null)
    expect(anchors[0].userText).toBe('first real question')
  })
})

describe('railTicks (Seam-1: anchor scoring — scaleX decay, tone, opacity table)', () => {
  const anchor = (turnId: string, live = false): RailAnchor => ({
    turnId,
    userText: `input ${turnId}`,
    replyText: `reply ${turnId}`,
    live
  })
  const ABC: RailAnchor[] = [anchor('a'), anchor('b'), anchor('c')]

  it('calibration constants match the ZCode-evidence values', () => {
    expect(RAIL_MIN_TICKS).toBe(2)
    expect(RAIL_MIN_WINDOW_PX).toBe(864)
    expect(ANCHORED_OPACITY).toBe(0.9)
    expect(LIVE_MIN_OPACITY).toBe(0.72)
    expect(BUBBLE_OPEN_DELAY_MS).toBe(120)
    expect(BUBBLE_CLOSE_DELAY_MS).toBe(80)
  })

  it('the viewport-anchored tick reads focus: full width, foreground tone, 0.9 opacity', () => {
    const ticks = railTicks(ABC, 'b')
    expect(ticks[1].tone).toBe('focus')
    expect(ticks[1].scaleX).toBe(1)
    expect(ticks[1].opacity).toBe(ANCHORED_OPACITY)
  })

  it('neighbor ticks decay in width by distance from the anchor, with a floor', () => {
    const ticks = railTicks(ABC, 'b')
    expect(ticks[0].tone).toBe('muted')
    expect(ticks[0].scaleX).toBeCloseTo(1 - TICK_SCALE_DECAY, 10)
    expect(ticks[2].scaleX).toBeCloseTo(1 - TICK_SCALE_DECAY, 10)
    // A far tick never thins below the floor (distance 9 → negative → floor).
    const far = railTicks(Array.from({ length: 10 }, (_, i) => anchor(`a${i}`)), 'a0')
    expect(far[9].scaleX).toBe(TICK_SCALE_FLOOR)
    expect(1 - 9 * TICK_SCALE_DECAY).toBeLessThan(TICK_SCALE_FLOOR)
    expect(TICK_SCALE_FLOOR).toBeLessThan(1 - 3 * TICK_SCALE_DECAY)
  })

  it('muted ticks sit at the muted opacity', () => {
    const ticks = railTicks(ABC, 'b')
    expect(ticks[0].opacity).toBe(MUTED_OPACITY)
    expect(ticks[2].opacity).toBe(MUTED_OPACITY)
  })

  it('the live (running) tick never drops below 0.72 opacity even while muted', () => {
    const ticks = railTicks([anchor('a'), anchor('b', true), anchor('c')], 'a')
    expect(ticks[1].tone).toBe('muted')
    expect(ticks[1].opacity).toBe(LIVE_OPACITY)
    expect(ticks[1].opacity).toBeGreaterThanOrEqual(LIVE_MIN_OPACITY)
  })

  it('anchored wins over live: a tick that is both reads anchored', () => {
    const ticks = railTicks([anchor('a'), anchor('b', true)], 'b')
    expect(ticks[1].tone).toBe('focus')
    expect(ticks[1].opacity).toBe(ANCHORED_OPACITY)
  })

  it('with no anchored turn (viewport above every message) all ticks read muted', () => {
    const ticks = railTicks([anchor('a', true), anchor('b')], null)
    expect(ticks.map((t) => t.tone)).toEqual(['muted', 'muted'])
    expect(ticks.map((t) => t.scaleX)).toEqual([TICK_SCALE_FLOOR, TICK_SCALE_FLOOR])
    // The live tick keeps its running-prominence opacity even then.
    expect(ticks[0].opacity).toBe(LIVE_OPACITY)
    expect(ticks[1].opacity).toBe(MUTED_OPACITY)
  })

  it('an unknown anchored id degrades to the muted table (no crash, no focus)', () => {
    const ticks = railTicks(ABC, 'missing')
    expect(ticks.every((t) => t.tone === 'muted')).toBe(true)
  })
})

describe('tick visibility rules (Seam-1: render gate + window threshold)', () => {
  it('renders the rail only from two ticks up (ZCode: <2 hidden)', () => {
    expect(railRenders(0)).toBe(false)
    expect(railRenders(1)).toBe(false)
    expect(railRenders(2)).toBe(true)
    expect(railRenders(17)).toBe(true)
  })

  it('hides the rail below the 864px window threshold (ZCode calibration)', () => {
    expect(railShown(0)).toBe(false)
    expect(railShown(863)).toBe(false)
    expect(railShown(864)).toBe(true)
    expect(railShown(2000)).toBe(true)
  })
})

describe('anchoredTurnId (which message anchors the viewport)', () => {
  const geometry: AnchorGeometry[] = [
    { turnId: 'm0', top: 100 },
    { turnId: 'm5', top: 400 },
    { turnId: 'm9', top: 900 }
  ]

  it('returns null before the first message and on an empty transcript', () => {
    expect(anchoredTurnId([], 5000)).toBeNull()
    expect(anchoredTurnId(geometry, 99)).toBeNull()
  })

  it('picks the last message at or above the probe line', () => {
    expect(anchoredTurnId(geometry, 100)).toBe('m0')
    expect(anchoredTurnId(geometry, 399)).toBe('m0')
    expect(anchoredTurnId(geometry, 400)).toBe('m5')
    expect(anchoredTurnId(geometry, 899)).toBe('m5')
    expect(anchoredTurnId(geometry, 100_000)).toBe('m9')
  })
})
