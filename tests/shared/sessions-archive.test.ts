import { describe, expect, it } from 'vitest'
import { archivedList, filterArchived } from '../../src/shared/sessions/archive.ts'
import { searchTasks } from '../../src/shared/task-search.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'

function session(id: string, cwd: string, modifiedAt: number, title = `Task ${id}`): SessionSummary {
  return {
    file: `/store/${id}.jsonl`,
    id,
    cwd,
    name: null,
    title,
    startedAt: '',
    createdAt: modifiedAt,
    modifiedAt,
    messageCount: 1
  }
}

const A = session('a', '/work/api', 3000, 'Fix redirect loop')
const B = session('b', '/work/api', 2000, 'Upload pipeline smoke')
const C = session('c', '/home/picode', 1000, 'rename write-back')

describe('filterArchived — the sidebar list projection (ticket 35)', () => {
  it.each([
    // archived ids | expected survivors
    [['a'], ['b', 'c']],
    [[], ['a', 'b', 'c']],
    [['a', 'c'], ['b']],
    [['nope'], ['a', 'b', 'c']],
    [['a', 'a', 'b'], ['c']] // duplicates in the preference never resurrect a row
  ])('archived=%p hides exactly those rows → %p', (archived, expected) => {
    expect(filterArchived([A, B, C], new Set(archived)).map((s) => s.id)).toEqual(expected)
  })

  it('is a pure projection: the input list is never mutated', () => {
    const input = [A, B, C]
    filterArchived(input, new Set(['a']))
    expect(input.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('never makes a session unreachable: ⌘K search still finds archived sessions', () => {
    // The filter is consumed by the SIDEBAR lists only — the task-search
    // palette is fed the full index (the filterHiddenGroups invariant:
    // hiding must never make a session unreachable).
    const archived = filterArchived([A, B, C], new Set(['a']))
    expect(archived.map((s) => s.id)).not.toContain('a')
    expect(searchTasks([A, B, C], 'redirect').map((s) => s.id)).toEqual(['a'])
  })
})

describe('archivedList — the archive view behind the trash button (ticket 35)', () => {
  it('lists exactly the archived sessions, newest first', () => {
    expect(archivedList([A, B, C], new Set(['c', 'a'])).map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('is empty when nothing is archived', () => {
    expect(archivedList([A, B, C], new Set())).toEqual([])
  })

  it('does not mutate the input', () => {
    const input = [A, B, C]
    archivedList(input, new Set(['b']))
    expect(input.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})
