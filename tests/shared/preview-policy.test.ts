import { describe, expect, it } from 'vitest'
import {
  PREVIEW_LISTING_MAX_ENTRIES,
  PREVIEW_MARKDOWN_MAX_BYTES,
  PREVIEW_MAX_BYTES,
  PREVIEW_SOURCE_MAX_LINES,
  PREVIEW_SOURCE_WINDOW_LINES,
  displayModeFor,
  isMarkdownName,
  kindForEntry,
  previewCrumbs,
  resolvePreviewPath
} from '../../src/shared/preview/policy'
import type { PreviewFileEntry } from '../../src/shared/preview/types'

describe('policy constants — the large-file strategy is explicit', () => {
  it('reads at most 2 MB, parses markdown at most 256 KB, windows source lines', () => {
    expect(PREVIEW_MAX_BYTES).toBe(2_000_000)
    expect(PREVIEW_MARKDOWN_MAX_BYTES).toBeLessThan(PREVIEW_MAX_BYTES)
    expect(PREVIEW_SOURCE_WINDOW_LINES).toBeGreaterThan(0)
    expect(PREVIEW_SOURCE_MAX_LINES).toBeGreaterThan(PREVIEW_SOURCE_WINDOW_LINES)
    expect(PREVIEW_LISTING_MAX_ENTRIES).toBeGreaterThan(0)
  })
})

describe('resolvePreviewPath', () => {
  const cwd = '/Users/ada/work/proj'

  it('keeps absolute paths and normalizes dot segments', () => {
    expect(resolvePreviewPath(cwd, '/Users/ada/work/proj/src/a.ts')).toBe('/Users/ada/work/proj/src/a.ts')
    expect(resolvePreviewPath(cwd, '/Users/ada/work/proj/src/../README.md')).toBe('/Users/ada/work/proj/README.md')
  })

  it('joins relative paths against the workspace root', () => {
    expect(resolvePreviewPath(cwd, 'src/a.ts')).toBe('/Users/ada/work/proj/src/a.ts')
    expect(resolvePreviewPath(cwd, './src/a.ts')).toBe('/Users/ada/work/proj/src/a.ts')
    expect(resolvePreviewPath(cwd, '../sibling/b.md')).toBe('/Users/ada/work/sibling/b.md')
  })

  it('collapses duplicate slashes and strips trailing slashes', () => {
    expect(resolvePreviewPath(cwd, 'src//deep///x.json')).toBe('/Users/ada/work/proj/src/deep/x.json')
    expect(resolvePreviewPath(cwd, 'src/')).toBe('/Users/ada/work/proj/src')
  })

  it('returns null for empty or whitespace-only input', () => {
    expect(resolvePreviewPath(cwd, '')).toBeNull()
    expect(resolvePreviewPath(cwd, '   ')).toBeNull()
  })
})

describe('isMarkdownName / kindForEntry', () => {
  it('treats .md and .markdown as markdown, case-insensitive', () => {
    expect(isMarkdownName('README.md')).toBe(true)
    expect(isMarkdownName('guide.MARKDOWN')).toBe(true)
    expect(isMarkdownName('notes.txt')).toBe(false)
    expect(isMarkdownName('sans-extension')).toBe(false)
  })

  it('kinds files: markdown by extension, source otherwise, binary when text is null', () => {
    expect(kindForEntry('README.md', '# hi')).toBe('markdown')
    expect(kindForEntry('main.ts', 'const x = 1')).toBe('source')
    expect(kindForEntry('logo.png', null)).toBe('binary')
  })
})

describe('displayModeFor — oversized markdown falls back to source rendering', () => {
  function file(overrides: Partial<PreviewFileEntry>): PreviewFileEntry {
    return {
      absolutePath: '/proj/README.md',
      cwd: '/proj',
      relativePath: 'README.md',
      name: 'README.md',
      kind: 'markdown',
      sizeBytes: 10,
      totalLines: 1,
      text: '# hi',
      ...overrides
    }
  }

  it('renders markdown files as markdown below the parse cap', () => {
    expect(displayModeFor(file({}))).toBe('markdown')
    expect(displayModeFor(file({ sizeBytes: PREVIEW_MARKDOWN_MAX_BYTES }))).toBe('markdown')
  })

  it('renders markdown files above the parse cap as plain source', () => {
    expect(displayModeFor(file({ sizeBytes: PREVIEW_MARKDOWN_MAX_BYTES + 1 }))).toBe('source')
  })

  it('never renders source-kind files as markdown', () => {
    expect(displayModeFor(file({ kind: 'source', name: 'a.ts' }))).toBe('source')
  })
})

describe('previewCrumbs — breadcrumb path navigation', () => {
  it('starts at the workspace root and descends through directories to the file', () => {
    const crumbs = previewCrumbs('/work/proj', '/work/proj/docs/guide.md', true)
    expect(crumbs).toEqual([
      { name: 'proj', path: '/work/proj', type: 'dir' },
      { name: 'docs', path: '/work/proj/docs', type: 'dir' },
      { name: 'guide.md', path: '/work/proj/docs/guide.md', type: 'file' }
    ])
  })

  it('ends with a dir crumb when navigating a directory', () => {
    const crumbs = previewCrumbs('/work/proj', '/work/proj/docs', false)
    expect(crumbs).toEqual([
      { name: 'proj', path: '/work/proj', type: 'dir' },
      { name: 'docs', path: '/work/proj/docs', type: 'dir' }
    ])
  })

  it('is just the workspace root for the root itself', () => {
    expect(previewCrumbs('/work/proj', '/work/proj', false)).toEqual([
      { name: 'proj', path: '/work/proj', type: 'dir' }
    ])
  })

  it('falls back to absolute segments when the path is outside the workspace', () => {
    const crumbs = previewCrumbs('/work/proj', '/etc/hosts', true)
    expect(crumbs).toEqual([
      { name: '/', path: '/', type: 'dir' },
      { name: 'etc', path: '/etc', type: 'dir' },
      { name: 'hosts', path: '/etc/hosts', type: 'file' }
    ])
  })
})
