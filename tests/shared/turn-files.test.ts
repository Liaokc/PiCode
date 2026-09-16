/**
 * Turn File Changes aggregation (ticket 78, Seam-1): the per-turn edit/write
 * projection under the collapsed "N files changed +X −Y" bar. Pure table
 * tests — the bar's every number is derived here, never in the view.
 *
 * Parse input is the Pi edit tool's DISPLAY diff (details.diff): sign-prefixed
 * rows with a padded line number (`+ 14       "id": …`), context rows and the
 * `      ...` skipped-region marker. NOT a git unified patch (no @@ headers).
 */

import { describe, expect, it } from 'vitest'
import type { ToolEntry } from '../../src/shared/chat-reducer'
import { aggregateTurnFiles, parseTurnDiffRows, turnFileTotals } from '../../src/shared/turn-files'

function tool(overrides: Partial<ToolEntry> & { id?: string }): ToolEntry {
  return {
    id: overrides.id ?? 't1',
    role: 'tool',
    name: 'edit',
    args: { path: 'src/a.ts' },
    state: 'done',
    output: 'ok',
    ...overrides
  } as ToolEntry
}

const EDIT_DIFF = [
  '     ...',
  '  10   },',
  '- 13   "old": true,',
  '+ 13   "old": false,',
  '+ 14   "extra": 1,',
  '  15 }'
].join('\n')

describe('parseTurnDiffRows — the Pi display diff (ticket 78)', () => {
  it('table · sign rows carry their printed line number and verbatim content', () => {
    const rows = parseTurnDiffRows(EDIT_DIFF)
    expect(rows[0]).toEqual({ kind: 'meta', line: null, text: '...' })
    expect(rows[1]).toEqual({ kind: 'context', line: 10, text: '  },' })
    expect(rows[2]).toEqual({ kind: 'del', line: 13, text: '  "old": true,' })
    expect(rows[3]).toEqual({ kind: 'add', line: 13, text: '  "old": false,' })
    expect(rows[4]).toEqual({ kind: 'add', line: 14, text: '  "extra": 1,' })
    expect(rows[5]).toEqual({ kind: 'context', line: 15, text: '}' })
  })

  it('table · empty and trailing-newline inputs degrade to no rows', () => {
    expect(parseTurnDiffRows('')).toEqual([])
    expect(parseTurnDiffRows(`${EDIT_DIFF}\n`)).toHaveLength(6)
  })

  it('table · unparseable lines fall back to dim meta rows, never throw', () => {
    expect(parseTurnDiffRows('garbage without a sign')).toEqual([
      { kind: 'meta', line: null, text: 'garbage without a sign' }
    ])
  })
})

describe('aggregateTurnFiles — the turn file bar projection (ticket 78)', () => {
  it('table · one edit → one row, ± counted from the diff text', () => {
    const changes = aggregateTurnFiles([
      tool({ id: 'e1', name: 'edit', args: { path: 'src/a.ts' }, diff: EDIT_DIFF })
    ])
    expect(changes).toEqual([
      { path: 'src/a.ts', added: 2, removed: 1, diff: EDIT_DIFF, calls: 1 }
    ])
  })

  it('table · write records "+new" (added null) and no line counts', () => {
    const changes = aggregateTurnFiles([
      tool({ id: 'w1', name: 'write', args: { path: 'docs/new.md' }, output: 'Successfully wrote to docs/new.md' })
    ])
    expect(changes).toEqual([{ path: 'docs/new.md', added: null, removed: 0, diff: '', calls: 1 }])
  })

  it('table · same file edited twice merges into ONE row, diffs concatenated in order', () => {
    const first = '+ 1 first'
    const second = '- 2 gone\n+ 2 back'
    const changes = aggregateTurnFiles([
      tool({ id: 'e1', args: { path: 'src/a.ts' }, diff: first }),
      tool({ id: 'e2', args: { path: 'src/a.ts' }, diff: second })
    ])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      path: 'src/a.ts',
      added: 2,
      removed: 1,
      diff: `${first}\n${second}`,
      calls: 2
    })
  })

  it('table · read / ls / grep / find / bash never enter the bar', () => {
    const changes = aggregateTurnFiles([
      tool({ id: 'r1', name: 'read', args: { path: 'src/a.ts' }, output: 'contents' }),
      tool({ id: 'l1', name: 'ls', args: { path: '.' }, output: 'a.ts' }),
      tool({ id: 'g1', name: 'grep', args: { pattern: 'x', path: '.' }, output: 'hit' }),
      tool({ id: 'f1', name: 'find', args: { pattern: 'x', path: '.' }, output: 'hit' }),
      tool({ id: 'b1', name: 'bash', args: { command: 'npm test' }, output: 'ok' })
    ])
    expect(changes).toEqual([])
  })

  it('table · running and errored calls are excluded — the bar grows as tools SETTLE', () => {
    const changes = aggregateTurnFiles([
      tool({ id: 'e1', state: 'running', diff: undefined }),
      tool({ id: 'e2', state: 'error', diff: EDIT_DIFF }),
      tool({ id: 'e3', diff: EDIT_DIFF })
    ])
    expect(changes).toEqual([{ path: 'src/a.ts', added: 2, removed: 1, diff: EDIT_DIFF, calls: 1 }])
  })

  it('table · a settled edit WITHOUT diff text (old payload) still lists the file at 0/0', () => {
    const changes = aggregateTurnFiles([tool({ id: 'e1', diff: undefined })])
    expect(changes).toEqual([{ path: 'src/a.ts', added: 0, removed: 0, diff: '', calls: 1 }])
  })

  it('table · write + edit on the same file: the new-file row wins, diffs still concatenate', () => {
    const changes = aggregateTurnFiles([
      tool({ id: 'w1', name: 'write', args: { path: 'src/a.ts' } }),
      tool({ id: 'e1', args: { path: 'src/a.ts' }, diff: '+ 5 later' })
    ])
    expect(changes).toEqual([{ path: 'src/a.ts', added: null, removed: 0, diff: '+ 5 later', calls: 2 }])
  })

  it('table · a path-less call is skipped defensively', () => {
    const changes = aggregateTurnFiles([tool({ id: 'e1', args: {} })])
    expect(changes).toEqual([])
  })

  it('table · transcript order holds across files (diff concatenation is per file)', () => {
    const changes = aggregateTurnFiles([
      tool({ id: 'e1', args: { path: 'a.ts' }, diff: '+ 1 a-one' }),
      tool({ id: 'e2', args: { path: 'b.ts' }, diff: '+ 1 b-one' }),
      tool({ id: 'e3', args: { path: 'a.ts' }, diff: '+ 2 a-two' })
    ])
    expect(changes.map((c) => c.path)).toEqual(['a.ts', 'b.ts'])
    expect(changes[0].diff).toBe('+ 1 a-one\n+ 2 a-two')
    expect(changes[1].diff).toBe('+ 1 b-one')
  })
})

describe('turnFileTotals — the collapsed row\u0027s "+X −Y" (ticket 78)', () => {
  it('table · writes count toward N but never toward ±', () => {
    const changes = aggregateTurnFiles([
      tool({ id: 'e1', diff: EDIT_DIFF }),
      tool({ id: 'w1', name: 'write', args: { path: 'new.md' } })
    ])
    expect(turnFileTotals(changes)).toEqual({ files: 2, added: 2, removed: 1 })
  })

  it('table · no changes → all zeros', () => {
    expect(turnFileTotals([])).toEqual({ files: 0, added: 0, removed: 0 })
  })
})
