/**
 * @-mention completion over files and directories: parsing the active
 * @-token at the caret, applying a picked path, and ranking candidate paths
 * delivered by the host (`file_list`).
 */

import { fuzzyScore } from './fuzzy'
import { FILE_LIST_TRUNCATED } from '../contract.ts'

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

/** Ticket 71: split the wire payload of a `file_list` reply into the actual
 * candidates and the truncation flag. The host appends `FILE_LIST_TRUNCATED`
 * as the last element when its walk hit the cap (repo workspaces never do —
 * `git ls-files` is full); the marker must never reach the ranking or the
 * menu rows, so the composer strips it exactly once, here. */
export function splitTruncatedFiles(files: readonly string[]): { files: string[]; truncated: boolean } {
  if (files.length > 0 && files[files.length - 1] === FILE_LIST_TRUNCATED) {
    return { files: files.slice(0, -1), truncated: true }
  }
  return { files: [...files], truncated: false }
}

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
