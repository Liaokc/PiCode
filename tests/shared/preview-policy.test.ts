import { describe, expect, it } from 'vitest'
import {
  PREVIEW_LISTING_MAX_ENTRIES,
  PREVIEW_MARKDOWN_MAX_BYTES,
  PREVIEW_MAX_BYTES,
  PREVIEW_SERVE_SCHEME,
  PREVIEW_SOURCE_MAX_LINES,
  PREVIEW_SOURCE_WINDOW_LINES,
  displayModeFor,
  hasRenderedView,
  isHtmlName,
  isImageName,
  isMarkdownName,
  isSvgName,
  kindForEntry,
  mimeForName,
  previewCrumbs,
  previewFileUrl,
  resolvePreviewPath,
  svgDataUrl
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

describe('isMarkdownName', () => {
  it('treats .md and .markdown as markdown, case-insensitive', () => {
    expect(isMarkdownName('README.md')).toBe(true)
    expect(isMarkdownName('guide.MARKDOWN')).toBe(true)
    expect(isMarkdownName('notes.txt')).toBe(false)
    expect(isMarkdownName('sans-extension')).toBe(false)
  })

  it('kinds files: markdown by extension, source otherwise, binary when text is null', () => {
    expect(kindForEntry('README.md', '# hi')).toBe('markdown')
    expect(kindForEntry('main.ts', 'const x = 1')).toBe('source')
    expect(kindForEntry('logo.bin', null)).toBe('binary')
  })
})

describe('ticket 88 classifiers — svg / html / image by extension', () => {
  it('isSvgName matches .svg case-insensitively only', () => {
    const cases: Array<[string, boolean]> = [
      ['diagram.svg', true],
      ['DIAGRAM.SVG', true],
      ['diagram.svgz', false],
      ['svg', false],
      ['diagram.svg.txt', false],
      ['no-extension', false]
    ]
    for (const [name, expected] of cases) expect(isSvgName(name), name).toBe(expected)
  })

  it('isHtmlName matches .html and .htm case-insensitively only', () => {
    const cases: Array<[string, boolean]> = [
      ['report.html', true],
      ['REPORT.HTM', true],
      ['report.html.bak', false],
      ['html', false],
      ['no-extension', false]
    ]
    for (const [name, expected] of cases) expect(isHtmlName(name), name).toBe(expected)
  })

  it('isImageName matches the common web images, case-insensitively', () => {
    const cases: Array<[string, boolean]> = [
      ['photo.png', true],
      ['photo.PNG', true],
      ['photo.jpg', true],
      ['photo.jpeg', true],
      ['anim.gif', true],
      ['cover.webp', true],
      ['photo.tif', false],
      ['photo.bmp', false],
      ['photo.png.txt', false],
      ['no-extension', false]
    ]
    for (const [name, expected] of cases) expect(isImageName(name), name).toBe(expected)
  })

  it('kindForEntry table — extension + existing sniff decide the kind (ticket 88)', () => {
    const cases: Array<[string, string | null, PreviewFileEntry['kind']]> = [
      ['diagram.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'svg'],
      ['report.html', '<!doctype html><p>hi</p>', 'html'],
      ['report.htm', '<p>hi</p>', 'html'],
      ['photo.png', null, 'image'],
      ['photo.jpg', null, 'image'],
      ['photo.jpeg', null, 'image'],
      ['anim.gif', null, 'image'],
      ['cover.webp', null, 'image'],
      // Declared images stay images even when the sniff saw no NUL byte —
      // the extension wins so a text-only .png never renders as code.
      ['photo.png', 'plain bytes', 'image'],
      // The sniff still guards the text formats: a NUL-corrupted svg/html
      // is binary and never reaches the renderer paths.
      ['diagram.svg', null, 'binary'],
      ['report.html', null, 'binary'],
      // Pre-ticket kinds unchanged.
      ['README.md', '# hi', 'markdown'],
      ['main.ts', 'const a = 1', 'source'],
      ['logo.bin', null, 'binary']
    ]
    for (const [name, text, expected] of cases) expect(kindForEntry(name, text), name).toBe(expected)
  })
})

describe('hasRenderedView — which kinds carry the Rendered/Source control', () => {
  it('is true exactly for markdown, svg and html (image is single-state)', () => {
    const cases: Array<[PreviewFileEntry['kind'], boolean]> = [
      ['markdown', true],
      ['svg', true],
      ['html', true],
      ['image', false],
      ['source', false],
      ['binary', false]
    ]
    for (const [kind, expected] of cases) expect(hasRenderedView(kind), kind).toBe(expected)
  })
})

describe('displayModeFor — ticket 88 extends the markdown size-cap semantics', () => {
  function file(overrides: Partial<PreviewFileEntry>): PreviewFileEntry {
    return {
      absolutePath: '/proj/d.svg',
      cwd: '/proj',
      relativePath: 'd.svg',
      name: 'd.svg',
      kind: 'svg',
      sizeBytes: 10,
      totalLines: 1,
      text: '<svg/>',
      ...overrides
    }
  }

  // The markdown fallback cases live in the block above (ticket 07) — only
  // the ticket-88 kinds are re-tested here.
  it('renders svg/html below the cap in their own rendered mode', () => {
    expect(displayModeFor(file({}))).toBe('svg')
    expect(displayModeFor(file({ sizeBytes: PREVIEW_MARKDOWN_MAX_BYTES }))).toBe('svg')
    expect(displayModeFor(file({ kind: 'html', name: 'r.html', relativePath: 'r.html', text: '<p>x</p>' }))).toBe('html')
    expect(
      displayModeFor(file({ kind: 'html', name: 'r.html', relativePath: 'r.html', text: '<p>x</p>', sizeBytes: PREVIEW_MARKDOWN_MAX_BYTES }))
    ).toBe('html')
  })

  it('falls back to source for oversized svg/html (markdown cap semantics reused)', () => {
    expect(displayModeFor(file({ sizeBytes: PREVIEW_MARKDOWN_MAX_BYTES + 1 }))).toBe('source')
    expect(displayModeFor(file({ kind: 'html', name: 'r.html', relativePath: 'r.html', text: '<p>x</p>', sizeBytes: PREVIEW_MARKDOWN_MAX_BYTES + 1 }))).toBe(
      'source'
    )
  })

  it('images always present in their single rendered mode, whatever the size', () => {
    expect(displayModeFor(file({ kind: 'image', name: 'p.png', relativePath: 'p.png', text: null, dataUrl: 'data:image/png;base64,x' }))).toBe(
      'image'
    )
    expect(displayModeFor(file({ kind: 'image', name: 'p.png', relativePath: 'p.png', text: null, sizeBytes: PREVIEW_MAX_BYTES }))).toBe('image')
  })

  it('never renders source-kind files in a rendered mode', () => {
    expect(displayModeFor(file({ kind: 'source', name: 'a.ts', relativePath: 'a.ts', text: 'const a = 1' }))).toBe('source')
  })
})

describe('svgDataUrl — rendered-SVG data URL (img context never runs scripts)', () => {
  it('prefixes the image/svg+xml data URL with base64 utf-8 payload', () => {
    const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true)
    const decoded = Buffer.from(url.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
    expect(decoded).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>')
  })

  it('keeps non-ASCII content intact through the utf-8 round-trip', () => {
    const svg = '<svg><text>图示 ✓</text></svg>'
    const url = svgDataUrl(svg)
    const decoded = Buffer.from(url.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
    expect(decoded).toBe(svg)
  })
})

describe('previewFileUrl — the serve-scheme URL whose base is the file directory', () => {
  it('maps an absolute path onto the hierarchical serve URL', () => {
    expect(previewFileUrl('/proj/site/report.html')).toBe(`${PREVIEW_SERVE_SCHEME}://local/proj/site/report.html`)
    expect(PREVIEW_SERVE_SCHEME).toBe('preview-file')
  })

  it('encodes reserved characters per segment and round-trips through URL parsing', () => {
    const url = previewFileUrl('/proj/my site/re port(1).html')
    const parsed = new URL(url)
    expect(parsed.host).toBe('local')
    expect(decodeURIComponent(parsed.pathname)).toBe('/proj/my site/re port(1).html')
  })
})

describe('mimeForName — serve + data-url mime mapping', () => {
  it('maps the web formats, case-insensitively', () => {
    const cases: Array<[string, string]> = [
      ['a.png', 'image/png'],
      ['a.PNG', 'image/png'],
      ['a.jpg', 'image/jpeg'],
      ['a.jpeg', 'image/jpeg'],
      ['a.gif', 'image/gif'],
      ['a.webp', 'image/webp'],
      ['a.svg', 'image/svg+xml'],
      ['a.html', 'text/html; charset=utf-8'],
      ['a.htm', 'text/html; charset=utf-8'],
      ['a.css', 'text/css; charset=utf-8'],
      ['a.js', 'text/javascript; charset=utf-8'],
      ['a.json', 'application/json; charset=utf-8']
    ]
    for (const [name, expected] of cases) expect(mimeForName(name), name).toBe(expected)
  })

  it('falls back to octet-stream for unknown or extensionless names', () => {
    expect(mimeForName('a.weird')).toBe('application/octet-stream')
    expect(mimeForName('no-extension')).toBe('application/octet-stream')
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
