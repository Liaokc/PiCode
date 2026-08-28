import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectReview } from '../../src/main/review/collect'

/**
 * The collector runs real git against throwaway repositories so the Review
 * tab's snapshot is pinned to actual `git diff HEAD` semantics (ticket 06:
 * "差异内容与终端 git diff 输出语义一致").
 */

let repoRoot: string
let plainDir: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8'
  })
}

function write(relative: string, content: string): void {
  const target = path.join(repoRoot, relative)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
}

beforeAll(() => {
  repoRoot = mkdtempSync(path.join(os.tmpdir(), 'picode-review-'))
  plainDir = mkdtempSync(path.join(os.tmpdir(), 'picode-plain-'))
  git(repoRoot, 'init', '-b', 'main')
  write('app.ts', 'const a = 1\nconst b = 2\nconst c = 3\n')
  write('keep.txt', 'unchanged\n')
  write('gone.txt', 'delete me\n')
  write('old-name.txt', 'rename me\n')
  git(repoRoot, 'add', '.')
  git(repoRoot, 'commit', '-m', 'base')
  // Workspace mutations vs HEAD:
  write('app.ts', 'const a = 1\nconst b = 22\nconst c = 3\nconst d = 4\n')
  write('new-file.ts', 'export const fresh = true\n')
  rmSync(path.join(repoRoot, 'gone.txt'))
  write('untracked.txt', 'line one\nline two\n')
  git(repoRoot, 'add', 'new-file.ts')
  git(repoRoot, 'mv', 'old-name.txt', 'new-name.txt')
  writeFileSync(path.join(repoRoot, 'logo.bin'), Buffer.from([0x89, 0x00, 0x50, 0x4e, 0x47, 0x00]))
})

afterAll(() => {
  rmSync(repoRoot, { recursive: true, force: true })
  rmSync(plainDir, { recursive: true, force: true })
})

describe('collectReview', () => {
  it('reports a full workspace-vs-HEAD snapshot: modify, add, delete, rename, binary, untracked', async () => {
    const result = await collectReview(repoRoot)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}: ${result.message}`)

    const { snapshot } = result
    expect(snapshot.cwd).toBe(repoRoot)
    expect(snapshot.head).toMatch(/^[0-9a-f]{40}$/)
    expect(snapshot.branch).toBe('main')

    const byPath = new Map(snapshot.files.map((f) => [f.path, f]))

    const modified = byPath.get('app.ts')
    expect(modified?.status).toBe('modified')
    expect(modified?.additions).toBe(2)
    expect(modified?.deletions).toBe(1)
    expect(modified?.hunks[0]?.rows.some((r) => r.kind === 'add' && r.text === 'const d = 4')).toBe(true)

    const added = byPath.get('new-file.ts')
    expect(added?.status).toBe('added')
    expect(added?.additions).toBe(1)
    expect(added?.untracked).toBe(false)

    expect(byPath.get('gone.txt')?.status).toBe('deleted')
    expect(byPath.get('gone.txt')?.deletions).toBe(1)

    const renamed = byPath.get('new-name.txt')
    expect(renamed?.status).toBe('renamed')
    expect(renamed?.oldPath).toBe('old-name.txt')
    expect(renamed?.additions).toBe(0)
    expect(renamed?.deletions).toBe(0)

    expect(byPath.get('logo.bin')?.binary).toBe(true)

    const untracked = byPath.get('untracked.txt')
    expect(untracked?.status).toBe('added')
    expect(untracked?.untracked).toBe(true)
    expect(untracked?.additions).toBe(2)
    expect(untracked?.hunks[0]?.rows.map((r) => (r.kind === 'add' ? r.text : ''))).toEqual(['line one', 'line two'])

    // Unchanged files never appear.
    expect(byPath.has('keep.txt')).toBe(false)
  })

  it('produces per-file patches whose reconstruction matches git diff semantics', async () => {
    const result = await collectReview(repoRoot)
    if (!result.ok) throw new Error(String(result))
    const app = result.snapshot.files.find((f) => f.path === 'app.ts')
    if (!app) throw new Error('app.ts missing')
    // Row kinds follow the unified patch exactly as git emits it.
    const kinds = app.hunks.flatMap((h) => h.rows.map((r) => r.kind))
    expect(kinds).toEqual(['context', 'del', 'add', 'context', 'add'])
  })

  it('explains folders that are not git repositories', async () => {
    const result = await collectReview(plainDir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-a-git-repo')
  })

  it('handles a repository with no commits: untracked files only, null HEAD', async () => {
    const fresh = mkdtempSync(path.join(os.tmpdir(), 'picode-fresh-'))
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: fresh })
      writeFileSync(path.join(fresh, 'only.txt'), 'hello\n')
      const result = await collectReview(fresh)
      if (!result.ok) throw new Error(String(result))
      expect(result.snapshot.head).toBeNull()
      expect(result.snapshot.files).toHaveLength(1)
      expect(result.snapshot.files[0]).toMatchObject({ path: 'only.txt', status: 'added', untracked: true, additions: 1 })
    } finally {
      rmSync(fresh, { recursive: true, force: true })
    }
  })

  it('returns a clean empty snapshot when the workspace matches HEAD', async () => {
    const clean = mkdtempSync(path.join(os.tmpdir(), 'picode-clean-'))
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: clean })
      execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'root'], { cwd: clean })
      const result = await collectReview(clean)
      if (!result.ok) throw new Error(String(result))
      expect(result.snapshot.files).toEqual([])
      expect(result.snapshot.head).toMatch(/^[0-9a-f]{40}$/)
    } finally {
      rmSync(clean, { recursive: true, force: true })
    }
  })

  it('lists an untracked binary file as binary without synthesized patch rows', async () => {
    writeFileSync(path.join(repoRoot, 'staged-artifact.bin'), Buffer.from([0x00, 0x01, 0x02]))
    try {
      const result = await collectReview(repoRoot)
      if (!result.ok) throw new Error(String(result))
      const file = result.snapshot.files.find((f) => f.path === 'staged-artifact.bin')
      expect(file?.binary).toBe(true)
      expect(file?.hunks).toEqual([])
    } finally {
      rmSync(path.join(repoRoot, 'staged-artifact.bin'), { force: true })
    }
  })
})
