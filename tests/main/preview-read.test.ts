import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PREVIEW_LISTING_MAX_ENTRIES, PREVIEW_MAX_BYTES } from '../../src/shared/preview/policy'
import { readPreview } from '../../src/main/preview/read'

/**
 * The preview reader runs against real files in throwaway directories so the
 * File Preview tab's IPC seam is pinned to actual fs semantics (ticket 07).
 */

let root: string

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'picode-preview-'))
  mkdirSync(path.join(root, 'docs/nested'), { recursive: true })
  mkdirSync(path.join(root, 'z-dir'))
  writeFileSync(path.join(root, 'README.md'), '# Title\n\nSome **bold** text.\n')
  writeFileSync(path.join(root, 'app.ts'), 'const a = 1\nconst b = 2\n')
  writeFileSync(path.join(root, 'logo.bin'), Buffer.from([0x89, 0x00, 0x50, 0x4e, 0x47, 0x00]))
  writeFileSync(path.join(root, 'docs/guide.md'), '## Guide\n')
  writeFileSync(path.join(root, 'docs/notes.txt'), 'plain notes\n')
  writeFileSync(path.join(root, 'docs/nested/deep.ts'), 'export const deep = 1\n')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readPreview — files', () => {
  it('reads a markdown file with kind, sizes and line count', async () => {
    const result = await readPreview(root, 'README.md')
    if (!result.ok || result.kind !== 'file') throw new Error(`expected file, got ${JSON.stringify(result)}`)
    expect(result.file.name).toBe('README.md')
    expect(result.file.kind).toBe('markdown')
    expect(result.file.absolutePath).toBe(path.join(root, 'README.md'))
    expect(result.file.relativePath).toBe('README.md')
    expect(result.file.totalLines).toBe(3)
    expect(result.file.sizeBytes).toBe('# Title\n\nSome **bold** text.\n'.length)
    expect(result.file.text).toContain('bold')
  })

  it('kinds non-markdown text files as source', async () => {
    const result = await readPreview(root, 'app.ts')
    if (!result.ok || result.kind !== 'file') throw new Error('expected file')
    expect(result.file.kind).toBe('source')
  })

  it('detects binary content and ships no text', async () => {
    const result = await readPreview(root, 'logo.bin')
    if (!result.ok || result.kind !== 'file') throw new Error('expected file')
    expect(result.file.kind).toBe('binary')
    expect(result.file.text).toBeNull()
  })

  it('accepts absolute paths and rejects missing ones with a typed reason', async () => {
    const absolute = await readPreview(root, path.join(root, 'app.ts'))
    expect(absolute.ok).toBe(true)

    const missing = await readPreview(root, 'nope/missing.ts')
    if (missing.ok) throw new Error('expected failure')
    expect(missing.reason).toBe('not-found')
  })

  it('refuses files above the read cap with a too-large failure', async () => {
    const big = path.join(root, 'big.log')
    const chunk = 'x'.repeat(1024)
    const pieces: string[] = []
    for (let i = 0; i < Math.ceil((PREVIEW_MAX_BYTES + 1024) / 1024); i++) pieces.push(chunk)
    writeFileSync(big, pieces.join(''))
    const result = await readPreview(root, 'big.log')
    if (result.ok) throw new Error('expected too-large failure')
    expect(result.reason).toBe('too-large')
  })
})

describe('readPreview — directories (breadcrumb fallback)', () => {
  it('lists directories first, then files, alphabetical, with sizes', async () => {
    const result = await readPreview(root, '.')
    if (!result.ok || result.kind !== 'directory') throw new Error(`expected directory, got ${JSON.stringify(result)}`)
    expect(result.listing.absolutePath).toBe(root)
    expect(result.listing.relativePath).toBe('.')
    const names = result.listing.entries.map((entry) => entry.name)
    expect(names.indexOf('docs')).toBeLessThan(names.indexOf('app.ts'))
    expect(names.indexOf('z-dir')).toBeLessThan(names.indexOf('app.ts'))
    const app = result.listing.entries.find((entry) => entry.name === 'app.ts')
    expect(app?.type).toBe('file')
    expect(app?.sizeBytes).toBeGreaterThan(0)
  })

  it('navigates subdirectories and reports their files', async () => {
    const result = await readPreview(root, 'docs')
    if (!result.ok || result.kind !== 'directory') throw new Error('expected directory')
    expect(result.listing.entries.map((entry) => entry.name)).toEqual(['nested', 'guide.md', 'notes.txt'])
  })

  it('caps the listing and flags the truncation', async () => {
    const bigDir = path.join(root, 'flood')
    mkdirSync(bigDir)
    for (let i = 0; i < PREVIEW_LISTING_MAX_ENTRIES + 10; i++) {
      writeFileSync(path.join(bigDir, `f${String(i).padStart(4, '0')}.txt`), 'x')
    }
    const result = await readPreview(root, 'flood')
    if (!result.ok || result.kind !== 'directory') throw new Error('expected directory')
    expect(result.listing.entries.length).toBe(PREVIEW_LISTING_MAX_ENTRIES)
    expect(result.listing.truncated).toBe(true)
  })

  it('fails with not-found for missing directories too', async () => {
    const result = await readPreview(root, 'missing-dir')
    if (result.ok) throw new Error('expected failure')
    expect(result.reason).toBe('not-found')
  })
})
