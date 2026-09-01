/**
 * Host-side read-only branch readout (ticket 21): runs
 * `git rev-parse --abbrev-ref HEAD` against the session cwd and reports the
 * branch name. Strictly a READ — no checkout, no ref writes (grilling R2-Q8:
 * Pi sessions don't bind a branch; the badge is display-only).
 *
 * Any failure degrades to null: not a git repo, git missing, unreadable
 * directory — the UI hides the badge instead of surfacing an error.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

/** Output of `git rev-parse --abbrev-ref HEAD` for the current branch, or
 * null when git cannot answer (non-repo, no git binary, bad cwd). */
export async function readGitBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 5_000 })
    const branch = stdout.trim()
    return branch === '' ? null : branch
  } catch {
    return null
  }
}
