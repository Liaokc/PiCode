/**
 * Unified diff parser for the Review tab: turns `git diff` patch text into
 * structured per-file patches. Pure function — no I/O, no git invocation —
 * so the fixture table in tests/review/parse.test.ts pins the exact format
 * git emits (headers, hunk counts, binary sections, no-newline markers).
 *
 * Hunk consumption follows the declared `@@` line counts, which is what
 * keeps deleted content that itself looks like a header (e.g. a removed
 * `--- a/x` line) from being mistaken for the next file.
 */

import type { DiffHunk, DiffRow, FilePatch } from './types'

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

interface FileFlags {
  isNew: boolean
  isDelete: boolean
  isRename: boolean
  renameFrom: string | null
  oldPath: string | null
  newPath: string | null
  binary: boolean
}

/** Strip git's `a/` or `b/` prefix; `/dev/null` becomes null. */
function stripPrefix(path: string): string | null {
  if (path === '/dev/null') return null
  return path.replace(/^[ab]\//, '')
}

/** Undo git's C-style path quoting (`"a/we \"ird\"" → we "ird"`). */
function unquoteGitPath(path: string): string {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) return path
  const body = path.slice(1, -1)
  return body.replace(/\\(x[0-9a-fA-F]{2}|[0-7]{3}|.)/g, (_match, escape: string) => {
    switch (escape[0]) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      case 'x':
        return String.fromCharCode(parseInt(escape.slice(1), 16))
      case '\\':
        return '\\'
      case '"':
        return '"'
      default:
        if (/^[0-7]{3}$/.test(escape)) return String.fromCharCode(parseInt(escape, 8))
        return escape
    }
  })
}

/** Fallback path extraction from the `diff --git a/x b/y` line itself. */
function pathsFromDiffLine(line: string): { oldPath: string; newPath: string } | null {
  const rest = line.slice('diff --git '.length)
  const quoted = /^"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"$/.exec(rest)
  if (quoted) {
    const oldPath = unquoteGitPath(quoted[1]).replace(/^[ab]\//, '')
    const newPath = unquoteGitPath(quoted[2]).replace(/^[ab]\//, '')
    return { oldPath, newPath }
  }
  const sep = rest.lastIndexOf(' b/')
  if (sep === -1) return null
  return { oldPath: rest.slice(2, sep), newPath: rest.slice(sep + 3) }
}

/** Consume hunk body rows until the declared old/new line counts are met. */
function consumeHunkRows(lines: string[], start: number, hunk: DiffHunk): number {
  let i = start
  let oldLine = hunk.oldStart
  let newLine = hunk.newStart
  let seenOld = 0
  let seenNew = 0
  while (i < lines.length && (seenOld < hunk.oldLines || seenNew < hunk.newLines)) {
    const line = lines[i]
    const marker = line.charAt(0)
    if (marker === '\\') {
      hunk.rows.push({ kind: 'meta', text: line })
      i++
      continue
    }
    const text = line.slice(1)
    if (marker === ' ') {
      hunk.rows.push({ kind: 'context', oldLine, newLine, text })
      oldLine++
      newLine++
      seenOld++
      seenNew++
    } else if (marker === '-') {
      hunk.rows.push({ kind: 'del', oldLine, text })
      oldLine++
      seenOld++
    } else if (marker === '+') {
      hunk.rows.push({ kind: 'add', newLine, text })
      newLine++
      seenNew++
    } else {
      // Malformed patch: stop consuming rather than swallowing headers.
      break
    }
    i++
  }
  // Trailing "\ No newline at end of file" markers sit beyond the declared
  // counts but still belong to this hunk's body.
  while (i < lines.length && lines[i].startsWith('\\')) {
    hunk.rows.push({ kind: 'meta', text: lines[i] })
    i++
  }
  return i
}

/**
 * Parse the full output of `git diff` (possibly many files) into per-file
 * patches. Unknown lines (index, similarity, binary payloads, diffstats
 * sections) are skipped defensively.
 */
export function parseGitDiff(diffText: string): FilePatch[] {
  const files: FilePatch[] = []
  if (diffText.trim() === '') return files
  const lines = diffText.split('\n')

  let current: FilePatch | null = null
  let flags: FileFlags | null = null
  let hunk: DiffHunk | null = null

  const finishFile = (): void => {
    if (!current || !flags) return
    const status = flags.isRename ? 'renamed' : flags.isNew ? 'added' : flags.isDelete ? 'deleted' : 'modified'
    const path = (flags.isDelete ? flags.oldPath : flags.newPath) ?? flags.oldPath ?? current.path
    files.push({
      path,
      oldPath: flags.isRename ? flags.renameFrom : null,
      status,
      binary: flags.binary,
      hunks: current.hunks
    })
    current = null
    flags = null
    hunk = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      finishFile()
      const fromDiffLine = pathsFromDiffLine(line)
      flags = {
        isNew: false,
        isDelete: false,
        isRename: false,
        renameFrom: null,
        oldPath: fromDiffLine?.oldPath ?? '',
        newPath: fromDiffLine?.newPath ?? '',
        binary: false
      }
      current = { path: flags.newPath || flags.oldPath || '', oldPath: null, status: 'modified', binary: false, hunks: [] }
      continue
    }
    if (!current || !flags) continue
    if (line.startsWith('new file mode')) {
      flags.isNew = true
      continue
    }
    if (line.startsWith('deleted file mode')) {
      flags.isDelete = true
      continue
    }
    if (line.startsWith('rename from ')) {
      flags.isRename = true
      flags.renameFrom = unquoteGitPath(line.slice('rename from '.length))
      continue
    }
    if (line.startsWith('rename to ')) {
      flags.newPath = unquoteGitPath(line.slice('rename to '.length))
      continue
    }
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      flags.binary = true
      continue
    }
    if (line.startsWith('--- ')) {
      const path = stripPrefix(unquoteGitPath(line.slice(4)))
      if (path !== null) flags.oldPath = path
      continue
    }
    if (line.startsWith('+++ ')) {
      const path = stripPrefix(unquoteGitPath(line.slice(4)))
      if (path !== null) flags.newPath = path
      continue
    }
    const header = HUNK_HEADER.exec(line)
    if (header && !flags.binary) {
      hunk = {
        header: line,
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        rows: []
      }
      current.hunks.push(hunk)
      i = consumeHunkRows(lines, i + 1, hunk) - 1
      hunk = null
      continue
    }
    // Everything else (index, similarity, mode lines, binary payloads) is skipped.
  }
  finishFile()
  return files
}

/** Additions/deletions for a parsed file; binary and hunk-less files are 0/0. */
export function rowStat(file: FilePatch): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const hunk of file.hunks) {
    for (const row of hunk.rows) {
      if (row.kind === 'add') additions++
      else if (row.kind === 'del') deletions++
    }
  }
  return { additions, deletions }
}

export type UnifiedRenderRow = { kind: 'hunk-header'; header: string } | { kind: 'row'; row: DiffRow }

/** Flatten a file's hunks into the ordered row list the unified view renders. */
export function unifiedRenderRows(file: { hunks: DiffHunk[] }): UnifiedRenderRow[] {
  const out: UnifiedRenderRow[] = []
  for (const hunk of file.hunks) {
    out.push({ kind: 'hunk-header', header: hunk.header })
    for (const row of hunk.rows) out.push({ kind: 'row', row })
  }
  return out
}
