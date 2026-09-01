import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readGitBranch } from '../../src/host/git-branch'

/**
 * Behavior tests for the host's read-only branch readout (ticket 21): given
 * a real directory, `readGitBranch` reports what
 * `git rev-parse --abbrev-ref HEAD` would, degrading to null anywhere git
 * cannot answer (not a repo, missing directory, git missing).
 */

let root: string
let repo: string
let plain: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'picode-branch-test-'))
  repo = join(root, 'repo')
  plain = join(root, 'plain')
  mkdirSync(repo)
  mkdirSync(plain)
  // Deterministic branch name (not dependent on the machine's init.defaultBranch).
  execFileSync('git', ['init', '-b', 'picode-ticket-21'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'smoke@picode.local'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'Picode Smoke'], { cwd: repo })
  // A branch is only resolvable once HEAD points at a commit history that
  // exists — unborn HEAD still names the branch with --abbrev-ref, verified
  // below against a repo WITH a commit too.
  execFileSync('git', ['commit', '--allow-empty', '-m', 'root'], { cwd: repo })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readGitBranch (ticket 21: host read-only branch readout)', () => {
  it('returns the current branch name of a git repository', async () => {
    expect(await readGitBranch(repo)).toBe('picode-ticket-21')
  })

  it('follows branch switches — still only reading', async () => {
    execFileSync('git', ['switch', '-c', 'feature-side'], { cwd: repo })
    expect(await readGitBranch(repo)).toBe('feature-side')
    execFileSync('git', ['switch', 'picode-ticket-21'], { cwd: repo })
    expect(await readGitBranch(repo)).toBe('picode-ticket-21')
  })

  it('degrades to null for a directory that is not a git repo', async () => {
    expect(await readGitBranch(plain)).toBeNull()
  })

  it('degrades to null for a repo with no commits (unborn HEAD fails rev-parse)', async () => {
    const fresh = join(root, 'fresh')
    mkdirSync(fresh)
    execFileSync('git', ['init', '-b', 'unborn'], { cwd: fresh })
    expect(await readGitBranch(fresh)).toBeNull()
  })

  it('degrades to null for a missing directory', async () => {
    expect(await readGitBranch(join(root, 'does-not-exist'))).toBeNull()
  })
})
