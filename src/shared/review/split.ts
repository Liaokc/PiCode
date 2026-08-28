/**
 * Split-view alignment for the Review tab: converts a hunk's unified rows
 * into side-by-side (left = old, right = new) pairs, GitHub-style. Pure
 * function; pairing is index-wise within each contiguous changed block.
 */

import type { DiffHunk, DiffRow } from './types'

export interface SplitRow {
  /** Old-side row (context or deletion); null when only the new side exists. */
  left: DiffRow | null
  /** New-side row (context or addition); null when only the old side exists. */
  right: DiffRow | null
}

export function hunkToSplitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = []
  let block: DiffRow[] = []

  const flush = (): void => {
    if (block.length === 0) return
    const dels = block.filter((row): row is Extract<DiffRow, { kind: 'del' }> => row.kind === 'del')
    const adds = block.filter((row): row is Extract<DiffRow, { kind: 'add' }> => row.kind === 'add')
    const pairs = Math.max(dels.length, adds.length)
    for (let i = 0; i < pairs; i++) {
      rows.push({ left: dels[i] ?? null, right: adds[i] ?? null })
    }
    // No-newline markers collected inside the block render after it, as
    // single lines spanning both columns.
    for (const row of block) {
      if (row.kind === 'meta') rows.push({ left: row, right: null })
    }
    block = []
  }

  for (const row of hunk.rows) {
    if (row.kind === 'context') {
      flush()
      rows.push({ left: row, right: row })
    } else {
      // del/add/meta all buffer: a meta between a del and its paired add
      // (git emits "\\ No newline" between them) must not break the pairing.
      block.push(row)
    }
  }
  flush()
  return rows
}

export type SplitRenderRow = { kind: 'hunk-header'; header: string } | { kind: 'split'; left: DiffRow | null; right: DiffRow | null }

/** Flatten a file's hunks into the ordered row list the split view renders. */
export function splitRenderRows(file: { hunks: DiffHunk[] }): SplitRenderRow[] {
  const out: SplitRenderRow[] = []
  for (const hunk of file.hunks) {
    out.push({ kind: 'hunk-header', header: hunk.header })
    for (const pair of hunkToSplitRows(hunk)) out.push({ kind: 'split', left: pair.left, right: pair.right })
  }
  return out
}
