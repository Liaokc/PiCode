import { describe, expect, it } from 'vitest'
import { excludeDimmedRows, nextSelectionIndex, searchTasks } from '../../src/shared/task-search.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'

function session(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
  return {
    file: `/store/${overrides.id}.jsonl`,
    cwd: '/Users/dev/projects/api-server',
    title: overrides.id,
    name: null,
    modifiedAt: 1_800_000_000_000,
    ...overrides
  } as SessionSummary
}

const TASKS = [
  session({ id: 'Add input validation', modifiedAt: 300 }),
  session({ id: 'Fix login redirect', cwd: '/Users/dev/web/client', modifiedAt: 200 }),
  session({ id: 'Slide maker prototype', cwd: '/Users/dev/slides', modifiedAt: 100 }),
  session({ id: 'client cleanup', cwd: '/Users/dev/web/client', modifiedAt: 50 })
]

describe('searchTasks', () => {
  it('keeps the given order for a blank query and caps at the limit', () => {
    expect(searchTasks(TASKS, '')).toHaveLength(4)
    expect(searchTasks(TASKS, '', 2).map((s) => s.id)).toEqual(['Add input validation', 'Fix login redirect'])
  })

  it('matches on title and project name, ranked fuzzy-first', () => {
    expect(searchTasks(TASKS, 'login').map((s) => s.id)).toEqual(['Fix login redirect'])
    expect(searchTasks(TASKS, 'client').map((s) => s.id)).toEqual(['Fix login redirect', 'client cleanup'])
    // Fuzzy subsequence: "cln" matches both, the compact project name wins.
    expect(searchTasks(TASKS, 'cln').map((s) => s.id)).toEqual(['Fix login redirect', 'client cleanup'])
  })

  it('drops non-matches', () => {
    expect(searchTasks(TASKS, 'zzz-nothing')).toEqual([])
  })
})

describe('nextSelectionIndex', () => {
  it('moves within bounds and wraps at both ends', () => {
    expect(nextSelectionIndex(0, 1, 3)).toBe(1)
    expect(nextSelectionIndex(2, 1, 3)).toBe(0)
    expect(nextSelectionIndex(0, -1, 3)).toBe(2)
    expect(nextSelectionIndex(1, 5, 3)).toBe(0)
    expect(nextSelectionIndex(1, -5, 3)).toBe(2)
  })

  it('stays put when the list is empty', () => {
    expect(nextSelectionIndex(0, 1, 0)).toBe(0)
  })
})

describe('excludeDimmedRows — ⌘K offers actionable targets only (ticket 54)', () => {
  const dimmed = session({ id: 'dead-cwd task', cwd: '/gone/project' })
  const dimmedFlagged = { ...dimmed, cwdMissing: true as const }
  const liveFlagged = { ...session({ id: 'live on dead cwd' }), cwdMissing: true as const }
  const normal = session({ id: 'healthy task' })
  const LIVE = new Set(['live on dead cwd'])

  it('excludes dimmed rows (dead cwd, no live host) from the palette', () => {
    expect(excludeDimmedRows([dimmedFlagged, normal], LIVE).map((s) => s.id)).toEqual(['healthy task'])
  })

  it('keeps flagged sessions that have a live host in this app (focus switch is actionable)', () => {
    expect(excludeDimmedRows([liveFlagged], LIVE).map((s) => s.id)).toEqual(['live on dead cwd'])
  })

  it('passes old payloads without the cwdMissing field through untouched (additive contract)', () => {
    expect(excludeDimmedRows([dimmed, normal], LIVE)).toEqual([dimmed, normal])
  })

  it('never mutates the input', () => {
    const sessions = [dimmedFlagged, normal]
    excludeDimmedRows(sessions, LIVE)
    expect(sessions).toEqual([dimmedFlagged, normal])
  })
})
