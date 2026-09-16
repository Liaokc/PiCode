import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listMentionCandidates, listRelativeFiles, shouldSkipDir } from '../../src/host/files'

/** A plain (non-repo) workspace — its `.git` is a decoy directory with junk
 * contents, so `git ls-files` cannot answer and the walk fallback runs. */
const ROOT = join(tmpdir(), 'picode-files-test')

/** A real git repository exercising the ticket-71 candidate path: tracked
 * (cached) + untracked (others) files, a gitignored subtree, and a nested
 * worktree — the "does not explode" scenarios from the acceptance list. */
const REPO_ROOT = join(tmpdir(), 'picode-files-repo')

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  rmSync(REPO_ROOT, { recursive: true, force: true })
  mkdirSync(join(ROOT, 'src/server'), { recursive: true })
  mkdirSync(join(ROOT, 'node_modules/pkg'), { recursive: true })
  mkdirSync(join(ROOT, '.git/objects'), { recursive: true })
  mkdirSync(join(ROOT, 'docs/deep/deeper'), { recursive: true })
  writeFileSync(join(ROOT, 'README.md'), 'x')
  writeFileSync(join(ROOT, 'src/server/index.ts'), 'x')
  writeFileSync(join(ROOT, 'src/server/routes.ts'), 'x')
  writeFileSync(join(ROOT, 'node_modules/pkg/index.js'), 'x')
  writeFileSync(join(ROOT, '.git/config'), 'x')
  writeFileSync(join(ROOT, 'docs/guide.md'), 'x')
  writeFileSync(join(ROOT, 'docs/deep/deeper/a.md'), 'x')

  // ---- the git repo fixture ----
  const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO_ROOT, stdio: 'ignore' })
  mkdirSync(join(REPO_ROOT, 'src'), { recursive: true })
  mkdirSync(join(REPO_ROOT, 'ignored-dir'), { recursive: true })
  writeFileSync(join(REPO_ROOT, '.gitignore'), 'ignored-dir/\n')
  writeFileSync(join(REPO_ROOT, 'beta.txt'), 'tracked candidate')
  writeFileSync(join(REPO_ROOT, 'src/index.ts'), 'tracked deep')
  writeFileSync(join(REPO_ROOT, 'alpha.txt'), 'untracked candidate')
  writeFileSync(join(REPO_ROOT, 'ignored-dir/buried.txt'), 'gitignored')
  git('init', '-b', 'picode-ticket-71')
  git('config', 'user.email', 'smoke@picode.local')
  git('config', 'user.name', 'Picode Smoke')
  git('add', 'beta.txt', 'src/index.ts', '.gitignore') // cached without a commit
  git('commit', '-m', 'root', '--allow-empty')
})

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  rmSync(REPO_ROOT, { recursive: true, force: true })
})

describe('file listing for @-mention completion', () => {
  it('skips dependency/VCS/build directories everywhere in the tree', () => {
    for (const name of ['node_modules', '.git', 'dist', 'out', 'build', 'coverage', '__pycache__', '.worktrees']) {
      expect(shouldSkipDir(name)).toBe(true)
    }
    expect(shouldSkipDir('src')).toBe(false)
    expect(shouldSkipDir('docs')).toBe(false)
  })

  it('lists relative paths with forward slashes, skipping ignored dirs', async () => {
    const { files } = await listRelativeFiles(ROOT)
    expect(files).toContain('README.md')
    expect(files).toContain('src/server/index.ts')
    expect(files).toContain('docs/deep/deeper/a.md')
    expect(files.some((f) => f.includes('node_modules'))).toBe(false)
    expect(files.some((f) => f.startsWith('.git'))).toBe(false)
    expect(files.every((f) => !f.includes('\\'))).toBe(true)
  })

  it('respects the depth cap (docs/deep/deeper survives, deeper would not)', async () => {
    const { files } = await listRelativeFiles(ROOT, { maxDepth: 1 })
    expect(files).toContain('README.md')
    expect(files).toContain(join('docs', 'guide.md'))
    expect(files.some((f) => f.includes('deeper'))).toBe(false)
  })

  it('caps the number of entries and flags the truncation (ticket 71)', async () => {
    const { files, truncated } = await listRelativeFiles(ROOT, { limit: 3 })
    expect(files).toHaveLength(3)
    expect(truncated).toBe(true)
  })

  it('a walk that exhausts the tree naturally is not flagged truncated', async () => {
    const { files, truncated } = await listRelativeFiles(ROOT)
    expect(files).toHaveLength(5)
    expect(truncated).toBe(false)
  })
})

describe('listMentionCandidates (ticket 71: git ls-files in a repo, walk otherwise)', () => {
  it('answers from git in a repo: tracked + untracked, gitignored excluded', async () => {
    const { files, truncated } = await listMentionCandidates(REPO_ROOT)
    expect(files).toContain('beta.txt') // cached (staged)
    expect(files).toContain('alpha.txt') // others (untracked)
    expect(files).toContain('src/index.ts')
    expect(files).toContain('.gitignore')
    expect(files).not.toContain('ignored-dir/buried.txt') // exclude-standard
    expect(files.every((f) => !f.includes('\\'))).toBe(true)
    expect(files.every((f) => !f.includes('\0'))).toBe(true)
    // The git answer is full — the truncation marker never rides it.
    expect(truncated).toBe(false)
  })

  it('never writes while listing (the zero-write red line): index bytes unchanged', async () => {
    const indexPath = join(REPO_ROOT, '.git', 'index')
    const before = readFileSync(indexPath)
    await listMentionCandidates(REPO_ROOT)
    expect(readFileSync(indexPath).equals(before)).toBe(true)
  })

  it('paths are relative to the session cwd, even inside a work tree subdirectory', async () => {
    const { files } = await listMentionCandidates(join(REPO_ROOT, 'src'))
    expect(files).toContain('index.ts')
    expect(files.some((f) => f.startsWith('src/'))).toBe(false)
  })

  it('survives a linked worktree (acceptance: worktree must not explode)', async () => {
    execFileSync('git', ['worktree', 'add', 'linked-wt'], { cwd: REPO_ROOT, stdio: 'ignore' })
    try {
      const { files, truncated } = await listMentionCandidates(join(REPO_ROOT, 'linked-wt'))
      expect(files).toContain('beta.txt')
      expect(truncated).toBe(false)
    } finally {
      execFileSync('git', ['worktree', 'remove', 'linked-wt'], { cwd: REPO_ROOT, stdio: 'ignore' })
    }
  })

  it('falls back to the capped walk outside a repo (decoy .git cannot answer)', async () => {
    const { files, truncated } = await listMentionCandidates(ROOT)
    expect(files).toContain('README.md')
    expect(files.some((f) => f.includes('node_modules'))).toBe(false)
    expect(truncated).toBe(false)
  })
})
