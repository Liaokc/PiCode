/**
 * Turn File Changes projection (ticket 78, Seam-1): folds one turn's settled
 * edit/write tool calls into the per-file rows under the collapsed
 * "N files changed +X −Y" bar. Pure — no I/O, no clock, no React.
 *
 * Data contract (ticket 78 additive increment): edit tool results carry a
 * display diff (`details.diff` — sign-prefixed rows with a padded line
 * number); write results carry none (a new file is recorded as "+new", never
 * line counts). The host relays that diff text on the live `tool_end` event
 * and the structured replay items carry it too, so live and settled turns
 * aggregate isomorphically (同构). read/ls/grep/find/bash never enter the
 * bar; a turn with no settled edit/write aggregates to no bar at all.
 */

import type { ToolEntry } from './chat-reducer'

/** One file's aggregated change inside a turn (one bar row). */
export interface TurnFileChange {
  /** Path exactly as the tool call wrote it (display + Open deep link). */
  path: string
  /** Added line count parsed from the diff text; null = new file (write),
   * rendered "+new" — a write never counts lines (ticket 78). */
  added: number | null
  /** Removed line count parsed from the diff text (0 for write-only rows). */
  removed: number
  /** The file's concatenated edit diff text (insertion order), for the
   * turn-diff side-panel tab. Empty for write-only rows and for edits whose
   * result predates the diff projection (old payloads — counts degrade 0/0). */
  diff: string
  /** How many tool calls folded into this row (audit trail). */
  calls: number
}

/** One rendered row of a turn diff (the side-panel tab body). `line` is the
 * number the Pi display diff prints for that row (old-file numbering for
 * del/context, new-file for add); null on meta rows. */
export type TurnDiffRow =
  | { kind: 'context'; line: number; text: string }
  | { kind: 'add'; line: number; text: string }
  | { kind: 'del'; line: number; text: string }
  | { kind: 'meta'; line: null; text: string }

/** Sign row of the Pi display diff: sign + padded number + ONE separator
 * space + verbatim line content (which may itself start with spaces). */
const SIGN_ROW = /^([+-])\s*(\d+) (.*)$/

/** Context row: a leading space plays the sign, then the padded number. */
const CONTEXT_ROW = /^ (\s*\d+) (.*)$/

/**
 * Parse one edit result's display diff into renderable rows. Defensive by
 * design: unparseable lines degrade to dim meta rows; empty input parses to
 * no rows; a trailing newline (the tool's text ends with one) is dropped.
 */
export function parseTurnDiffRows(text: string): TurnDiffRow[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const rows: TurnDiffRow[] = []
  for (const line of lines) {
    const sign = SIGN_ROW.exec(line)
    if (sign !== null) {
      const kind = sign[1] === '+' ? 'add' : 'del'
      rows.push({ kind, line: Number(sign[2]), text: sign[3] })
      continue
    }
    const context = CONTEXT_ROW.exec(line)
    if (context !== null) {
      rows.push({ kind: 'context', line: Number(context[1]), text: context[2] })
      continue
    }
    // Skipped-context marker (`      ...`) or anything unrecognized —
    // rendered dim, never allowed to break the view.
    rows.push({ kind: 'meta', line: null, text: line.trim() })
  }
  return rows
}

/** added/removed of one diff text — the single counting rule the bar uses. */
function countDiff(text: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const row of parseTurnDiffRows(text)) {
    if (row.kind === 'add') added++
    else if (row.kind === 'del') removed++
  }
  return { added, removed }
}

/** Path argument of an edit/write call (both schemas use `path`; the
 * file_path fallback mirrors the tool-card summary's tolerance). */
function pathOf(args: Record<string, unknown>): string | null {
  if (typeof args['path'] === 'string' && args['path'] !== '') return args['path']
  if (typeof args['file_path'] === 'string' && args['file_path'] !== '') return args['file_path']
  return null
}

/**
 * Fold a turn's tool entries (transcript order) into per-file change rows.
 * Only SETTLED SUCCESSFUL edit/write calls count — the bar grows as tools
 * settle (live 与落定同构); a failed or still-running call changed nothing.
 * Same file merges into ONE row (diffs concatenated in order); a write in
 * the mix makes the row a new-file row ("+new" — counts never apply).
 */
export function aggregateTurnFiles(tools: readonly ToolEntry[]): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange>()
  const order: string[] = []
  for (const entry of tools) {
    if (entry.role !== 'tool') continue
    if (entry.name !== 'edit' && entry.name !== 'write') continue
    if (entry.state !== 'done') continue
    const path = pathOf(entry.args)
    if (path === null) continue
    const diff = typeof entry.diff === 'string' && entry.diff !== '' ? entry.diff : ''
    const counts = countDiff(diff)
    const existing = byPath.get(path)
    if (existing === undefined) {
      order.push(path)
      byPath.set(path, {
        path,
        added: entry.name === 'write' ? null : counts.added,
        removed: entry.name === 'write' ? 0 : counts.removed,
        diff,
        calls: 1
      })
      continue
    }
    existing.calls++
    if (diff !== '') existing.diff = existing.diff === '' ? diff : `${existing.diff}\n${diff}`
    if (entry.name === 'write') {
      // A write (re)created the file: the row becomes "+new" for good.
      existing.added = null
      existing.removed = 0
    } else if (existing.added !== null) {
      existing.added += counts.added
      existing.removed += counts.removed
    }
  }
  return order.map((path) => byPath.get(path) as TurnFileChange)
}

/** The collapsed bar's headline numbers: N files changed +X −Y. Writes count
 * toward N only (added === null rows contribute no ±). */
export function turnFileTotals(changes: readonly TurnFileChange[]): {
  files: number
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const change of changes) {
    if (change.added !== null) added += change.added
    removed += change.removed
  }
  return { files: changes.length, added, removed }
}
