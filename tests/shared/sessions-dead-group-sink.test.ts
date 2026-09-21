import { describe, expect, it } from 'vitest'
import {
  EMPTY_MANUAL_ORDER,
  groupSessions,
  isDeadCwdGroup,
  timelineSessions,
  type ManualSidebarOrder,
  type SessionSort
} from '../../src/shared/sessions/group.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'
import { moveGroupBefore, moveSessionBefore, snapshotManualOrder } from '../../src/shared/sessions/reorder.ts'
import { cwdRowState } from '../../src/shared/sessions/cwd-liveness.ts'

/**
 * Ticket 123 — the dead-cwd group sink (the group-sort liveness bucket).
 * A project group whose working directory is gone from disk renders below
 * EVERY live group under all three sorts (Updated / Created / Manual — the
 * operator's rule outranks every sort key, Manual included); the sunk
 * groups keep their sort-key relative order; the manual arrangement never
 * applies to them (their grips don't drag, their cwds never enter the
 * persisted group order); a reappearing directory re-projects with no
 * stored state. Gray-row (ticket 54) and manual-order (ticket 84)
 * semantics must not regress.
 */

function session(
  id: string,
  cwd: string,
  modifiedAt: number,
  opts: { createdAt?: number | null; cwdMissing?: boolean } = {}
): SessionSummary {
  return {
    file: `${id}.jsonl`,
    id,
    cwd,
    name: null,
    title: `Task ${id}`,
    startedAt: '',
    modifiedAt,
    createdAt: opts.createdAt ?? null,
    messageCount: 1,
    ...(opts.cwdMissing === true ? { cwdMissing: true } : {})
  }
}

const NOW = 1_756_300_000_000
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/**
 * Two live groups (alpha, charlie) and two dead ones (bravo, delta) whose
 * Updated and Created orders DISAGREE, with the dead groups' sort keys
 * interleaved among the live ones — without the bucket the dead groups
 * would render in the middle, so every expected order below proves the
 * sink, not just an already-bottom position.
 *   Updated order (no bucket):  alpha, bravo, charlie, delta
 *   Created order (no bucket):  delta, bravo, charlie, alpha
 */
const LIVE = { cwdMissing: false }
const DEAD = { cwdMissing: true }
const FIXTURE: SessionSummary[] = [
  session('a1', '/w/alpha', NOW, { createdAt: NOW - 10 * DAY, ...LIVE }),
  session('b1', '/w/bravo', NOW - HOUR, { createdAt: NOW - 1 * DAY, ...DEAD }),
  session('b2', '/w/bravo', NOW - 90 * MIN, { createdAt: NOW - 2 * DAY, ...DEAD }),
  session('c1', '/w/charlie', NOW - 2 * HOUR, { createdAt: NOW - 2 * DAY, ...LIVE }),
  session('d1', '/w/delta', NOW - 3 * HOUR, { createdAt: NOW - 30 * MIN, ...DEAD })
]

/** The same index with every cwd alive — the liveness-flip re-projection
 * source: identical inputs minus the flags must render the pure sort. */
const ALIVE_FIXTURE: SessionSummary[] = FIXTURE.map((s) => ({ ...s, cwdMissing: undefined }))

const groupCwds = (sort: SessionSort, manual: ManualSidebarOrder = EMPTY_MANUAL_ORDER): string[] =>
  groupSessions(FIXTURE, new Set(), sort, manual).groups.map((g) => g.cwd)

describe('isDeadCwdGroup (ticket 123)', () => {
  it('reads the folder fact from ANY row — all rows share the group cwd', () => {
    expect(isDeadCwdGroup({ sessions: [{ cwdMissing: true }] })).toBe(true)
    expect(isDeadCwdGroup({ sessions: [{}, { cwdMissing: true }] })).toBe(true)
  })

  it('absent and false flags both mean alive (the additive pre-54 payload shape)', () => {
    expect(isDeadCwdGroup({ sessions: [] })).toBe(false)
    expect(isDeadCwdGroup({ sessions: [{}] })).toBe(false)
    expect(isDeadCwdGroup({ sessions: [{ cwdMissing: false }] })).toBe(false)
  })
})

describe('groupSessions — the liveness bucket sinks dead groups under every sort', () => {
  // The acceptance table: three sorts × the dead/live mix. Live groups
  // order by the active key; the dead bucket trails, ordered by the SAME
  // key (Created's dead inter-order legitimately differs from Updated's).
  const CASES: Array<[SessionSort, string[], string]> = [
    ['updated', ['/w/alpha', '/w/charlie', '/w/bravo', '/w/delta'], 'live by mtime, then dead by mtime'],
    [
      'created',
      ['/w/charlie', '/w/alpha', '/w/delta', '/w/bravo'],
      'live by birthtime, then dead by birthtime — the key still rules inside the bucket'
    ],
    [
      'manual',
      ['/w/alpha', '/w/charlie', '/w/bravo', '/w/delta'],
      'empty manual order renders like Updated (ticket 84), bucket included'
    ]
  ]
  for (const [sort, expected, why] of CASES) {
    it(`${sort}: ${why}`, () => {
      expect(groupCwds(sort)).toEqual(expected)
    })
  }

  it('the dead flag flips the projection — the identical alive index renders the pure sort', () => {
    // Liveness is a projection, not stored state: same sessions, flags
    // cleared (the directory reappeared) → both automatic sorts render
    // the dead groups back at their sort-key positions.
    const alive = (sort: SessionSort): string[] =>
      groupSessions(ALIVE_FIXTURE, new Set(), sort).groups.map((g) => g.cwd)
    expect(alive('updated')).toEqual(['/w/alpha', '/w/bravo', '/w/charlie', '/w/delta'])
    expect(alive('created')).toEqual(['/w/delta', '/w/bravo', '/w/charlie', '/w/alpha'])
  })

  it('group-internal row order is untouched — dead groups keep their sorted/arranged rows', () => {
    const bravo = groupSessions(FIXTURE, new Set(), 'updated').groups.find((g) => g.cwd === '/w/bravo')
    expect(bravo?.sessions.map((s) => s.id)).toEqual(['b1', 'b2'])
  })

  it('the live-host exemption is row-level only — a warning row still rides a sunk group', () => {
    // The SAME cwdMissing flag feeds both layers: cwdRowState(flag, live)
    // keeps a hosted row 'warning' (ticket 54 — the row stays normal, its
    // banner explains), while the group sink reads the folder fact alone —
    // the host fact never reaches the bucket.
    expect(cwdRowState(true, true)).toBe('warning')
    expect(isDeadCwdGroup({ sessions: [{ cwdMissing: true }] })).toBe(true)
  })

  it('the pinned section is unaffected — a pinned dead-cwd session stays in Pinned, sorted by recency', () => {
    const grouped = groupSessions(FIXTURE, new Set(['b1']), 'updated')
    expect(grouped.pinned.map((s) => s.id)).toEqual(['b1'])
    expect(grouped.groups.map((g) => g.cwd)).toEqual([
      '/w/alpha',
      '/w/charlie',
      '/w/bravo',
      '/w/delta'
    ])
    expect(grouped.groups.find((g) => g.cwd === '/w/bravo')?.sessions.map((s) => s.id)).toEqual(['b2'])
  })
})

describe('groupSessions — manual order never applies to dead groups', () => {
  it('dead groups stored FIRST in the manual order still sink below every live group', () => {
    // The blunt acceptance: the manual arrangement cannot resurrect a
    // dead group above a live one, wherever it was stored.
    const deadFirst: ManualSidebarOrder = {
      groups: ['/w/bravo', '/w/delta', '/w/charlie', '/w/alpha'],
      sessions: {}
    }
    expect(groupCwds('manual', deadFirst)).toEqual(['/w/charlie', '/w/alpha', '/w/bravo', '/w/delta'])
  })

  it('the stored order still arranges the LIVE groups (manual is not disabled, only dead-blind)', () => {
    const liveArranged: ManualSidebarOrder = {
      groups: ['/w/bravo', '/w/charlie', '/w/delta', '/w/alpha'],
      sessions: {}
    }
    expect(groupCwds('manual', liveArranged)).toEqual(['/w/charlie', '/w/alpha', '/w/bravo', '/w/delta'])
  })

  it('the sunk dead bucket orders by the Updated baseline under manual (the manual path fallback key)', () => {
    const deadFirst: ManualSidebarOrder = { groups: ['/w/delta', '/w/bravo'], sessions: {} }
    expect(groupCwds('manual', deadFirst)).toEqual([
      '/w/alpha',
      '/w/charlie',
      '/w/bravo',
      '/w/delta'
    ])
  })

  it('a stored group whose cwd lost every session stays gone; a dead one keeps its rows', () => {
    const manual: ManualSidebarOrder = { groups: ['/gone', '/w/bravo', '/w/alpha'], sessions: {} }
    const grouped = groupSessions(FIXTURE, new Set(), 'manual', manual)
    expect(grouped.groups.map((g) => g.cwd)).toEqual(['/w/alpha', '/w/charlie', '/w/bravo', '/w/delta'])
    expect(grouped.groups.find((g) => g.cwd === '/w/bravo')?.sessions.map((s) => s.id)).toEqual(['b1', 'b2'])
  })

  it('a dead group unknown to the stored order still honors a stored ROW order (gray rows keep dragging)', () => {
    // cwd excluded from `groups` (dead at snapshot time) but its rows were
    // arranged by a drag — the render must show the arrangement.
    const rowArranged: ManualSidebarOrder = { groups: ['/w/alpha'], sessions: { '/w/bravo': ['b2', 'b1'] } }
    const grouped = groupSessions(FIXTURE, new Set(), 'manual', rowArranged)
    expect(grouped.groups.map((g) => g.cwd)).toEqual(['/w/alpha', '/w/charlie', '/w/bravo', '/w/delta'])
    expect(grouped.groups.find((g) => g.cwd === '/w/bravo')?.sessions.map((s) => s.id)).toEqual(['b2', 'b1'])
  })
})

describe('snapshotManualOrder — dead groups never enter the group array', () => {
  it('the first-drag snapshot records ONLY live groups; every group\'s rows still snapshot', () => {
    const snap = snapshotManualOrder(groupSessions(FIXTURE, new Set(), 'updated'))
    expect(snap.groups).toEqual(['/w/alpha', '/w/charlie'])
    expect(snap.sessions['/w/bravo']).toEqual(['b1', 'b2'])
    expect(snap.sessions['/w/delta']).toEqual(['d1'])
  })

  it('the sink never bakes: a revived group renders by liveness first — above a still-dead group even when older', () => {
    const snap = snapshotManualOrder(groupSessions(FIXTURE, new Set(), 'updated'))
    // Revive ONLY delta (the oldest group, 3h stale): unknown to the stored
    // order, it must still outrank the still-dead bravo (fresher, 1h) —
    // liveness outranks recency, and nothing about the sunk position the
    // snapshot saw was stored.
    const deltaRevived = FIXTURE.map((s) => (s.cwd === '/w/delta' ? { ...s, cwdMissing: undefined } : s))
    const revived = groupSessions(deltaRevived, new Set(), 'manual', snap)
    expect(revived.groups.map((g) => g.cwd)).toEqual(['/w/alpha', '/w/charlie', '/w/delta', '/w/bravo'])
  })
})

describe('ticket 84 × 123: gray-row drags inside a dead group keep working', () => {
  it('a row drag in a never-stored dead group reorders its rows and stays sunk', () => {
    const snap = snapshotManualOrder(groupSessions(FIXTURE, new Set(), 'updated'))
    const after = moveSessionBefore(snap, '/w/bravo', 'b2', 'b1', ['b1', 'b2'])
    expect(after.groups).toEqual(['/w/alpha', '/w/charlie']) // live groups unchanged
    const rendered = groupSessions(FIXTURE, new Set(), 'manual', after)
    expect(rendered.groups.map((g) => g.cwd)).toEqual(['/w/alpha', '/w/charlie', '/w/bravo', '/w/delta'])
    expect(rendered.groups.find((g) => g.cwd === '/w/bravo')?.sessions.map((s) => s.id)).toEqual(['b2', 'b1'])
  })
})

describe('moveGroupBefore — the dead-bucket drop lands after every live group', () => {
  it('a boundary drop (translated anchor null) moves the group past every live group, above the stale dead entry', () => {
    // The Sidebar hands the model a null anchor (dead bucket) and a
    // live-only reconcile list; /w/bravo below is a STALE stored dead cwd
    // (arranged while alive, died later). The moved live group must land
    // after all live groups — rendering pulls the stale dead one to the
    // sunk tail regardless of its stored position.
    const stale: ManualSidebarOrder = { groups: ['/w/bravo', '/w/alpha', '/w/charlie'], sessions: {} }
    const after = moveGroupBefore(stale, '/w/charlie', null, ['/w/alpha', '/w/charlie'])
    expect(after.groups).toEqual(['/w/bravo', '/w/alpha', '/w/charlie'])
    const rendered = groupSessions(FIXTURE, new Set(), 'manual', after)
    expect(rendered.groups.map((g) => g.cwd)).toEqual(['/w/alpha', '/w/charlie', '/w/bravo', '/w/delta'])
  })
})

describe('timelineSessions — the manual timeline mirrors the sunk arrangement', () => {
  it('under manual, dead groups\' rows flatten at the tail; updated/created stay pure recency lists', () => {
    const deadFirst: ManualSidebarOrder = {
      groups: ['/w/bravo', '/w/charlie', '/w/delta', '/w/alpha'],
      sessions: {}
    }
    const manual = timelineSessions(FIXTURE, new Set(), 'manual', deadFirst)
    expect(manual.sessions.map((s) => s.id)).toEqual(['c1', 'a1', 'b1', 'b2', 'd1'])
    // The automatic timeline is a flat recency list — no group bucket
    // exists there, dead-cwd sessions included.
    expect(timelineSessions(FIXTURE, new Set(), 'updated').sessions.map((s) => s.id)).toEqual([
      'a1',
      'b1',
      'b2',
      'c1',
      'd1'
    ])
  })
})
