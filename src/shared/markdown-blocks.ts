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
  /** Element data (mdast-util-to-hast parks the fence meta at `data.meta`). */
  data?: unknown
}

const LANGUAGE_PREFIX = 'language-'

/** The first `code` child of a `pre` element, if any (fenced-block shape). */
function firstCodeChild(node: HastLike | undefined): HastLike | undefined {
  for (const child of node?.children ?? []) {
    if (child.tagName === 'code') return child
  }
  return undefined
}

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
  return codeLanguageFromClassName(firstCodeChild(node)?.properties?.className)
}

/**
 * Display label of a code card's language chip (ticket 50): the fenced
 * block's language, falling back to 'text' when the fence is untagged —
 * the ZCode same-shape projection `language?.trim() || 'text'`. The label
 * is always rendered; a whitespace-only token trims into the fallback.
 */
export function codeLanguageLabel(node: HastLike | undefined): string {
  return codeLanguage(node)?.trim() || 'text'
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

/**
 * Cell text: raw content, pipes escaped, newlines flattened (GFM cells are
 * single-line).
 */
function tableCellText(node: HastLike): string {
  return rawCellText(node).replace(/\|/g, '\\|')
}

/** Cell text shared by every serialization: content as-is but newlines
 * flattened to spaces (hast cell content is effectively single-line) and
 * trimmed. Format-specific escaping happens on top of this. */
function rawCellText(node: HastLike): string {
  return hastText(node)
    .replace(/\r?\n/g, ' ')
    .trim()
}

/** The `tr` rows of a hast table in document order (thead sections first). */
function tableRows(table: HastLike): HastLike[] {
  const sections = (table.children ?? []).filter((n) => n.tagName === 'thead' || n.tagName === 'tbody')
  return sections.flatMap((section) => section.children ?? []).filter((row) => row.tagName === 'tr')
}

/** The `th`/`td` cells of a hast table row. */
function tableCells(row: HastLike): HastLike[] {
  return (row.children ?? []).filter((c) => c.tagName === 'th' || c.tagName === 'td')
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
  const rows = tableRows(table)
  if (rows.length === 0) return ''
  const cellsOf = (row: HastLike): string[] => tableCells(row).map(tableCellText)
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

// ---- table copy family (ticket 60: CSV / TSV alongside the markdown copy) ----
// ZCode's copyTable family is four formats wide (copy / Markdown / CSV /
// TSV). CSV and TSV share one RFC-4180-shaped serializer, parameterized by
// the delimiter: a field carrying the delimiter, a double quote or a line
// break is quoted with embedded quotes doubled.

/** Quote a field when it carries the delimiter, a quote, or a line break. */
function delimitedCell(text: string, delimiter: string): string {
  if (text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function tableToDelimited(table: HastLike | undefined, delimiter: ',' | '\t'): string {
  if (table === undefined || table.tagName !== 'table') return ''
  const rows = tableRows(table)
  if (rows.length === 0) return ''
  const width = Math.max(headerWidth(rows, (row) => tableCells(row).map(rawCellText)), 1)
  return rows
    .map((row) => {
      const cells = tableCells(row).map(rawCellText)
      return Array.from({ length: width }, (_, i) => delimitedCell(cells[i] ?? '', delimiter)).join(delimiter)
    })
    .join('\n')
}

/**
 * RFC-4180 CSV of a hast `<table>` — the table card's Copy-as-CSV payload,
 * so a copied table pastes cleanly into spreadsheets. Header row first,
 * ragged rows padded rectangular, no trailing newline. Non-table or empty
 * shapes produce ''.
 */
export function tableToCsv(table: HastLike | undefined): string {
  return tableToDelimited(table, ',')
}

/** TSV twin of `tableToCsv` — the Copy-as-TSV payload. */
export function tableToTsv(table: HastLike | undefined): string {
  return tableToDelimited(table, '\t')
}

// ---- fence meta (ticket 60: line numbers / startLine) ----
// The ZCode-evidenced meta parameters of a fenced code block ride in the
// info string after the language (` ```ts noLineNumbers startLine=41 `).
// remark keeps them on the mdast code node's `meta`, mdast-util-to-hast
// parks that string at the hast `code` element's `data.meta`, and
// rehype-highlight mutates the element in place without dropping it.

/** The meta parameters a fenced code block may carry. */
export interface FenceMeta {
  /** The bare `noLineNumbers` flag is present — the gutter is off. */
  noLineNumbers: boolean
  /** `startLine=N` — numbering starts at N instead of 1. */
  startLine: number | null
}

const DEFAULT_FENCE_META: FenceMeta = { noLineNumbers: false, startLine: null }

/**
 * Parse a fence's meta string (the info string minus the language token).
 * Only two parameters exist: the bare `noLineNumbers` flag and the
 * `startLine=<digits>` count shift. Unknown tokens are ignored; a malformed
 * `startLine` degrades to the default count — a meta that cannot be read
 * never changes the card, it only falls back to ZCode's defaults.
 */
export function parseFenceMeta(meta: string | null | undefined): FenceMeta {
  if (meta === null || meta === undefined) return { ...DEFAULT_FENCE_META }
  let noLineNumbers = false
  let startLine: number | null = null
  for (const token of meta.split(/\s+/)) {
    if (token === 'noLineNumbers') noLineNumbers = true
    const start = /^startLine=(\d+)$/.exec(token)
    if (start !== null) startLine = Number.parseInt(start[1] ?? '', 10)
  }
  return { noLineNumbers, startLine }
}

/**
 * The fence meta of a fenced code block, read off the hast `pre`'s first
 * `code` child (`data.meta`). Nodes without usable data degrade to the
 * default shape: numbers on, count from 1.
 */
export function fenceMetaOfNode(node: HastLike | undefined): FenceMeta {
  const data = firstCodeChild(node)?.data as { meta?: unknown } | undefined
  return parseFenceMeta(typeof data?.meta === 'string' ? data.meta : null)
}

/**
 * The line numbers a code card's gutter renders (ticket 60): `null` when
 * the gutter is off (`noLineNumbers`), otherwise `lineCount` numbers from
 * `startLine ?? 1` — the projection the ZCode default-on evidence calls for.
 */
export function codeLineNumbers(meta: FenceMeta, lineCount: number): number[] | null {
  if (meta.noLineNumbers) return null
  const first = meta.startLine ?? 1
  return Array.from({ length: Math.max(0, lineCount) }, (_, i) => first + i)
}

// ---- code body (ticket 60: per-line tokens for the gutter) ----

/** One highlighted fragment of a code line. */
export interface CodeToken {
  text: string
  /** The enclosing highlight class (`hljs-keyword`…), or null for plain text. */
  className: string | null
}

/** The rebuilt content of a code card's `<code>` element. */
export interface CodeBody {
  /** The original `code` element's className (hljs + language-*) — carried
   * onto the rebuilt element so token styling keeps applying. */
  className: string | string[] | undefined
  /** The highlighted content, split per logical line (the trailing newline
   * every fenced block carries is dropped — it renders no extra line). */
  lines: CodeToken[][]
}

/** A token class list (hast string-or-array shape) as one class string. */
function tokenClassName(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value
  if (Array.isArray(value)) {
    const parts = value.filter((c): c is string => typeof c === 'string')
    return parts.length > 0 ? parts.join(' ') : null
  }
  return null
}

/** The code element's className for the rebuilt element (React-shaped). */
function codeElementClassName(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value === '' ? undefined : value
  if (Array.isArray(value)) {
    const parts = value.filter((c): c is string => typeof c === 'string')
    return parts.length > 0 ? parts : undefined
  }
  return undefined
}

/**
 * A code card's content as per-line token lists (ticket 60): the same hast
 * the highlighter produced, depth-first, with every text node split on
 * newlines so each logical line can carry its number in-flow. Highlight
 * elements survive as tokens; a token spanning several lines (block
 * comment, template literal) re-opens its class on every line it touches.
 * The trailing newline the markdown pipeline always appends is dropped —
 * it renders no extra line.
 */
export function codeBody(node: HastLike | undefined): CodeBody {
  const code = firstCodeChild(node)
  const className = codeElementClassName(code?.properties?.className)
  const lines: CodeToken[][] = []
  let current: CodeToken[] = []

  function pushText(text: string, className: string | null): void {
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        lines.push(current)
        current = []
      }
      const part = parts[i] ?? ''
      if (part !== '') current.push({ text: part, className })
    }
  }

  function walk(nodes: HastLike[], inherited: string | null): void {
    for (const node of nodes) {
      if (node.type === 'text') {
        pushText(node.value ?? '', inherited)
        continue
      }
      walk(node.children ?? [], tokenClassName(node.properties?.className) ?? inherited)
    }
  }

  if (code !== undefined) {
    walk(code.children ?? [], null)
    lines.push(current)
    // mdast-util-to-hast appends exactly one '\n' to a non-empty code
    // value; the walk turns it into an empty tail line nobody renders.
    if (lines.length > 1 && (lines[lines.length - 1] ?? []).length === 0 && hastText(code).endsWith('\n')) {
      lines.pop()
    }
  }
  return { className, lines: lines.length > 0 ? lines : [[]] }
}

// ---- fence card kind (ticket 59: mermaid diagram cards) ----
// The fenced block's card kind is a pure projection over three facts: the
// fence language, whether the fence is CLOSED in the current text (a
// streaming fence is still open — mermaid needs the full text before it can
// parse), and the async parse verdict. Only the closed + parse-ok mermaid
// fence renders as a diagram card; every other shape keeps the plain source
// card (lang chip unchanged, no error toast).

/** Card kind of a fenced block: rendered diagram vs plain source code. */
export type FenceCardKind = 'diagram' | 'source'

/** Mermaid parse verdict: `null` while not yet attempted (streaming or the
 * parse round-trip is still in flight). */
export type MermaidParseVerdict = boolean | null

/** Whether the fence's language tag is mermaid (trimmed, case-insensitive —
 * info strings arrive as typed, and every case routes to the same family). */
export function isMermaidLanguage(lang: string | null): boolean {
  return lang?.trim().toLowerCase() === 'mermaid'
}

/** Escapes a string for literal use inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether the fenced code block that opens at `startOffset` in `text` is
 * closed — i.e. the text already carries a legal closing fence after the
 * opening line. During streaming the closing fence has not arrived yet, so
 * this is the closed-vs-streaming projection the diagram-card gate consumes.
 *
 * CommonMark rules, enough of them for fences: the closing marker repeats
 * the opening character (backticks vs tildes never cross) and is at least as
 * long; up to three leading spaces are allowed on fence lines; the first
 * closing marker wins (fence content is literal). The `pre` element's hast
 * position starts exactly at the opening marker.
 *
 * Degrades to `false` (the safe source-card answer) without position data or
 * for an out-of-range offset; a non-fence offset reads as closed (no
 * streaming ambiguity).
 */
export function isFenceClosed(text: string, startOffset: number | undefined): boolean {
  if (startOffset === undefined || startOffset < 0 || startOffset >= text.length) return false
  const rest = text.slice(startOffset)
  const opening = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(rest)
  if (opening === null) return true
  const marker = opening[1] ?? '```'
  const closing = new RegExp(`^[ \\t]{0,3}${escapeRegExp(marker[0] ?? '`')}{${marker.length},}[ \\t]*$`, 'm')
  // Skip the opening line itself, then the first legal closing marker wins.
  const afterOpening = rest.slice(rest.indexOf('\n') + 1)
  return closing.test(afterOpening)
}

/** The three facts the fence-card projection consumes. */
export interface FenceKindInput {
  /** The fence's language tag (`null` when untagged). */
  lang: string | null
  /** Whether the fence is closed in the current text (see `isFenceClosed`). */
  closed: boolean
  /** The async parse verdict (`null` while pending — never trusted when open). */
  parseOk: MermaidParseVerdict
}

/**
 * The fenced block's card kind (ticket 59, the ZCode-evidenced projection):
 * exactly a closed, mermaid-tagged fence with a successful parse renders as
 * a diagram card. Streaming (unclosed) fences and parse failures keep the
 * plain source card — the lang chip renders as usual and no error toast
 * pops (operator ruling Q7).
 */
export function fenceCardKind(input: FenceKindInput): FenceCardKind {
  return isMermaidLanguage(input.lang) && input.closed && input.parseOk === true ? 'diagram' : 'source'
}

// ---- code download (ticket 60: save a code card's source as a file) ----
// ZCode's code card carries a download button next to copy; the file
// extension derives from the fence language.

/** Known fence-language → file-extension mappings (ZCode's download
 * derivation). Aliases collapse onto the file extension, never the name. */
const CODE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  mjs: 'mjs',
  cjs: 'cjs',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  mts: 'mts',
  cts: 'cts',
  python: 'py',
  python3: 'py',
  py: 'py',
  py3: 'py',
  bash: 'sh',
  shell: 'sh',
  shellsession: 'sh',
  console: 'sh',
  zsh: 'sh',
  sh: 'sh',
  json: 'json',
  json5: 'json5',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yml',
  toml: 'toml',
  html: 'html',
  xml: 'xml',
  svg: 'svg',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  markdown: 'md',
  md: 'md',
  mdx: 'mdx',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  golang: 'go',
  java: 'java',
  kotlin: 'kt',
  kt: 'kt',
  swift: 'swift',
  objectivec: 'm',
  objc: 'm',
  c: 'c',
  h: 'h',
  cpp: 'cpp',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  hpp: 'hpp',
  hh: 'hpp',
  csharp: 'cs',
  'c#': 'cs',
  cs: 'cs',
  fsharp: 'fs',
  fs: 'fs',
  ruby: 'rb',
  rb: 'rb',
  php: 'php',
  perl: 'pl',
  pl: 'pl',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  scala: 'scala',
  haskell: 'hs',
  hs: 'hs',
  elm: 'elm',
  elixir: 'ex',
  ex: 'ex',
  exs: 'exs',
  erlang: 'erl',
  clojure: 'clj',
  clj: 'clj',
  cljs: 'cljs',
  vim: 'vim',
  vimscript: 'vim',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  ini: 'ini',
  conf: 'conf',
  diff: 'diff',
  patch: 'patch',
  powershell: 'ps1',
  ps1: 'ps1',
  bat: 'bat',
  batch: 'bat',
  nix: 'nix',
  zig: 'zig',
  vue: 'vue',
  svelte: 'svelte',
  mermaid: 'mmd',
  mmd: 'mmd',
  text: 'txt',
  plaintext: 'txt',
  plain: 'txt',
  txt: 'txt',
  log: 'log'
}

/**
 * The download extension derived from a fence language (ticket 60): known
 * languages map to their canonical file extension, an unknown but
 * filesystem-safe token becomes its own extension, everything else degrades
 * to `txt` — a hostile or malformed tag can never shape the filename.
 */
export function codeFileExtension(lang: string | null): string {
  const token = lang?.trim().toLowerCase() ?? ''
  const known = CODE_EXTENSIONS[token]
  if (known !== undefined) return known
  return /^[a-z0-9_-]{1,16}$/.test(token) ? token : 'txt'
}

/** The download filename of a code card: a neutral base + derived extension. */
export function codeFileName(lang: string | null): string {
  return `snippet.${codeFileExtension(lang)}`
}
