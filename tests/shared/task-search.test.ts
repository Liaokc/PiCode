import { describe, expect, it } from 'vitest'
import { nextSelectionIndex, searchTasks } from '../../src/shared/task-search.ts'
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
