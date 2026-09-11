import { describe, expect, it } from 'vitest'
import type { ThinkingPart } from '../../src/shared/chat-reducer'
import { deriveThinkingDuration } from '../../src/shared/thinking-duration'

/**
 * Ticket 61 (spec R7): the thinking row's displayed seconds derive from the
 * ENTRY-LEVEL start timestamp recorded in reducer state when the part began
 * streaming — not from a component-local tick. Folding the container
 * unmounts the row; remounting derives from the SAME timestamp, so the count
 * continues instead of resetting (the pi15-thinking-timer-reset defect: 7s
 * became 3s across a fold/reopen).
 */

function part(overrides: Partial<ThinkingPart> = {}): ThinkingPart {
  return { kind: 'thinking', text: 'reasoning…', streaming: false, durationMs: null, ...overrides }
}

describe('deriveThinkingDuration — freeze priority (existing contract)', () => {
  it('a host-measured durationMs freezes the label, rounded', () => {
    expect(deriveThinkingDuration(part({ durationMs: 29_400 }), null, 0)).toEqual({
      timed: true,
      seconds: 29
    })
  })

  it('freeze wins even if the streaming flag were somehow still up', () => {
    // Unreachable via the reducer (thinking_end closes the part atomically),
    // but the table defines the winner: the frozen host measurement.
    expect(deriveThinkingDuration(part({ streaming: true, durationMs: 5_900, startedAtMs: 1_000 }), 61_000, 60)).toEqual({
      timed: true,
      seconds: 6
    })
  })

  it('sub-second durations clamp up to 1s', () => {
    expect(deriveThinkingDuration(part({ durationMs: 400 }), null, 0).seconds).toBe(1)
  })
})

describe('deriveThinkingDuration — stamped streaming (entry-level timer)', () => {
  it('derives (now − startedAt) floored, clamped to at least 1s', () => {
    expect(
      deriveThinkingDuration(part({ streaming: true, startedAtMs: 10_000 }), 17_000, 0).seconds
    ).toBe(7)
    expect(deriveThinkingDuration(part({ streaming: true, startedAtMs: 10_000 }), 10_200, 0).seconds).toBe(1)
  })

  it('the same start timestamp keeps counting across remounts (no reset)', () => {
    // Fold at +7s, reopen at +9s: the freshly remounted row derives from the
    // SAME stamp — 9s, not a restarted 1s.
    const streaming = part({ streaming: true, startedAtMs: 1_000 })
    expect(deriveThinkingDuration(streaming, 8_000, 0).seconds).toBe(7)
    expect(deriveThinkingDuration(streaming, 10_000, 0).seconds).toBe(9)
  })

  it('a stamp without a clock (first render before the tick) falls back to the local tick', () => {
    expect(deriveThinkingDuration(part({ streaming: true, startedAtMs: 1_000 }), null, 4)).toEqual({
      timed: true,
      seconds: 4
    })
  })
})

describe('deriveThinkingDuration — unstamped streaming (pre-61 fallback)', () => {
  it('falls back to the caller\u2019s local tick clock even when a now is available', () => {
    // Absence falls back to current behavior (ticket 61): the stamp is the
    // only trigger for wall-clock derivation — a bare now must NOT shorten
    // the fallback.
    expect(deriveThinkingDuration(part({ streaming: true }), 61_000, 3)).toEqual({
      timed: true,
      seconds: 3
    })
  })

  it('a fresh unstamped row clamps the 0 tick up to 1s', () => {
    expect(deriveThinkingDuration(part({ streaming: true }), null, 0).seconds).toBe(1)
  })
})

describe('deriveThinkingDuration — untimed degradation (ticket 14, zero regression)', () => {
  it('a replayed block (no recorded duration) renders untimed', () => {
    expect(deriveThinkingDuration(part({}), null, 0)).toEqual({ timed: false, seconds: null })
  })

  it('a block that never closed cleanly renders untimed — even with a stamp', () => {
    // Settled without thinking_end (settle/message_end path): the seconds
    // disappear, exactly as before ticket 61.
    expect(deriveThinkingDuration(part({ startedAtMs: 1_000 }), 9_000, 9)).toEqual({
      timed: false,
      seconds: null
    })
  })
})
