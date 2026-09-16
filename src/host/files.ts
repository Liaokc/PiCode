/**
 * Host-side candidate listing for @-mention completion. Ticket 71: when the
 * session cwd answers as a git work tree the candidates come from read-only
 * `git ls-files` — the repo's own full, fast candidate set (tracked +
 * untracked-unignored), so a huge repo no longer leaves `@ts` empty (the
 * pi16-at-no-match failure: the walk's alphabetical DFS exhausted its cap
 * inside the first directories). Anywhere git cannot answer the capped
 * directory walk stays the fallback — depth/entry caps unchanged, and a walk
 * that stopped early on the entry cap reports `truncated` so the renderer
 * can append the honest "truncated" hint. Matching/ranking happens
 * renderer-side; the host never filters by query.
 *
 * Zero writes: `git ls-files` is pure plumbing (unlike `git status` it never
 * refreshes the index) — the branch_info precedent (ticket 21), pinned by a
 * smoke assertion on the index bytes.
 */

import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export const FILE_SCAN_LIMIT = 1500
const MAX_DEPTH = 8

/** `git ls-files` must answer quickly or we degrade to the walk; the buffer
 * has to hold every path of a huge repo at once (a full monorepo can reach
 * tens of MB of NUL-terminated paths — beyond it we degrade too). */
const GIT_LS_TIMEOUT_MS = 5_000
const GIT_LS_MAX_BUFFER = 64 * 1024 * 1024

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

/** The @-mention candidate set: the files plus whether the listing was cut
 * short by the walk's entry cap (`truncated` is never true for the git
 * path — the repo's own answer is full). */
export interface CandidateFiles {
  files: string[]
  truncated: boolean
}

/** The ticket-71 candidate set: `git ls-files` when the cwd is inside a git
 * work tree (tracked + untracked-unignored, paths relative to the cwd, so a
 * session in a subdirectory or a linked worktree stays correct), else the
 * capped walk. Both failure modes of git — not a repo, no binary, timeout,
 * buffer overflow — degrade silently to the walk. */
export async function listMentionCandidates(root: string): Promise<CandidateFiles> {
  const gitFiles = await gitWorkTreeFiles(root)
  if (gitFiles !== null) return { files: gitFiles, truncated: false }
  return listRelativeFiles(root)
}

/** All candidate paths git knows for `root`, NUL-parsed (-z: verbatim bytes,
 * no quoting for non-ASCII names), or null when git cannot answer. */
async function gitWorkTreeFiles(root: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileP(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, timeout: GIT_LS_TIMEOUT_MS, maxBuffer: GIT_LS_MAX_BUFFER }
    )
    const files = stdout.split('\0').filter((path) => path.length > 0)
    files.sort()
    return files
  } catch {
    return null
  }
}

/** Sorted relative POSIX paths under `root`, bounded by `limit`/`maxDepth`.
 * `truncated` is true iff the walk stopped early on the entry cap — the
 * honest degradation signal behind the "truncated" hint (the walk cannot
 * know whether unvisited entries held files without defeating the cap, so
 * "stopped at the cap" is the reported truth). A depth cut is structural,
 * not cap truncation, and does not set the flag. */
export async function listRelativeFiles(
  root: string,
  opts: { limit?: number; maxDepth?: number } = {}
): Promise<CandidateFiles> {
  const limit = opts.limit ?? FILE_SCAN_LIMIT
  const maxDepth = opts.maxDepth ?? MAX_DEPTH
  const out: string[] = []
  let truncated = false

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (out.length >= limit) {
      truncated = true
      return
    }
    if (depth > maxDepth) return
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return // unreadable directory — skip silently
    }
    names.sort()
    for (const name of names) {
      if (out.length >= limit) {
        truncated = true
        return
      }
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
  return { files: out, truncated }
}
