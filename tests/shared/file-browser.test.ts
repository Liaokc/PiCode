import { describe, expect, it } from 'vitest'
import {
  browserRows,
  fileBrowserReducer,
  fileIconKind,
  openBrowser,
  type FileBrowserAction
} from '../../src/shared/file-browser.ts'

const ROOT_ENTRIES = [
  { name: 'src', type: 'dir' as const },
  { name: '.git', type: 'dir' as const },
  { name: '.gitignore', type: 'file' as const },
  { name: 'README.md', type: 'file' as const }
]

function opened() {
  return openBrowser('/work/api-server', 'api-server')
}

/** One transition, asserting it did not close (only 'close' yields null). */
function step(state: ReturnType<typeof opened>, action: FileBrowserAction) {
  const next = fileBrowserReducer(state, action)
  if (next === null) throw new Error('browser closed unexpectedly')
  return next
}

function withRoot(state: ReturnType<typeof opened>) {
  return step(state, { type: 'children-loaded', path: '', entries: ROOT_ENTRIES })
}

describe('openBrowser', () => {
  it('opens at the root in loading state with no visible rows yet', () => {
    const state = opened()
    expect(state.cwd).toBe('/work/api-server')
    expect(state.project).toBe('api-server')
    expect(state.loading.has('')).toBe(true)
    expect(browserRows(state)).toEqual([])
  })
})

describe('children-loaded', () => {
  it('turns the root listing into depth-0 rows in the delivered order', () => {
    const rows = browserRows(withRoot(opened()))
    expect(rows.map((r) => r.node.name)).toEqual(['src', '.git', '.gitignore', 'README.md'])
    expect(rows.map((r) => r.node.path)).toEqual(['src', '.git', '.gitignore', 'README.md'])
    expect(rows.every((r) => r.depth === 0)).toBe(true)
    expect(rows.every((r) => !r.loading && !r.failed)).toBe(true)
  })

  it('mirrors the channel order instead of re-sorting (dirs-first contract)', () => {
    // The preview channel delivers dirs first, then files, alphabetical. The
    // tree is a projection, not a second sort authority.
    const state = step(opened(), {
      type: 'children-loaded',
      path: '',
      entries: [
        { name: 'zeta.ts', type: 'file' },
        { name: 'alpha', type: 'dir' }
      ]
    })
    expect(browserRows(state).map((r) => r.node.name)).toEqual(['zeta.ts', 'alpha'])
  })

  it('stores children per directory so lazy siblings never clobber each other', () => {
    let state = withRoot(opened())
    state = step(state, { type: 'toggle', path: 'src' })
    state = step(state, {
      type: 'children-loaded',
      path: 'src',
      entries: [{ name: 'index.ts', type: 'file' }]
    })
    state = step(state, { type: 'toggle', path: '.git' })
    state = step(state, {
      type: 'children-loaded',
      path: '.git',
      entries: [{ name: 'HEAD', type: 'file' }]
    })
    const paths = browserRows(state).map((r) => r.node.path)
    expect(paths).toEqual(['src', 'src/index.ts', '.git', '.git/HEAD', '.gitignore', 'README.md'])
  })

  it('nested children get slash paths and +1 depth per level', () => {
    let state = withRoot(opened())
    state = step(state, { type: 'toggle', path: 'src' })
    state = step(state, {
      type: 'children-loaded',
      path: 'src',
      entries: [{ name: 'host', type: 'dir' }]
    })
    state = step(state, { type: 'toggle', path: 'src/host' })
    state = step(state, {
      type: 'children-loaded',
      path: 'src/host',
      entries: [{ name: 'files.ts', type: 'file' }]
    })
    const rows = browserRows(state)
    expect(rows.map((r) => [r.node.path, r.depth])).toEqual([
      ['src', 0],
      ['src/host', 1],
      ['src/host/files.ts', 2],
      ['.git', 0],
      ['.gitignore', 0],
      ['README.md', 0]
    ])
  })
})

describe('toggle (lazy expansion)', () => {
  it('expands a directory into loading state before its listing arrives', () => {
    const state = step(withRoot(opened()), { type: 'toggle', path: 'src' })
    const srcRow = browserRows(state).find((r) => r.node.path === 'src')
    expect(state.expanded.has('src')).toBe(true)
    expect(state.loading.has('src')).toBe(true)
    expect(srcRow?.loading).toBe(true)
  })

  it('reveals child rows once loaded and stops loading', () => {
    let state = step(withRoot(opened()), { type: 'toggle', path: 'src' })
    state = step(state, {
      type: 'children-loaded',
      path: 'src',
      entries: [
        { name: 'App.tsx', type: 'file' },
        { name: 'index.ts', type: 'file' }
      ]
    })
    expect(browserRows(state).map((r) => r.node.path)).toEqual([
      'src',
      'src/App.tsx',
      'src/index.ts',
      '.git',
      '.gitignore',
      'README.md'
    ])
    expect(state.loading.has('src')).toBe(false)
  })

  it('collapses instantly (children stay cached) and re-expands without reloading', () => {
    let state = step(withRoot(opened()), { type: 'toggle', path: 'src' })
    state = step(state, {
      type: 'children-loaded',
      path: 'src',
      entries: [{ name: 'index.ts', type: 'file' }]
    })
    state = step(state, { type: 'toggle', path: 'src' })
    expect(state.expanded.has('src')).toBe(false)
    expect(state.loading.has('src')).toBe(false)
    expect(browserRows(state).map((r) => r.node.path)).toEqual(['src', '.git', '.gitignore', 'README.md'])
    // Re-expand uses the cached children — no new loading round.
    state = step(state, { type: 'toggle', path: 'src' })
    expect(state.loading.has('src')).toBe(false)
    expect(browserRows(state).map((r) => r.node.path)).toContain('src/index.ts')
  })
})

describe('children-failed', () => {
  it('marks the failed directory row but keeps the rest of the tree', () => {
    let state = withRoot(opened())
    state = step(state, { type: 'toggle', path: 'src' })
    state = step(state, { type: 'children-failed', path: 'src' })
    const srcRow = browserRows(state).find((r) => r.node.path === 'src')
    expect(srcRow?.failed).toBe(true)
    expect(state.loading.has('src')).toBe(false)
    expect(browserRows(state).map((r) => r.node.name)).toContain('README.md')
  })

  it('retries on the next expand after a collapse', () => {
    let state = withRoot(opened())
    state = step(state, { type: 'toggle', path: 'src' })
    state = step(state, { type: 'children-failed', path: 'src' })
    state = step(state, { type: 'toggle', path: 'src' }) // collapse
    state = step(state, { type: 'toggle', path: 'src' }) // retry
    expect(state.loading.has('src')).toBe(true)
  })

  it('can fail at the root without breaking the state shape', () => {
    const state = step(opened(), { type: 'children-failed', path: '' })
    expect(state.failed.has('')).toBe(true)
    expect(browserRows(state)).toEqual([])
  })

  it('retry re-arms a failed listing (root recovery path)', () => {
    let state = step(opened(), { type: 'children-failed', path: '' })
    state = step(state, { type: 'retry', path: '' })
    expect(state.failed.has('')).toBe(false)
    expect(state.loading.has('')).toBe(true)
  })
})

describe('watch-invalidated (ticket 107: real-time refresh)', () => {
  /** Root loaded, then `src` expanded + loaded — loaded keys: '' and 'src'. */
  function deep() {
    let state = withRoot(opened())
    state = step(state, { type: 'toggle', path: 'src' })
    state = step(state, {
      type: 'children-loaded',
      path: 'src',
      entries: [{ name: 'index.ts', type: 'file' }]
    })
    return state
  }

  /** The invalidation table (ticket 107 acceptance: 核心失效逻辑表驱动):
   * each row is one watch event against the `deep()` tree — event payload in,
   * exactly the set of listings that must re-read out. */
  const TABLE: Array<{ name: string; dirs: string[]; overflow: boolean; expected: string[] }> = [
    {
      name: 'overflow event marks every loaded listing stale (cap-busting storm)',
      dirs: [],
      overflow: true,
      expected: ['', 'src']
    },
    {
      name: 'a changed subdirectory re-reads only its own listing',
      dirs: ['src'],
      overflow: false,
      expected: ['src']
    },
    {
      name: 'a top-level change re-reads the root listing',
      dirs: [''],
      overflow: false,
      expected: ['']
    },
    {
      name: 'several changed dirs invalidate exactly the loaded intersection',
      dirs: ['', 'src', 'node_modules', 'src/host'],
      overflow: false,
      expected: ['', 'src']
    },
    {
      name: 'dirs never loaded are ignored (lazy expand reads fresh anyway)',
      dirs: ['node_modules', 'dist'],
      overflow: false,
      expected: []
    }
  ]

  it.each(TABLE)('$name', ({ dirs, overflow, expected }) => {
    const state = step(deep(), { type: 'watch-invalidated', dirs, overflow })
    expect([...state.stale].sort()).toEqual([...expected].sort())
  })

  it('marks the loading root stale too — the in-flight fetch is guarded, not duplicated', () => {
    // openBrowser has the root placeholder in children while the first
    // listing is in flight; an event arriving then still records the intent.
    const state = step(opened(), { type: 'watch-invalidated', dirs: [''], overflow: false })
    expect(state.stale.has('')).toBe(true)
  })

  it('stale listings stay visible without a loading hint (silent refresh, no flicker)', () => {
    const state = step(deep(), { type: 'watch-invalidated', dirs: ['src'], overflow: false })
    const srcRow = browserRows(state).find((r) => r.node.path === 'src')
    expect(srcRow?.loading).toBe(false)
    expect(srcRow?.failed).toBe(false)
    expect(browserRows(state).map((r) => r.node.path)).toContain('src/index.ts')
  })

  it('children-loaded clears the refreshed path from stale', () => {
    let state = step(deep(), { type: 'watch-invalidated', dirs: ['src'], overflow: false })
    expect(state.stale.has('src')).toBe(true)
    state = step(state, {
      type: 'children-loaded',
      path: 'src',
      entries: [{ name: 'index.ts', type: 'file' }, { name: 'extra.ts', type: 'file' }]
    })
    expect(state.stale.has('src')).toBe(false)
    expect(browserRows(state).map((r) => r.node.path)).toContain('src/extra.ts')
  })

  it('children-failed clears stale so a vanished dir never re-fetch loops', () => {
    let state = step(deep(), { type: 'watch-invalidated', dirs: ['src'], overflow: false })
    state = step(state, { type: 'children-failed', path: 'src' })
    expect(state.stale.has('src')).toBe(false)
    expect(state.failed.has('src')).toBe(true)
  })

  it('re-expanding a stale cached directory still uses the cache (no loading round)', () => {
    let state = step(deep(), { type: 'watch-invalidated', dirs: ['src'], overflow: false })
    state = step(state, { type: 'toggle', path: 'src' }) // collapse
    state = step(state, { type: 'toggle', path: 'src' }) // re-expand
    expect(state.loading.has('src')).toBe(false)
    expect(state.stale.has('src')).toBe(true)
  })

  it('an event for a failed directory does not auto-retry it (manual retry stays)', () => {
    // A failed listing has no children entry — it is not "loaded", so the
    // invalidation never re-arms it; the retry button keeps that job.
    let state = withRoot(opened())
    state = step(state, { type: 'toggle', path: 'src' })
    state = step(state, { type: 'children-failed', path: 'src' })
    state = step(state, { type: 'watch-invalidated', dirs: ['src'], overflow: false })
    expect(state.stale.has('src')).toBe(false)
    expect(state.loading.has('src')).toBe(false)
  })
})

describe('close', () => {
  it('clears the whole browser state — nothing survives a back-to-tasks', () => {
    const state = fileBrowserReducer(withRoot(opened()), { type: 'close' })
    expect(state).toBeNull()
  })
})

describe('fileIconKind', () => {
  it('classifies names into the icon vocabulary the tree renders', () => {
    const cases: Array<[string, 'file' | 'dir', string]> = [
      ['src', 'dir', 'folder'],
      ['.git', 'dir', 'folder'],
      ['.gitignore', 'file', 'git'],
      ['.gitattributes', 'file', 'git'],
      ['package.json', 'file', 'config'],
      ['tsconfig.json', 'file', 'config'],
      ['config.yaml', 'file', 'config'],
      ['README.md', 'file', 'docs'],
      ['notes.txt', 'file', 'docs'],
      ['logo.svg', 'file', 'image'],
      ['shot.png', 'file', 'image'],
      ['app.css', 'file', 'style'],
      ['theme.scss', 'file', 'style'],
      ['index.ts', 'file', 'code'],
      ['main.py', 'file', 'code'],
      ['run.sh', 'file', 'code'],
      ['Makefile', 'file', 'file']
    ]
    for (const [name, type, expected] of cases) {
      expect(fileIconKind(name, type)).toBe(expected)
    }
  })
})
