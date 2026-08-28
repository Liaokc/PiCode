/**
 * @-mention completion over files and directories: parsing the active
 * @-token at the caret, applying a picked path, and ranking candidate paths
 * delivered by the host (`file_list`).
 */

import { fuzzyScore } from './fuzzy'

/** The active @-mention query ending exactly at `caret`, or null. The token
 * must start at the text beginning or after whitespace; the query is the
 * text between `@` and the caret (possibly empty). */
export function mentionQueryAt(text: string, caret: number): string | null {
  const before = text.slice(0, caret)
  const match = /(?:^|\s)@([^\s]*)$/.exec(before)
  return match ? match[1] : null
}

/** Replace the @-token under `caret` with `path` (plus a trailing space). */
export function applyMention(text: string, caret: number, path: string): { text: string; caret: number } {
  const before = text.slice(0, caret)
  const match = /(?:^|\s)@([^\s]*)$/.exec(before)
  if (!match) return { text, caret }
  const start = caret - match[1].length - 1 // 1 for the `@`
  const inserted = `${path} `
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length
  }
}

export const FILE_MENU_LIMIT = 8

/** Rank host-delivered relative paths for the @ menu: basename matches beat
 * deeper path matches; both fuzzily ranked. */
export function filterFiles(files: readonly string[], query: string): string[] {
  if (query.length === 0) return files.slice(0, FILE_MENU_LIMIT)
  const scored: Array<{ file: string; score: number; index: number }> = []
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const onBasename = fuzzyScore(query, basename(file))
    const score = onBasename !== null ? onBasename + 10 : fuzzyScore(query, file)
    if (score !== null) scored.push({ file, score, index })
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.slice(0, FILE_MENU_LIMIT).map((s) => s.file)
}

function basename(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}
