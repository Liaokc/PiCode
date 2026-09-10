import { describe, expect, it } from 'vitest'
import {
  projectCommandMenu,
  selectCommandCatalog,
  type NewTaskCommandCatalog,
  type NewTaskCommandRow
} from '../../src/shared/new-task-commands.ts'

const row = (name: string, source: NewTaskCommandRow['source'], argumentHint?: string): NewTaskCommandRow => ({
  name,
  description: `${name} description`,
  ...(argumentHint !== undefined ? { argumentHint } : {}),
  source
})

const catalog = (commands: NewTaskCommandRow[], cwd: string | null = '/tmp/proj'): NewTaskCommandCatalog => ({
  cwd,
  commands,
  error: null,
  scannedAt: 1_800_000_000_000
})

describe('projectCommandMenu', () => {
  it('projects prompt and skill rows into slash menu items, preserving order and hints', () => {
    const rows = projectCommandMenu(
      catalog([row('weekly-report', 'prompt', '[days]'), row('review-pr', 'skill'), row('deploy', 'prompt')])
    )
    expect(rows).toEqual([
      { name: 'weekly-report', description: 'weekly-report description', argumentHint: '[days]', source: 'prompt' },
      { name: 'review-pr', description: 'review-pr description', source: 'skill' },
      { name: 'deploy', description: 'deploy description', source: 'prompt' }
    ])
  })

  it('never lists /compact or the six retired built-ins (prompt rows)', () => {
    const reserved = ['compact', 'new', 'tree', 'name', 'copy', 'model', 'thinking']
    const rows = projectCommandMenu(catalog([...reserved.map((n) => row(n, 'prompt')), row('real', 'prompt')]))
    expect(rows.map((r) => r.name)).toEqual(['real'])
  })

  it('keeps skills whose name collides with a built-in (the /skill: namespace never collides)', () => {
    const rows = projectCommandMenu(catalog([row('compact', 'skill'), row('new', 'skill'), row('real', 'skill')]))
    expect(rows.map((r) => r.name)).toEqual(['compact', 'new', 'real'])
  })

  it('drops rows with unknown sources (defensive: the menu never invents a dispatch)', () => {
    const rows = projectCommandMenu(
      catalog([row('real', 'prompt'), { name: 'junk', description: 'x', source: 'builtin' as 'prompt' } as unknown as NewTaskCommandRow])
    )
    expect(rows.map((r) => r.name)).toEqual(['real'])
  })

  it('is truthfully empty for a catalog with no commands (no templates, no skills)', () => {
    expect(projectCommandMenu(catalog([]))).toEqual([])
  })

  it('is empty while no catalog has arrived yet (null)', () => {
    expect(projectCommandMenu(null)).toEqual([])
  })

  it('is empty for a failed probe (error report, empty commands)', () => {
    const failed: NewTaskCommandCatalog = { cwd: '/tmp/proj', commands: [], error: 'The auth probe timed out.', scannedAt: 1 }
    expect(projectCommandMenu(failed)).toEqual([])
  })
})

describe('selectCommandCatalog', () => {
  const dirA = catalog([row('a', 'prompt')], '/tmp/a')
  const dirB = catalog([row('b', 'skill')], '/tmp/b')
  const globalOnly = catalog([row('g', 'prompt')], null)

  it('picks the catalog for the selected directory', () => {
    expect(selectCommandCatalog([dirA, dirB], '/tmp/b')).toBe(dirB)
    expect(selectCommandCatalog([dirA, dirB], '/tmp/a')).toBe(dirA)
  })

  it('picks the null-cwd (global-only) catalog when nothing is selected', () => {
    expect(selectCommandCatalog([dirA, globalOnly], null)).toBe(globalOnly)
  })

  it('returns null when no catalog matches the selection yet (probe still in flight)', () => {
    expect(selectCommandCatalog([dirA], '/tmp/unknown')).toBeNull()
    expect(selectCommandCatalog([], '/tmp/a')).toBeNull()
  })
})
