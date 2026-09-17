import { describe, expect, it } from 'vitest'
import {
  EMPTY_MANUAL_ORDER,
  groupSessions,
  isEmptyManualOrder,
  timelineSessions,
  type GroupedSessions,
  type ManualSidebarOrder
} from '../../src/shared/sessions/group.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'
import {
  moveGroupBefore,
  moveSessionBefore,
  snapshotManualOrder
} from '../../src/shared/sessions/reorder.ts'

function session(
  id: string,
  cwd: string,
  modifiedAt: number,
  title = `Task ${id}`
): SessionSummary {
  return {
    file: `${id}.jsonl`,
    id,
    cwd,
    name: null,
    title,
    startedAt: '',
    modifiedAt,
    createdAt: null,
    messageCount: 1
  }
}

const NOW = 1_756_300_000_000
const MIN = 60_000
const HOUR = 60 * MIN

/** The updated-sorted grouping of one fixture set (the snapshot source). */
const FIXTURE = [
  session('api-new', '/w/api', NOW),
  session('api-mid', '/w/api', NOW - HOUR),
  session('api-old', '/w/api', NOW - 2 * HOUR),
  session('web-fresh', '/w/web', NOW - 3 * HOUR),
  session('web-idle', '/w/web', NOW - 4 * HOUR)
]

const ids = (sessions: readonly SessionSummary[]): string[] => sessions.map((s) => s.id)

describe('snapshotManualOrder', () => {
  it('captures the rendered group order and each group\'s row order', () => {
    const grouped = groupSessions(FIXTURE, new Set(), 'updated')
    const snap = snapshotManualOrder(grouped)
    expect(snap.groups).toEqual(['/w/api', '/w/web'])
    expect(snap.sessions['/w/api']).toEqual(['api-new', 'api-mid', 'api-old'])
    expect(snap.sessions['/w/web']).toEqual(['web-fresh', 'web-idle'])
  })

  it('omits the pinned section — pins never drag, so never enter the manual order', () => {
    const grouped = groupSessions(FIXTURE, new Set(['api-mid']), 'updated')
    const snap = snapshotManualOrder(grouped)
    expect(grouped.pinned.map((s) => s.id)).toEqual(['api-mid'])
    expect(snap.sessions['/w/api']).toEqual(['api-new', 'api-old'])
  })
})

describe('moveSessionBefore', () => {
  const ORDER: ManualSidebarOrder = {
    groups: ['/w/api', '/w/web'],
    sessions: {
      '/w/api': ['api-new', 'api-mid', 'api-old'],
      '/w/web': ['web-fresh', 'web-idle']
    }
  }

  it('moves a session up, shifting the skipped rows down', () => {
    const next = moveSessionBefore(ORDER, '/w/api', 'api-old', 'api-new', [])
    expect(next.sessions['/w/api']).toEqual(['api-old', 'api-new', 'api-mid'])
    expect(next.groups).toEqual(ORDER.groups)
  })

  it('moves a session down before a later anchor', () => {
    const next = moveSessionBefore(ORDER, '/w/api', 'api-new', 'api-old', [])
    expect(next.sessions['/w/api']).toEqual(['api-mid', 'api-new', 'api-old'])
  })

  it('beforeId null appends at the end', () => {
    const next = moveSessionBefore(ORDER, '/w/api', 'api-new', null, [])
    expect(next.sessions['/w/api']).toEqual(['api-mid', 'api-old', 'api-new'])
  })

  it('a no-op move returns the SAME order reference (no preference churn)', () => {
    expect(moveSessionBefore(ORDER, '/w/api', 'api-new', 'api-mid', [])).toBe(ORDER)
  })

  it('reconciles rendered-but-unstored ids at the tail (render order), then moves', () => {
    // Stored knows [api-new, api-mid]; api-old re-appeared (restored archive)
    // and renders at the tail. Dropping api-old above api-mid must
    // materialize it FIRST, then apply the move — otherwise the anchor
    // cannot resolve.
    const partial: ManualSidebarOrder = {
      groups: ['/w/api'],
      sessions: { '/w/api': ['api-new', 'api-mid'] }
    }
    const next = moveSessionBefore(partial, '/w/api', 'api-old', 'api-mid', [
      'api-new',
      'api-mid',
      'api-old'
    ])
    expect(next.sessions['/w/api']).toEqual(['api-new', 'api-old', 'api-mid'])
  })

  it('moving an UNSTORED session reconciles the rest, then inserts it', () => {
    // The seeded-manual edge: a brand-new session dragged in Manual mode
    // must not lose the stored arrangement.
    const partial: ManualSidebarOrder = {
      groups: ['/w/api'],
      sessions: { '/w/api': ['api-new'] }
    }
    const next = moveSessionBefore(partial, '/w/api', 'api-mid', 'api-new', [
      'api-new',
      'api-mid',
      'api-old'
    ])
    expect(next.sessions['/w/api']).toEqual(['api-mid', 'api-new', 'api-old'])
  })

  it('an anchor that exists nowhere falls back to the end', () => {
    const next = moveSessionBefore(ORDER, '/w/api', 'api-new', 'vanished', [])
    expect(next.sessions['/w/api']).toEqual(['api-mid', 'api-old', 'api-new'])
  })

  it('never mutates the input order or its arrays', () => {
    const frozen: ManualSidebarOrder = {
      groups: ['/w/api'],
      sessions: { '/w/api': ['a', 'b', 'c'] }
    }
    moveSessionBefore(frozen, '/w/api', 'c', 'a', [])
    expect(frozen.sessions['/w/api']).toEqual(['a', 'b', 'c'])
  })

  it('touches only the dragged session\'s cwd list', () => {
    const next = moveSessionBefore(ORDER, '/w/api', 'api-new', null, [])
    expect(next.sessions['/w/web']).toEqual(ORDER.sessions['/w/web'])
  })
})

describe('moveGroupBefore', () => {
  const ORDER: ManualSidebarOrder = {
    groups: ['/w/api', '/w/web', '/w/cli'],
    sessions: {}
  }

  it('moves a group up, shifting the skipped groups down', () => {
    const next = moveGroupBefore(ORDER, '/w/cli', '/w/api', [])
    expect(next.groups).toEqual(['/w/cli', '/w/api', '/w/web'])
  })

  it('beforeCwd null appends at the end', () => {
    const next = moveGroupBefore(ORDER, '/w/api', null, [])
    expect(next.groups).toEqual(['/w/web', '/w/cli', '/w/api'])
  })

  it('a no-op move returns the SAME order reference', () => {
    expect(moveGroupBefore(ORDER, '/w/api', '/w/web', [])).toBe(ORDER)
  })

  it('reconciles rendered-but-unstored cwds at the tail, then moves', () => {
    const partial: ManualSidebarOrder = { groups: ['/w/api'], sessions: {} }
    const next = moveGroupBefore(partial, '/w/cli', '/w/api', ['/w/api', '/w/web', '/w/cli'])
    expect(next.groups).toEqual(['/w/cli', '/w/api', '/w/web'])
  })

  it('an anchor that exists nowhere falls back to the end', () => {
    const next = moveGroupBefore(ORDER, '/w/api', '/gone', [])
    expect(next.groups).toEqual(['/w/web', '/w/cli', '/w/api'])
  })

  it('never mutates the input order', () => {
    moveGroupBefore(ORDER, '/w/api', null, [])
    expect(ORDER.groups).toEqual(['/w/api', '/w/web', '/w/cli'])
  })
})

describe('groupSessions — sort manual (ticket 84)', () => {
  it('an EMPTY manual order renders exactly the Updated arrangement (dropdown switch = no jump)', () => {
    const updated = groupSessions(FIXTURE, new Set(), 'updated')
    const manual = groupSessions(FIXTURE, new Set(), 'manual', EMPTY_MANUAL_ORDER)
    expect(manual).toEqual(updated)
  })

  it('renders stored group order and stored row order first', () => {
    const manual: ManualSidebarOrder = {
      groups: ['/w/web', '/w/api'],
      sessions: { '/w/api': ['api-old', 'api-new', 'api-mid'], '/w/web': ['web-idle', 'web-fresh'] }
    }
    const grouped = groupSessions(FIXTURE, new Set(), 'manual', manual)
    expect(grouped.groups.map((g) => g.cwd)).toEqual(['/w/web', '/w/api'])
    expect(ids(grouped.groups[0]?.sessions ?? [])).toEqual(['web-idle', 'web-fresh'])
    expect(ids(grouped.groups[1]?.sessions ?? [])).toEqual(['api-old', 'api-new', 'api-mid'])
  })

  it('sessions unknown to the stored order append at the tail, newest first', () => {
    const manual: ManualSidebarOrder = {
      groups: ['/w/api'],
      sessions: { '/w/api': ['api-mid'] }
    }
    const grouped = groupSessions(FIXTURE, new Set(), 'manual', manual)
    expect(ids(grouped.groups[0]?.sessions ?? [])).toEqual(['api-mid', 'api-new', 'api-old'])
  })

  it('groups unknown to the stored order append after it, newest group first', () => {
    const manual: ManualSidebarOrder = { groups: ['/w/cli'], sessions: {} }
    const sessions = [
      session('cli-1', '/w/cli', NOW - 5 * HOUR),
      ...FIXTURE
    ]
    const grouped = groupSessions(sessions, new Set(), 'manual', manual)
    expect(grouped.groups.map((g) => g.cwd)).toEqual(['/w/cli', '/w/api', '/w/web'])
  })

  it('the pinned section stays Updated-sorted under manual — pins never drag', () => {
    const manual: ManualSidebarOrder = { groups: [], sessions: {} }
    const pins = [
      session('old-pin', '/w', NOW - MIN, 'fresh pin'),
      session('new-pin', '/w', NOW - 2 * HOUR, 'young pin')
    ]
    const grouped = groupSessions(pins, new Set(['old-pin', 'new-pin']), 'manual', manual)
    expect(ids(grouped.pinned)).toEqual(['old-pin', 'new-pin'])
  })

  it('stored entries whose sessions vanished (archived) are skipped, not crashers', () => {
    const manual: ManualSidebarOrder = {
      groups: ['/w/api', '/w/web'],
      sessions: { '/w/api': ['api-archived', 'api-mid', 'api-gone'], '/w/web': ['web-gone'] }
    }
    const grouped = groupSessions(FIXTURE, new Set(), 'manual', manual)
    expect(grouped.groups.map((g) => g.cwd)).toEqual(['/w/api', '/w/web'])
    expect(ids(grouped.groups[0]?.sessions ?? [])).toEqual(['api-mid', 'api-new', 'api-old'])
    expect(ids(grouped.groups[1]?.sessions ?? [])).toEqual(['web-fresh', 'web-idle'])
  })

  it('a stored group whose cwd lost every session vanishes from the list', () => {
    const manual: ManualSidebarOrder = { groups: ['/gone', '/w/api'], sessions: {} }
    const grouped = groupSessions(FIXTURE, new Set(), 'manual', manual)
    expect(grouped.groups.map((g) => g.cwd)).toEqual(['/w/api', '/w/web'])
  })

  it('switching back to Updated ignores the manual order — auto sort active, manual preserved', () => {
    const manual: ManualSidebarOrder = {
      groups: ['/w/web', '/w/api'],
      sessions: { '/w/api': ['api-old', 'api-new', 'api-mid'] }
    }
    const back = groupSessions(FIXTURE, new Set(), 'updated', manual)
    expect(back.groups.map((g) => g.cwd)).toEqual(['/w/api', '/w/web'])
    expect(ids(back.groups[0]?.sessions ?? [])).toEqual(['api-new', 'api-mid', 'api-old'])
    // The manual order object is untouched — switching to Manual again
    // restores the user's arrangement (preserved, not reapplied silently).
    expect(manual.groups).toEqual(['/w/web', '/w/api'])
  })
})

describe('timelineSessions — sort manual (ticket 84)', () => {
  it('flattens the manual-ordered groups into one list; pinned stays Updated-sorted on top', () => {
    const manual: ManualSidebarOrder = {
      groups: ['/w/web', '/w/api'],
      sessions: { '/w/api': ['api-old', 'api-new', 'api-mid'] }
    }
    const timeline = timelineSessions(FIXTURE, new Set(['web-fresh']), 'manual', manual)
    expect(ids(timeline.pinned)).toEqual(['web-fresh'])
    expect(ids(timeline.sessions)).toEqual(['web-idle', 'api-old', 'api-new', 'api-mid'])
  })

  it('an empty manual order renders exactly the Updated timeline', () => {
    const updated = timelineSessions(FIXTURE, new Set(), 'updated')
    const manual = timelineSessions(FIXTURE, new Set(), 'manual', EMPTY_MANUAL_ORDER)
    expect(manual).toEqual(updated)
  })
})

describe('isEmptyManualOrder', () => {
  it('is true only for the empty order', () => {
    expect(isEmptyManualOrder(EMPTY_MANUAL_ORDER)).toBe(true)
    expect(isEmptyManualOrder({ groups: [], sessions: {} })).toBe(true)
    expect(isEmptyManualOrder({ groups: ['/w'], sessions: {} })).toBe(false)
    expect(isEmptyManualOrder({ groups: [], sessions: { '/w': ['a'] } })).toBe(false)
  })
})

describe('ticket 84 end-to-end: first drag snapshots, then drags compose', () => {
  // The Sidebar's drop pipeline, exercised at the seam: snapshot the current
  // Updated arrangement (first drag ever), apply the expressed move, render
  // under Manual, and verify switch-back semantics — the full acceptance
  // table at the model level.
  function firstDrag(
    grouped: GroupedSessions,
    cwd: string,
    sessionId: string,
    beforeId: string | null
  ): ManualSidebarOrder {
    const base = snapshotManualOrder(grouped)
    const rendered = grouped.groups.find((g) => g.cwd === cwd)?.sessions.map((s) => s.id) ?? []
    return moveSessionBefore(base, cwd, sessionId, beforeId, rendered)
  }

  it('drag api-old above api-new: snapshot + one move, render matches the drop', () => {
    const grouped = groupSessions(FIXTURE, new Set(), 'updated')
    const order = firstDrag(grouped, '/w/api', 'api-old', 'api-new')
    const rendered = groupSessions(FIXTURE, new Set(), 'manual', order)
    expect(ids(rendered.groups[0]?.sessions ?? [])).toEqual(['api-old', 'api-new', 'api-mid'])
  })

  it('a second drag composes on the stored order (row swap then group move)', () => {
    const grouped = groupSessions(FIXTURE, new Set(), 'updated')
    const afterRow = firstDrag(grouped, '/w/api', 'api-old', 'api-new')
    const afterGroup = moveGroupBefore(afterRow, '/w/web', '/w/api', grouped.groups.map((g) => g.cwd))
    const rendered = groupSessions(FIXTURE, new Set(), 'manual', afterGroup)
    expect(rendered.groups.map((g) => g.cwd)).toEqual(['/w/web', '/w/api'])
    expect(ids(rendered.groups[1]?.sessions ?? [])).toEqual(['api-old', 'api-new', 'api-mid'])
  })

  it('Manual → Updated → Manual round-trips the user arrangement (preserved, not lost)', () => {
    const grouped = groupSessions(FIXTURE, new Set(), 'updated')
    const order = firstDrag(grouped, '/w/api', 'api-mid', null)
    // Switch away: auto order rules again.
    const updated = groupSessions(FIXTURE, new Set(), 'updated', order)
    expect(ids(updated.groups[0]?.sessions ?? [])).toEqual(['api-new', 'api-mid', 'api-old'])
    // Drag again re-enters Manual: the move composes onto the STORED order
    // ([api-new, api-old, api-mid]) — api-new lands right before api-mid.
    const next = moveSessionBefore(order, '/w/api', 'api-new', 'api-mid', [])
    const rendered = groupSessions(FIXTURE, new Set(), 'manual', next)
    expect(ids(rendered.groups[0]?.sessions ?? [])).toEqual(['api-old', 'api-new', 'api-mid'])
  })
})
