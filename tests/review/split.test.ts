import { describe, expect, it } from 'vitest'
import { hunkToSplitRows, splitRenderRows } from '../../src/shared/review/split'
import { parseGitDiff } from '../../src/shared/review/parse'
import type { DiffRow, DiffHunk } from '../../src/shared/review/types'

function hunk(rows: DiffRow[]): DiffHunk {
  return { header: '@@ -1 +1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, rows }
}

const ctx = (n: number, text: string): DiffRow => ({ kind: 'context', oldLine: n, newLine: n, text })
const del = (n: number, text: string): DiffRow => ({ kind: 'del', oldLine: n, text })
const add = (n: number, text: string): DiffRow => ({ kind: 'add', newLine: n, text })

describe('hunkToSplitRows', () => {
  it('passes context rows to both sides', () => {
    const rows = hunkToSplitRows(hunk([ctx(1, 'a'), ctx(2, 'b')]))
    expect(rows).toEqual([
      { left: ctx(1, 'a'), right: ctx(1, 'a') },
      { left: ctx(2, 'b'), right: ctx(2, 'b') }
    ])
  })

  it('pairs equal runs of deletions and additions index-wise', () => {
    const rows = hunkToSplitRows(hunk([del(2, 'old1'), del(3, 'old2'), add(2, 'new1'), add(3, 'new2')]))
    expect(rows).toEqual([
      { left: del(2, 'old1'), right: add(2, 'new1') },
      { left: del(3, 'old2'), right: add(3, 'new2') }
    ])
  })

  it('pads leftover deletions with an empty right side', () => {
    const rows = hunkToSplitRows(hunk([del(2, 'old1'), del(3, 'old2'), add(2, 'new1')]))
    expect(rows).toEqual([
      { left: del(2, 'old1'), right: add(2, 'new1') },
      { left: del(3, 'old2'), right: null }
    ])
  })

  it('pads leftover additions with an empty left side', () => {
    const rows = hunkToSplitRows(hunk([del(2, 'old1'), add(2, 'new1'), add(3, 'new2')]))
    expect(rows).toEqual([
      { left: del(2, 'old1'), right: add(2, 'new1') },
      { left: null, right: add(3, 'new2') }
    ])
  })

  it('aligns each changed block independently, separated by context', () => {
    const rows = hunkToSplitRows(hunk([del(2, 'a'), add(2, 'b'), ctx(3, 'c'), del(5, 'd'), add(4, 'e')]))
    expect(rows).toEqual([
      { left: del(2, 'a'), right: add(2, 'b') },
      { left: ctx(3, 'c'), right: ctx(3, 'c') },
      { left: del(5, 'd'), right: add(4, 'e') }
    ])
  })

  it('emits meta markers as left-only rows for spanning display', () => {
    const meta: DiffRow = { kind: 'meta', text: '\\ No newline at end of file' }
    const rows = hunkToSplitRows(hunk([del(1, 'x'), meta, add(1, 'y')]))
    expect(rows).toEqual([
      { left: del(1, 'x'), right: add(1, 'y') },
      { left: meta, right: null }
    ])
  })
})

describe('splitRenderRows', () => {
  it('interleaves hunk headers with aligned rows', () => {
    const patch = [
      'diff --git a/f.txt b/f.txt',
      'index 1111111..2222222 100644',
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1,2 +1,2 @@',
      '-one',
      '+1',
      ' two',
      '@@ -5,2 +5,2 @@',
      '-five',
      '+5',
      ' six'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    const rows = splitRenderRows(file)
    expect(rows).toEqual([
      { kind: 'hunk-header', header: '@@ -1,2 +1,2 @@' },
      { kind: 'split', left: { kind: 'del', oldLine: 1, text: 'one' }, right: { kind: 'add', newLine: 1, text: '1' } },
      { kind: 'split', left: { kind: 'context', oldLine: 2, newLine: 2, text: 'two' }, right: { kind: 'context', oldLine: 2, newLine: 2, text: 'two' } },
      { kind: 'hunk-header', header: '@@ -5,2 +5,2 @@' },
      { kind: 'split', left: { kind: 'del', oldLine: 5, text: 'five' }, right: { kind: 'add', newLine: 5, text: '5' } },
      { kind: 'split', left: { kind: 'context', oldLine: 6, newLine: 6, text: 'six' }, right: { kind: 'context', oldLine: 6, newLine: 6, text: 'six' } }
    ])
  })
})
