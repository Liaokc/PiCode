/**
 * Review snapshot collector (main process, ticket 06): runs real git against
 * a working directory and folds the output into a `ReviewSnapshot` via the
 * pure parser in shared/review. The renderer only ever sees the JSON-safe
 * snapshot (ADR-0003); no git logic lives in the renderer.
 *
 * Diff semantics = `git diff HEAD` (staged + unstaged vs HEAD), plus
 * untracked files from `git status` synthesized as whole-file additions —
 * exactly what a terminal `git status` + `git diff` review would cover.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { open, stat } from 'node:fs/promises'
import { parseGitDiff, rowStat } from '../../shared/review/parse'
import type { ReviewFileEntry, ReviewResult } from '../../shared/review/types'

const execFileP = promisify(execFile)

/** Generous ceiling for one `git diff HEAD`; exceeding it is a typed failure. */
const MAX_DIFF_BUFFER_BYTES = 32 * 1024 * 1024
/** Untracked files above this size are presented as binary placeholders. */
const MAX_UNTRACKED_BYTES = 512 * 1024
/** How many leading bytes are sniffed for NUL when deciding "binary". */
const BINARY_SNIFF_BYTES = 8192

const COMMON_ARGS = ['-c', 'core.quotepath=false', '--no-pager']

class GitFailure extends Error {
  constructor(
    public readonly reason: Extract<ReviewResult, { ok: false }>['reason'],
    message: string
  ) {
    super(message)
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileP('git', [...COMMON_ARGS, ...args], {
      cwd,
      maxBuffer: MAX_DIFF_BUFFER_BYTES,
      encoding: 'utf8'
    })
    return stdout
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean; stderr?: string }
    if (err.code === 'ENOENT') {
      throw new GitFailure('git-unavailable', 'The git executable was not found on this machine.')
    }
    const stderr = typeof err.stderr === 'string' ? err.stderr : ''
    const code: unknown = err.code
    if (code === 128 && /not a git repository/i.test(stderr)) {
      throw new GitFailure('not-a-git-repo', 'This folder is not a git repository.')
    }
    if (/maxBuffer/i.test(String(err.message))) {
      throw new GitFailure('failed', 'The workspace diff is too large to display (over 32 MB).')
    }
    throw new GitFailure('failed', stderr.trim() || err.message || 'git failed with an unknown error.')
  }
}

interface UntrackedFile {
  path: string
  binary: boolean
  truncated: boolean
  text: string | null
}

async function readUntrackedFile(cwd: string, relPath: string): Promise<UntrackedFile> {
  const absolute = `${cwd}/${relPath}`
  try {
    const info = await stat(absolute)
    if (!info.isFile()) return { path: relPath, binary: true, truncated: false, text: null }
    if (info.size > MAX_UNTRACKED_BYTES) return { path: relPath, binary: true, truncated: true, text: null }
    const handle = await open(absolute, 'r')
    try {
      const length = Math.min(info.size, BINARY_SNIFF_BYTES)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, 0)
      const binary = buffer.includes(0)
      if (binary) return { path: relPath, binary: true, truncated: false, text: null }
      const text = info.size > BINARY_SNIFF_BYTES ? (await handle.readFile('utf8')) : buffer.toString('utf8')
      return { path: relPath, binary: false, truncated: false, text }
    } finally {
      await handle.close()
    }
  } catch {
    // Unreadable (permissions, races): present as an opaque binary entry.
    return { path: relPath, binary: true, truncated: false, text: null }
  }
}

/** `git status --porcelain -z` untracked entries (`?? <path>`). */
function parseUntrackedPaths(statusZ: string): string[] {
  const paths: string[] = []
  for (const entry of statusZ.split('\0')) {
    if (entry.startsWith('?? ')) paths.push(entry.slice(3))
  }
  return paths
}

function synthesizeAddedEntry(file: UntrackedFile): ReviewFileEntry {
  if (file.binary || file.text === null) {
    return { path: file.path, oldPath: null, status: 'added', binary: true, additions: 0, deletions: 0, hunks: [], untracked: true }
  }
  const lines = file.text.split('\n')
  // A trailing newline yields a final empty segment; it is not a content line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const rows = lines.map((text, index) => ({ kind: 'add' as const, newLine: index + 1, text }))
  return {
    path: file.path,
    oldPath: null,
    status: 'added',
    binary: false,
    additions: lines.length,
    deletions: 0,
    hunks: [
      {
        header: `@@ -0,0 +1,${lines.length} @@`,
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        rows
      }
    ],
    untracked: true
  }
}

/** Collect the workspace-vs-HEAD review snapshot for `cwd`. */
export async function collectReview(cwd: string): Promise<ReviewResult> {
  try {
    // Validates the repo first so folder/git problems map to typed reasons.
    await runGit(cwd, ['rev-parse', '--show-toplevel'])

    // A repository without any commits has no HEAD; everything on disk is
    // then reported through the untracked-file path below.
    const head = await runGit(cwd, ['rev-parse', 'HEAD']).catch(() => null)

    const [diffText, branchOut, statusZ] = await Promise.all([
      head === null
        ? Promise.resolve('')
        : runGit(cwd, ['diff', 'HEAD', '--no-color', '--no-ext-diff', '--find-renames']),
      runGit(cwd, ['symbolic-ref', '--short', 'HEAD']).catch(() => null),
      runGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'])
    ])

    const files: ReviewFileEntry[] = parseGitDiff(diffText).map((patch) => {
      const { additions, deletions } = rowStat(patch)
      return { ...patch, additions, deletions, untracked: false }
    })

    const untrackedPaths = parseUntrackedPaths(statusZ)
    const untracked = await Promise.all(untrackedPaths.map((p) => readUntrackedFile(cwd, p)))
    files.push(...untracked.map(synthesizeAddedEntry))

    return {
      ok: true,
      snapshot: {
        cwd,
        head: head !== null ? head.trim() : null,
        branch: branchOut !== null ? branchOut.trim() : null,
        files
      }
    }
  } catch (error) {
    if (error instanceof GitFailure) {
      return { ok: false, reason: error.reason, message: error.message }
    }
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}
