/**
 * Host-side candidate listing for @-mention completion (ticket 05). Walks the
 * session cwd with hard caps (depth, entry count) and skips dependency/VCS/
 * build directories — good-enough context candidates without a full
 * git-aware scan. Matching/ranking happens renderer-side.
 */

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const FILE_SCAN_LIMIT = 1500
const MAX_DEPTH = 8

/** Directories never worth offering as context, at any depth. */
const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'out',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.worktrees',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  '.turbo'
])

export function shouldSkipDir(name: string): boolean {
  return SKIPPED_DIRS.has(name)
}

/** Sorted relative POSIX paths under `root`, bounded by `limit`/`maxDepth`. */
export async function listRelativeFiles(
  root: string,
  opts: { limit?: number; maxDepth?: number } = {}
): Promise<string[]> {
  const limit = opts.limit ?? FILE_SCAN_LIMIT
  const maxDepth = opts.maxDepth ?? MAX_DEPTH
  const out: string[] = []

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (out.length >= limit || depth > maxDepth) return
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return // unreadable directory — skip silently
    }
    names.sort()
    for (const name of names) {
      if (out.length >= limit) return
      const full = join(dir, name)
      const rel = prefix === '' ? name : `${prefix}/${name}`
      let info
      try {
        info = await stat(full)
      } catch {
        continue // vanished mid-walk — skip
      }
      if (info.isDirectory()) {
        if (!shouldSkipDir(name)) await walk(full, rel, depth + 1)
      } else if (info.isFile()) {
        out.push(rel)
      }
    }
  }

  await walk(root, '', 0)
  return out
}
