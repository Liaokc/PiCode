/**
 * Block-level affordances for the transcript markdown (ticket 16): pure
 * helpers over the hast tree that react-markdown hands to `components`
 * overrides. No React, no clipboard, no timers — this module is the
 * Seam-1-testable core of the code-block card (language label, raw copy
 * text) and the table card (table → GFM markdown), plus the stable state
 * key that keeps copy/wrap/expand feedback alive across streaming
 * re-mounts.
 */

/** Minimal structural view of a hast node (elements, text, roots). */
export interface HastLike {
  type?: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastLike[]
  position?: { start?: { line?: number; column?: number } }
}

const LANGUAGE_PREFIX = 'language-'

/** Extract the `language-x` token from a className property (string or hast array). */
export function codeLanguageFromClassName(className: unknown): string | null {
  const parts: string[] = Array.isArray(className)
    ? className.filter((c): c is string => typeof c === 'string')
    : typeof className === 'string'
      ? className.split(/\s+/)
      : []
  for (const part of parts) {
    if (part.startsWith(LANGUAGE_PREFIX) && part.length > LANGUAGE_PREFIX.length) {
      return part.slice(LANGUAGE_PREFIX.length)
    }
  }
  return null
}

/** Language tag of a fenced code block: the first `code` child's className. */
export function codeLanguage(node: HastLike | undefined): string | null {
  for (const child of node?.children ?? []) {
    if (child.tagName === 'code') return codeLanguageFromClassName(child.properties?.className)
  }
  return null
}

/** Raw text content — depth-first concatenation of `text` values. */
export function hastText(node: HastLike | undefined): string {
  if (node === undefined) return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(hastText).join('')
}

/**
 * Stable state key for one markdown block across streaming re-renders:
 * markdown re-parses per delta, but append-only growth keeps a block's
 * start position fixed, so the start line/column identifies the block even
 * when its component remounts. Copy/wrap/expand state keys on this.
 * `null` when the tree carries no position — callers degrade gracefully.
 */
export function blockKey(node: HastLike | undefined): string | null {
  const start = node?.position?.start
  if (start === undefined || start.line === undefined || start.column === undefined) return null
  return `${start.line}:${start.column}`
}

/** Cell text: raw content, pipes escaped, newlines flattened (GFM cells are single-line). */
function tableCellText(node: HastLike): string {
  return hastText(node)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim()
}

/** remark-gfm alignment array → separator row tokens (`:---` / `:---:` / `---:`). */
function tableAlignments(table: HastLike): string[] {
  const align = table.properties?.align
  const list = Array.isArray(align) ? align : []
  return list.map((a) =>
    a === 'left' ? ':---' : a === 'right' ? '---:' : a === 'center' ? ':---:' : '---'
  )
}

/**
 * GFM markdown for a hast `<table>` — the table card's Copy payload, so a
 * copied table can be pasted back into the chat or a markdown file. The
 * header row is the first row (thead first in hast order); alignment from
 * the table's `align` property is preserved; ragged rows are padded to the
 * widest row. Non-table or empty shapes produce ''.
 */
export function tableToMarkdown(table: HastLike | undefined): string {
  if (table === undefined || table.tagName !== 'table') return ''
  const sections = (table.children ?? []).filter((n) => n.tagName === 'thead' || n.tagName === 'tbody')
  const rows = sections.flatMap((section) => section.children ?? []).filter((row) => row.tagName === 'tr')
  if (rows.length === 0) return ''
  const cellsOf = (row: HastLike): string[] =>
    (row.children ?? []).filter((c) => c.tagName === 'th' || c.tagName === 'td').map(tableCellText)
  const width = Math.max(headerWidth(rows, cellsOf), 1)
  const pad = (cells: string[]): string[] => Array.from({ length: width }, (_, i) => cells[i] ?? '')
  const aligns = tableAlignments(table)
  const separator = Array.from({ length: width }, (_, i) => aligns[i] ?? '---')
  const lines = [`| ${pad(cellsOf(rows[0])).join(' | ')} |`, `| ${separator.join(' | ')} |`]
  for (const row of rows.slice(1)) lines.push(`| ${pad(cellsOf(row)).join(' | ')} |`)
  return lines.join('\n')
}

function headerWidth(rows: HastLike[], cellsOf: (row: HastLike) => string[]): number {
  let width = 0
  for (const row of rows) width = Math.max(width, cellsOf(row).length)
  return width
}
