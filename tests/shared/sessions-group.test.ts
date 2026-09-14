import { describe, expect, it } from 'vitest'
import {
  decideFollowTakeover,
  filterHiddenGroups,
  filterKnownProjects,
  groupSessions,
  isSessionLive,
  projectLabel,
  projectListFromSummaries,
  relativeTime,
  sessionCreatedMs,
  timelineSessions,
  type SessionSort
} from '../../src/shared/sessions/group.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'

function session(
  file: string,
  cwd: string,
  modifiedAt: number,
  title = `Task ${file}`,
  opts: { createdAt?: number | null; startedAt?: string } = {}
): SessionSummary {
  return {
    file,
    id: file,
    cwd,
    name: null,
    title,
    startedAt: opts.startedAt ?? '',
    modifiedAt,
    createdAt: opts.createdAt ?? null,
    messageCount: 1
  }
}

const NOW = 1_756_300_000_000
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('groupSessions', () => {
  it('hoists pinned sessions into their own recency-sorted section', () => {
    const sessions = [
      session('a', '/work/api', NOW),
      session('b', '/work/api', NOW - HOUR),
      session('c', '/home/picode', NOW - 2 * HOUR)
    ]
    const grouped = groupSessions(sessions, new Set(['c']))
    expect(grouped.pinned.map((s) => s.id)).toEqual(['c'])
    expect(grouped.groups.flatMap((g) => g.sessions.map((s) => s.id))).toEqual(['a', 'b'])
  })

  it('groups by project directory, newest group first, newest session first', () => {
    const grouped = groupSessions(
      [
        session('old-api', '/work/api', NOW - DAY),
        session('new-api', '/work/api', NOW),
        session('picode', '/home/picode', NOW - 2 * HOUR)
      ],
      new Set()
    )
    expect(grouped.groups.map((g) => g.project)).toEqual(['api', 'picode'])
    expect(grouped.groups[0]?.sessions.map((s) => s.id)).toEqual(['new-api', 'old-api'])
    expect(grouped.groups[0]?.cwd).toBe('/work/api')
  })

  it('orders pinned above groups and sorts pins by recency', () => {
    const grouped = groupSessions(
      [session('p1', '/w', NOW - 3 * HOUR), session('p2', '/w', NOW - HOUR), session('live', '/w', NOW)],
      new Set(['p1', 'p2'])
    )
    expect(grouped.pinned.map((s) => s.id)).toEqual(['p2', 'p1'])
    expect(grouped.groups[0]?.sessions.map((s) => s.id)).toEqual(['live'])
  })
})

describe('filterSessions — retired with the sidebar text filter (ticket 33)', () => {
  it('is gone — ⌘K (task-search) is the one search entry', async () => {
    // The module must not export the retired row's helper anymore.
    const group = await import('../../src/shared/sessions/group.ts')
    expect('filterSessions' in group).toBe(false)
  })
})

describe('filterHiddenGroups', () => {
  const groups = [
    { cwd: '/work/api', project: 'api', sessions: [session('a', '/work/api', NOW)] },
    { cwd: '/work/web', project: 'web', sessions: [session('b', '/work/web', NOW - HOUR)] },
    { cwd: '/home/picode', project: 'picode', sessions: [session('c', '/home/picode', NOW - 2 * HOUR)] }
  ]

  it('drops hidden groups and keeps the rest in order (ticket 19)', () => {
    const visible = filterHiddenGroups(groups, new Set(['/work/web']))
    expect(visible.map((g) => g.cwd)).toEqual(['/work/api', '/home/picode'])
  })

  it('hides every matching cwd, not just one', () => {
    const visible = filterHiddenGroups(groups, new Set(['/work/api', '/home/picode']))
    expect(visible.map((g) => g.cwd)).toEqual(['/work/web'])
  })

  it('returns every group when nothing is hidden', () => {
    expect(filterHiddenGroups(groups, new Set()).map((g) => g.cwd)).toEqual(groups.map((g) => g.cwd))
  })

  it('ignores hidden cwds that have no group', () => {
    expect(filterHiddenGroups(groups, new Set(['/gone', '/missing'])).map((g) => g.cwd)).toEqual(
      groups.map((g) => g.cwd)
    )
  })

  it('hides only the group projection — pinned sessions of a hidden cwd stay visible', () => {
    const sessions = [
      session('pinned-in-hidden', '/work/api', NOW),
      session('plain-in-hidden', '/work/api', NOW - HOUR),
      session('other', '/work/web', NOW - 2 * HOUR)
    ]
    const grouped = groupSessions(sessions, new Set(['pinned-in-hidden']))
    const visible = filterHiddenGroups(grouped.groups, new Set(['/work/api']))
    // The /work/api group vanishes; the /work/web group stays.
    expect(visible.map((g) => g.cwd)).toEqual(['/work/web'])
    // The pinned row is hoisted above groups and never touched by hiding.
    expect(grouped.pinned.map((s) => s.id)).toEqual(['pinned-in-hidden'])
  })

  it('is a sidebar projection only — the timeline view still sees hidden groups\' sessions', () => {
    const sessions = [
      session('hidden-one', '/work/api', NOW, 'Deploy the api'),
      session('kept', '/work/web', NOW - HOUR)
    ]
    const hidden = new Set(['/work/api'])
    const visibleGroups = filterHiddenGroups(groupSessions(sessions, new Set()).groups, hidden)
    expect(visibleGroups.map((g) => g.cwd)).toEqual(['/work/web'])
    // The timeline view (ticket 33, the Groups all-tasks successor) flattens
    // the same unfiltered session list — decluttering must never make a
    // session unreachable, and ⌘K search (task-search) is fed no hidden set.
    expect(timelineSessions(sessions, new Set(), 'updated').sessions.map((s) => s.id)).toEqual([
      'hidden-one',
      'kept'
    ])
  })
})

// ---- ticket 33: view/sort vocabulary (ZCode filter dropdown) -------------

describe('sessionCreatedMs — creation clock with graceful degrade', () => {
  const ISO = '2026-08-27T13:00:00.000Z'

  it('uses the file birthtime when the host read one', () => {
    expect(sessionCreatedMs(session('a', '/w', NOW, 'x', { createdAt: 1_756_000_000_000 }))).toBe(1_756_000_000_000)
  })

  it('falls back to the session header timestamp when birthtime is missing', () => {
    expect(sessionCreatedMs(session('b', '/w', NOW, 'x', { createdAt: null, startedAt: ISO }))).toBe(Date.parse(ISO))
  })

  it('degrades to 0 when neither birthtime nor a parseable header timestamp exist', () => {
    expect(sessionCreatedMs(session('c', '/w', NOW, 'x', { createdAt: null, startedAt: '' }))).toBe(0)
    expect(sessionCreatedMs(session('d', '/w', NOW, 'x', { createdAt: null, startedAt: 'garbage' }))).toBe(0)
  })

  it('treats a zero birthtime as missing', () => {
    expect(sessionCreatedMs(session('e', '/w', NOW, 'x', { createdAt: 0, startedAt: ISO }))).toBe(Date.parse(ISO))
  })
})

describe('groupSessions — sort key (ticket 33)', () => {
  // A matrix where the updated and created orders DISAGREE: api-1 was created
  // long ago but edited just now; api-2 is young but idle. Session ids are
  // the expected rows; every case spells out the full expected order.
  const sessions = [
    session('api-1', '/w/api', NOW, 'edited today', { createdAt: NOW - 10 * DAY }),
    session('api-2', '/w/api', NOW - HOUR, 'young idle', { createdAt: NOW - DAY }),
    session('api-3', '/w/api', NOW - 2 * DAY, 'middle', { createdAt: NOW - 2 * DAY }),
    session('web-0', '/w/web', NOW - 6 * HOUR, 'web fresh-created', { createdAt: NOW - 30 * MIN }),
    session('web-1', '/w/web', NOW - 4 * HOUR, 'web idle', { createdAt: NOW - 3 * DAY })
  ]

  const rows = (sort: SessionSort): string[] | undefined =>
    groupSessions(sessions, new Set(), sort).groups.find((g) => g.project === 'api')?.sessions.map((s) => s.id)

  it('updated: newest mtime first within every group', () => {
    expect(rows('updated')).toEqual(['api-1', 'api-2', 'api-3'])
  })

  it('created: birthtime desc within every group — order differs from updated', () => {
    expect(rows('created')).toEqual(['api-2', 'api-3', 'api-1'])
  })

  it('newest group first under BOTH sorts (group order can flip with the key)', () => {
    const groupOrder = (sort: SessionSort): string[] =>
      groupSessions(sessions, new Set(), sort).groups.map((g) => g.project)
    expect(groupOrder('updated')).toEqual(['api', 'web'])
    expect(groupOrder('created')).toEqual(['web', 'api'])
  })

  it('sorts the pinned section by the same key', () => {
    const pins = [
      session('old-pin', '/w', NOW - MIN, 'touched just now', { createdAt: NOW - 5 * DAY }),
      session('new-pin', '/w', NOW - 2 * HOUR, 'young pin', { createdAt: NOW - HOUR })
    ]
    expect(groupSessions(pins, new Set(['old-pin', 'new-pin']), 'updated').pinned.map((s) => s.id)).toEqual([
      'old-pin',
      'new-pin'
    ])
    expect(groupSessions(pins, new Set(['old-pin', 'new-pin']), 'created').pinned.map((s) => s.id)).toEqual([
      'new-pin',
      'old-pin'
    ])
  })

  it('defaults to the updated sort (the ZCode pre-checked row)', () => {
    const withDefault = groupSessions(sessions, new Set())
    const explicit = groupSessions(sessions, new Set(), 'updated')
    expect(withDefault.groups).toEqual(explicit.groups)
  })

  it('breaks updated-sort ties by creation time, newest first', () => {
    const tied = [
      session('old-soul', '/w', NOW, 'same mtime', { createdAt: NOW - 10 * DAY }),
      session('young-soul', '/w', NOW, 'same mtime', { createdAt: NOW - DAY })
    ]
    expect(groupSessions(tied, new Set(), 'updated').groups[0]?.sessions.map((s) => s.id)).toEqual([
      'young-soul',
      'old-soul'
    ])
  })
})

describe('timelineSessions — flat view, pinned kept on top (ticket 33)', () => {
  const sessions = [
    session('api-1', '/w/api', NOW, 'edited today', { createdAt: NOW - 10 * DAY }),
    session('api-2', '/w/api', NOW - HOUR, 'young idle', { createdAt: NOW - DAY }),
    session('web-0', '/w/web', NOW - 6 * HOUR, 'web fresh-created', { createdAt: NOW - 30 * MIN }),
    session('web-1', '/w/web', NOW - 4 * HOUR, 'web idle', { createdAt: NOW - 3 * DAY })
  ]
  const pins = new Set(['api-2'])

  it('flattens every non-pinned session into ONE recency-sorted list — no groups', () => {
    const timeline = timelineSessions(sessions, pins, 'updated')
    expect(timeline.sessions.map((s) => s.id)).toEqual(['api-1', 'web-1', 'web-0'])
    expect(timeline.pinned.map((s) => s.id)).toEqual(['api-2'])
  })

  it('created sort reorders the flat list by birthtime', () => {
    const timeline = timelineSessions(sessions, pins, 'created')
    // api-2 stays pinned out of the flat list in both sorts.
    expect(timeline.sessions.map((s) => s.id)).toEqual(['web-0', 'web-1', 'api-1'])
  })

  it('sorts the pinned section with the same key', () => {
    const pinnedSessions = [
      session('old-pin', '/w', NOW - MIN, 'fresh pin', { createdAt: NOW - 5 * DAY }),
      session('new-pin', '/w', NOW - 2 * HOUR, 'young pin', { createdAt: NOW - HOUR })
    ]
    expect(timelineSessions(pinnedSessions, new Set(['old-pin', 'new-pin']), 'created').pinned.map((s) => s.id)).toEqual(
      ['new-pin', 'old-pin']
    )
  })

  it('sees every session regardless of hidden projects — the timeline flattens the whole index', () => {
    // Hiding is a Projects-list projection (ticket 19); the timeline view is
    // the Groups all-tasks successor and must stay unfiltered.
    const hidden = [session('hid', '/hidden/proj', NOW), session('kept', '/w', NOW - HOUR)]
    expect(timelineSessions(hidden, new Set(), 'updated').sessions.map((s) => s.id)).toEqual(['hid', 'kept'])
  })

  it('is empty for an empty index', () => {
    expect(timelineSessions([], new Set(), 'updated')).toEqual({ pinned: [], sessions: [] })
  })
})

describe('relativeTime', () => {
  it('uses the ZCode sidebar vocabulary', () => {
    expect(relativeTime(NOW - 20_000, NOW)).toBe('just now')
    expect(relativeTime(NOW - 39 * MIN, NOW)).toBe('39m ago')
    expect(relativeTime(NOW - 3 * HOUR, NOW)).toBe('3h ago')
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe('2d ago')
    expect(relativeTime(NOW - 30 * DAY, NOW)).toBe('Jul 28')
  })

  it('treats clock skew as just now', () => {
    expect(relativeTime(NOW + 5 * MIN, NOW)).toBe('just now')
  })
})

describe('isSessionLive', () => {
  it('marks recently-touched sessions as live and stale ones as not', () => {
    expect(isSessionLive(session('a', '/w', NOW - 30_000), NOW)).toBe(true)
    expect(isSessionLive(session('b', '/w', NOW - 5 * 60_000), NOW)).toBe(false)
  })

  it('tolerates clock skew — an mtime in the future counts as live', () => {
    // A stale render tick vs a freshly appended file yields a negative delta.
    expect(isSessionLive(session('c', '/w', NOW + 60_000), NOW)).toBe(true)
  })
})

describe('decideFollowTakeover', () => {
  // Ticket 24: the Live Follow view's Open button re-checks liveness at click
  // time against a FRESH index scan. Table of (fresh-scan summary, now) → decision.
  const cases: Array<[string, SessionSummary | null, number, ReturnType<typeof decideFollowTakeover>]> = [
    ['quiet session → resume (full Handoff)', session('a', '/w', NOW - 5 * MIN), NOW, 'resume'],
    ['session just inside the live window → still-live (toast reject)', session('b', '/w', NOW - 30_000), NOW, 'still-live'],
    ['future mtime (clock skew) → still-live', session('c', '/w', NOW + MIN), NOW, 'still-live'],
    ['session vanished from the fresh scan → missing', null, NOW, 'missing']
  ]
  for (const [name, summary, now, expected] of cases) {
    it(name, () => {
      expect(decideFollowTakeover(summary, now)).toBe(expected)
    })
  }

  it('sits exactly on the live window boundary → still-live', () => {
    // isSessionLive uses a strict `<` on the window, so delta == window is quiet.
    const boundary = session('d', '/w', NOW - 120_000)
    expect(decideFollowTakeover(boundary, NOW)).toBe('resume')
  })
})

describe('projectLabel', () => {
  it('uses the directory basename', () => {
    expect(projectLabel('/Users/liaokechen/PiCode')).toBe('PiCode')
    expect(projectLabel('/work/api-gateway')).toBe('api-gateway')
  })

  it('degrades gracefully for odd cwds', () => {
    expect(projectLabel('')).toBe('Unknown project')
    expect(projectLabel('/')).toBe('Unknown project')
  })
})

describe('projectListFromSummaries + filterKnownProjects (ticket 67: the Project card scan)', () => {
  const summaries = [
    session('a.jsonl', '/Users/op/Projects/api', NOW - HOUR),
    session('b.jsonl', '/Users/op/Projects/api', NOW - MIN),
    session('c.jsonl', '/Users/op/PiCode', NOW - DAY),
    session('d.jsonl', '/Users/op/PiCode', NOW - 2 * DAY)
  ]

  it('derives distinct projects with count + recency, newest first', () => {
    const list = projectListFromSummaries(summaries)
    expect(list).toEqual([
      { cwd: '/Users/op/Projects/api', name: 'api', sessionCount: 2, latest: NOW - MIN },
      { cwd: '/Users/op/PiCode', name: 'PiCode', sessionCount: 2, latest: NOW - DAY }
    ]
    )
  })

  it('empty index → empty list', () => {
    expect(projectListFromSummaries([])).toEqual([])
  })

  it('filters by name or cwd substring, case-insensitively; empty query = all', () => {
    const list = projectListFromSummaries(summaries)
    expect(filterKnownProjects(list, '')).toHaveLength(2)
    expect(filterKnownProjects(list, '  ')).toHaveLength(2)
    expect(filterKnownProjects(list, 'API').map((p) => p.name)).toEqual(['api'])
    expect(filterKnownProjects(list, '/op/PiCode').map((p) => p.name)).toEqual(['PiCode'])
    expect(filterKnownProjects(list, 'nope')).toEqual([])
  })
})
