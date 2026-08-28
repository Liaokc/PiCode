import { describe, expect, it } from 'vitest'
import { PREVIEW_SOURCE_MAX_LINES, PREVIEW_SOURCE_WINDOW_LINES } from '../../src/shared/preview/policy'
import { initialPreviewTabState, previewTabReducer } from '../../src/shared/preview/view-model'
import type { PreviewResult } from '../../src/shared/preview/types'

const selA = { cwd: '/proj', path: '/proj/README.md', token: 1 }
const selB = { cwd: '/proj', path: '/proj/src/a.ts', token: 2 }

const fileResult = {
  ok: true as const,
  kind: 'file' as const,
  file: {
    absolutePath: '/proj/README.md',
    cwd: '/proj',
    relativePath: 'README.md',
    name: 'README.md',
    kind: 'markdown' as const,
    sizeBytes: 10,
    totalLines: 1,
    text: '# hi'
  }
}

describe('initialPreviewTabState', () => {
  it('starts idle with no selection, rendered view, wrapped lines and one window of lines', () => {
    const state = initialPreviewTabState()
    expect(state).toEqual({
      sel: null,
      status: 'idle',
      result: null,
      view: 'rendered',
      wrapLines: true,
      visibleLines: PREVIEW_SOURCE_WINDOW_LINES
    })
  })
})

describe('previewTabReducer — load lifecycle', () => {
  it('load-start adopts the selection, keeps the old content visible and resets per-file view state', () => {
    let state = previewTabReducer(initialPreviewTabState(), { type: 'load-start', sel: selA })
    expect(state.status).toBe('loading')
    expect(state.sel).toEqual(selA)
    state = previewTabReducer(state, { type: 'load-success', result: fileResult })
    state = previewTabReducer(state, { type: 'set-view', view: 'source' })
    state = previewTabReducer(state, { type: 'show-more-lines' })
    const retargeted = previewTabReducer(state, { type: 'load-start', sel: selB })
    expect(retargeted.status).toBe('loading')
    expect(retargeted.sel).toEqual(selB)
    // Previous file stays visible while the next one loads…
    expect(retargeted.result).toEqual(fileResult)
    // …but per-file view state resets.
    expect(retargeted.view).toBe('rendered')
    expect(retargeted.visibleLines).toBe(PREVIEW_SOURCE_WINDOW_LINES)
  })

  it('load-success stores the result and marks ready', () => {
    let state = previewTabReducer(initialPreviewTabState(), { type: 'load-start', sel: selA })
    state = previewTabReducer(state, { type: 'load-success', result: fileResult })
    expect(state.status).toBe('ready')
    expect(state.result).toEqual(fileResult)
  })

  it('load-failure stores the typed failure and drops the selection content', () => {
    const failure: Extract<PreviewResult, { ok: false }> = {
      ok: false,
      reason: 'not-found',
      message: 'No such file.'
    }
    let state = previewTabReducer(initialPreviewTabState(), { type: 'load-start', sel: selA })
    state = previewTabReducer(state, { type: 'load-failure', result: failure })
    expect(state.status).toBe('error')
    expect(state.result).toEqual(failure)
  })
})

describe('previewTabReducer — view mode', () => {
  it('toggles rendered/source for markdown files', () => {
    let state = previewTabReducer(initialPreviewTabState(), { type: 'load-start', sel: selA })
    state = previewTabReducer(state, { type: 'load-success', result: fileResult })
    state = previewTabReducer(state, { type: 'set-view', view: 'source' })
    expect(state.view).toBe('source')
    state = previewTabReducer(state, { type: 'set-view', view: 'rendered' })
    expect(state.view).toBe('rendered')
  })

  it('set-view is a no-op when the value is unchanged', () => {
    const base = initialPreviewTabState()
    const state = previewTabReducer(base, { type: 'set-view', view: 'rendered' })
    expect(state).toBe(base)
  })
})

describe('previewTabReducer — large-file line windowing', () => {
  function bigFile(totalLines: number) {
    return {
      ok: true as const,
      kind: 'file' as const,
      file: {
        absolutePath: '/proj/big.log',
        cwd: '/proj',
        relativePath: 'big.log',
        name: 'big.log',
        kind: 'source' as const,
        sizeBytes: 100,
        totalLines,
        text: Array.from({ length: totalLines }, (_, i) => `line ${i + 1}`).join('\n')
      }
    }
  }

  it('grows visibleLines by one window per show-more-lines', () => {
    let state = previewTabReducer(initialPreviewTabState(), { type: 'load-start', sel: selA })
    state = previewTabReducer(state, { type: 'load-success', result: bigFile(PREVIEW_SOURCE_WINDOW_LINES * 3) })
    state = previewTabReducer(state, { type: 'show-more-lines' })
    expect(state.visibleLines).toBe(PREVIEW_SOURCE_WINDOW_LINES * 2)
    state = previewTabReducer(state, { type: 'show-more-lines' })
    expect(state.visibleLines).toBe(PREVIEW_SOURCE_WINDOW_LINES * 3)
  })

  it('never grows past the hard render cap', () => {
    let state = previewTabReducer(initialPreviewTabState(), { type: 'load-start', sel: selA })
    state = previewTabReducer(state, { type: 'load-success', result: bigFile(PREVIEW_SOURCE_MAX_LINES * 2) })
    for (let i = 0; i < 100; i++) state = previewTabReducer(state, { type: 'show-more-lines' })
    expect(state.visibleLines).toBe(PREVIEW_SOURCE_MAX_LINES)
  })

  it('show-more-lines is a no-op before a file is loaded', () => {
    const base = initialPreviewTabState()
    expect(previewTabReducer(base, { type: 'show-more-lines' })).toBe(base)
  })
})

describe('previewTabReducer — wrap/truncate display mode', () => {
  it('toggles line wrapping (wrap is the default)', () => {
    expect(initialPreviewTabState().wrapLines).toBe(true)
    const unwrapped = previewTabReducer(initialPreviewTabState(), { type: 'toggle-wrap-lines' })
    expect(unwrapped.wrapLines).toBe(false)
    expect(previewTabReducer(unwrapped, { type: 'toggle-wrap-lines' }).wrapLines).toBe(true)
  })

  it('keeps the wrap preference across file loads (display preference, not per-file state)', () => {
    let state = previewTabReducer(initialPreviewTabState(), { type: 'toggle-wrap-lines' })
    state = previewTabReducer(state, { type: 'load-start', sel: selA })
    expect(state.wrapLines).toBe(false)
  })
})

describe('previewTabReducer — purity', () => {
  it('never mutates state and ignores unknown actions', () => {
    const frozen = Object.freeze(initialPreviewTabState())
    const next = previewTabReducer(frozen, { type: 'load-start', sel: selA })
    expect(next).not.toBe(frozen)
    expect(frozen.sel).toBeNull()
    expect(previewTabReducer(frozen, { type: 'nonsense' } as unknown as never)).toBe(frozen)
  })
})
