import { describe, expect, it } from 'vitest'
import { filterSessions, groupSessions, isSessionLive, projectLabel, relativeTime } from '../../src/shared/sessions/group.ts'
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
    expect(isSessionLive(session('c', '/w', NOW + 60_000), NOW)).toBe(false)
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
