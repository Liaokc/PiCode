import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listRelativeFiles, shouldSkipDir } from '../../src/host/files'

const ROOT = join(tmpdir(), 'picode-files-test')

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
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
})

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
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
    const files = await listRelativeFiles(ROOT)
    expect(files).toContain('README.md')
    expect(files).toContain('src/server/index.ts')
    expect(files).toContain('docs/deep/deeper/a.md')
    expect(files.some((f) => f.includes('node_modules'))).toBe(false)
    expect(files.some((f) => f.startsWith('.git'))).toBe(false)
    expect(files.every((f) => !f.includes('\\'))).toBe(true)
  })

  it('respects the depth cap (docs/deep/deeper survives, deeper would not)', async () => {
    const files = await listRelativeFiles(ROOT, { maxDepth: 1 })
    expect(files).toContain('README.md')
    expect(files).toContain(join('docs', 'guide.md'))
    expect(files.some((f) => f.includes('deeper'))).toBe(false)
  })

  it('caps the number of entries', async () => {
    const files = await listRelativeFiles(ROOT, { limit: 3 })
    expect(files).toHaveLength(3)
  })
})
