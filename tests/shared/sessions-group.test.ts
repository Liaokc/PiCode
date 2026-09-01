import { describe, expect, it } from 'vitest'
import {
  decideFollowTakeover,
  filterHiddenGroups,
  filterSessions,
  groupSessions,
  isSessionLive,
  projectLabel,
  relativeTime
} from '../../src/shared/sessions/group.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'

function session(file: string, cwd: string, modifiedAt: number, title = `Task ${file}`): SessionSummary {
  return { file, id: file, cwd, name: null, title, startedAt: '', modifiedAt, messageCount: 1 }
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

describe('filterSessions', () => {
  const sessions = [
    session('a', '/w', 1, 'Fix redirect loop'),
    session('b', '/w', 2, 'Upload pipeline smoke'),
    session('c', '/w', 3, 'rename session label write-back')
  ]

  it('matches titles case-insensitively', () => {
    expect(filterSessions(sessions, 'REDIRECT').map((s) => s.id)).toEqual(['a'])
  })

  it('matches project directory names too', () => {
    expect(filterSessions([{ ...session('d', '/home/picode', 4) }], 'picode')).toHaveLength(1)
  })

  it('returns everything for a blank query', () => {
    expect(filterSessions(sessions, '  ')).toHaveLength(3)
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

  it('is a sidebar projection only — ⌘K search and the all-tasks view still see hidden groups\' sessions', () => {
    const sessions = [
      session('hidden-one', '/work/api', NOW, 'Deploy the api'),
      session('kept', '/work/web', NOW - HOUR)
    ]
    const hidden = new Set(['/work/api'])
    const visibleGroups = filterHiddenGroups(groupSessions(sessions, new Set()).groups, hidden)
    expect(visibleGroups.map((g) => g.cwd)).toEqual(['/work/web'])
    // Title search (sidebar filter input and ⌘K palette share it) is NOT fed
    // the hidden set — decluttering must never make sessions unreachable.
    expect(filterSessions(sessions, 'deploy').map((s) => s.id)).toEqual(['hidden-one'])
    // The Groups all-tasks view flattens the same unfiltered session list.
    expect(groupSessions(sessions, new Set()).groups.flatMap((g) => g.sessions.map((s) => s.id))).toEqual([
      'hidden-one',
      'kept'
    ])
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
