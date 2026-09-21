import { describe, expect, it } from 'vitest'
import type { ApprovalEntry, AssistantEntry, ChatEntry, ToolEntry, UserEntry } from '../../src/shared/chat-reducer'
import {
  deriveWorkedSeconds,
  deriveWorkingSeconds,
  entryStampMs,
  turnStamps,
  type TurnStamps
} from '../../src/shared/turn-duration'

/** Entry builders — `stamp` mirrors what the reducer copies from the
 * dispatch boundary's receipt (live) or the parse of the recorded
 * timestamp (replay); undefined = un-stamped shape. */
const user = (startedAtMs?: number): UserEntry => ({ id: 'u1', role: 'user', text: 'q', skillName: null, ...(startedAtMs !== undefined ? { startedAtMs } : {}) })
const assistant = (endedAtMs?: number): AssistantEntry => ({
  id: 'a1',
  role: 'assistant',
  parts: [{ kind: 'text', text: 'answer' }],
  streaming: false,
  ...(endedAtMs !== undefined ? { endedAtMs } : {})
})
const tool = (startedAtMs?: number): ToolEntry => ({
  id: 't1',
  role: 'tool',
  name: 'bash',
  args: {},
  state: 'done',
  output: 'ok',
  ...(startedAtMs !== undefined ? { startedAtMs } : {})
})
const approval = (): ApprovalEntry => ({ id: 'p1', role: 'approval', toolName: 'bash', args: {}, state: 'pending', reason: null })

describe('turnStamps — R29 anchor selection + R30 first→last span (ticket 108)', () => {
  it('table · entry stamps: user/assistant/tool carry theirs, approval records none', () => {
    expect(entryStampMs(user(1_000))).toBe(1_000)
    expect(entryStampMs(user())).toBeNull()
    expect(entryStampMs(assistant(2_000))).toBe(2_000)
    expect(entryStampMs(assistant())).toBeNull()
    expect(entryStampMs(tool(3_000))).toBe(3_000)
    expect(entryStampMs(tool())).toBeNull()
    expect(entryStampMs(approval())).toBeNull()
  })

  it('table · anchor = the boundary user message when stamped (it opens the turn)', () => {
    const stamps: TurnStamps = turnStamps([user(1_000), tool(2_000), assistant(3_000)])
    expect(stamps).toEqual({ startedAtMs: 1_000, endedAtMs: 3_000 })
  })

  it('table · anchor falls to the first stamped WORK entry (首工作项) when the user entry is un-stamped', () => {
    const stamps = turnStamps([user(), tool(2_000), assistant(3_000)])
    expect(stamps).toEqual({ startedAtMs: 2_000, endedAtMs: 3_000 })
  })

  it('table · head turn (no user entry): first stamped work entry anchors', () => {
    const stamps = turnStamps([tool(5_000), assistant(6_000)])
    expect(stamps).toEqual({ startedAtMs: 5_000, endedAtMs: 6_000 })
  })

  it('table · approval entries are invisible to the span (no stamp, never extends it)', () => {
    expect(turnStamps([user(1_000), approval(), assistant(3_000)])).toEqual({ startedAtMs: 1_000, endedAtMs: 3_000 })
    // An approval LAST in the turn can't extend the end either.
    expect(turnStamps([user(1_000), assistant(3_000), approval()])).toEqual({ startedAtMs: 1_000, endedAtMs: 3_000 })
  })

  it('table · no stamps at all → both null (无锚点防御 — nothing invented)', () => {
    expect(turnStamps([user(), tool(), assistant()])).toEqual({ startedAtMs: null, endedAtMs: null })
    expect(turnStamps([])).toEqual({ startedAtMs: null, endedAtMs: null })
  })

  it('table · a single stamped entry is both anchor and end (zero-span shape)', () => {
    expect(turnStamps([user(1_000)])).toEqual({ startedAtMs: 1_000, endedAtMs: 1_000 })
  })

  it('property · the fold is order-stable on transcript order: first/last of the stamp sequence', () => {
    const entries: ChatEntry[] = [user(100), assistant(200), tool(300), assistant(400)]
    expect(turnStamps(entries)).toEqual({ startedAtMs: 100, endedAtMs: 400 })
  })
})

describe('deriveWorkingSeconds — R29 live Working · Ns (ticket 108)', () => {
  it('table · anchor + clock → floor((now − anchor)/1000): the count derives, not ticks', () => {
    expect(deriveWorkingSeconds(0, 500, 0)).toBe(1) // sub-second clamps up
    expect(deriveWorkingSeconds(0, 1_000, 0)).toBe(1)
    expect(deriveWorkingSeconds(0, 1_900, 0)).toBe(1)
    expect(deriveWorkingSeconds(0, 2_000, 0)).toBe(2)
    expect(deriveWorkingSeconds(50_000, 57_400, 0)).toBe(7)
  })

  it('continuity · the SAME anchor remounts to the SAME value — the pi17-working-7s defect stays dead', () => {
    const anchor = 1_000_000
    const before = deriveWorkingSeconds(anchor, anchor + 7_000, 0)
    // Remount 60s later (session switch away and back): derives forward,
    // never from zero.
    const after = deriveWorkingSeconds(anchor, anchor + 67_000, 0)
    expect(before).toBe(7)
    expect(after).toBe(67)
    expect(after).toBeGreaterThan(before)
  })

  it('table · no anchor (or no clock yet) → the local tick fallback (ticket 61 discipline)', () => {
    expect(deriveWorkingSeconds(null, 5_000, 4)).toBe(4)
    expect(deriveWorkingSeconds(1_000, null, 3)).toBe(3)
    expect(deriveWorkingSeconds(null, null, 0)).toBe(1) // live rows always show ≥1s
  })
})

describe('deriveWorkedSeconds — R30 settled Worked · Ns (ticket 108)', () => {
  it('table · first→last entry-stamp span, floor, clamped ≥1', () => {
    expect(deriveWorkedSeconds(0, 300, 0)).toBe(1)
    expect(deriveWorkedSeconds(0, 5_000, 0)).toBe(5)
    expect(deriveWorkedSeconds(0, 5_900, 0)).toBe(5)
    expect(deriveWorkedSeconds(0, 6_100, 0)).toBe(6)
    expect(deriveWorkedSeconds(1_000, 1_000, 0)).toBe(1) // zero-span single-entry turn
  })

  it('replay · a replayed turn derives from its recorded stamps alone — no clock, no tick', () => {
    // The ticket-14 premise (replays carry no duration) is retired: the
    // recorded entry timestamps always exist.
    expect(deriveWorkedSeconds(Date.parse('2026-09-10T09:00:00.000Z'), Date.parse('2026-09-10T09:00:05.000Z'), 0)).toBe(5)
    // Remount (session switch) derives the identical value — pure function.
    expect(deriveWorkedSeconds(Date.parse('2026-09-10T09:00:00.000Z'), Date.parse('2026-09-10T09:00:05.000Z'), 0)).toBe(5)
  })

  it('table · end stamp missing (aborted tail) → the in-view tick fallback; stampless remount → untimed', () => {
    expect(deriveWorkedSeconds(1_000, null, 9)).toBe(9)
    expect(deriveWorkedSeconds(null, null, 7)).toBe(7)
    expect(deriveWorkedSeconds(1_000, null, 0)).toBeNull()
    expect(deriveWorkedSeconds(null, null, 0)).toBeNull()
  })

  it('settle transition · live value at the end stamp equals the settled span (no jump at agent_end)', () => {
    const anchor = 10_000
    const end = 23_400
    expect(deriveWorkingSeconds(anchor, end, 99)).toBe(13)
    expect(deriveWorkedSeconds(anchor, end, 99)).toBe(13)
  })
})
