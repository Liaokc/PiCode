import { describe, expect, it } from 'vitest'
import { initialReviewTabState, reviewTabReducer, type ReviewAction } from '../../src/shared/review/view-model'
import type { ReviewResult } from '../../src/shared/review/types'

function snapshotResult(paths: string[]): Extract<ReviewResult, { ok: true }> {
  return {
    ok: true,
    snapshot: {
      cwd: '/repo',
      head: 'abc123',
      branch: 'main',
      files: paths.map((path) => ({
        path,
        oldPath: null,
        status: 'modified' as const,
        binary: false,
        additions: 1,
        deletions: 0,
        hunks: [],
        untracked: false
      }))
    }
  }
}

const failure: Extract<ReviewResult, { ok: false }> = { ok: false, reason: 'not-a-git-repo', message: 'not a repo' }

describe('reviewTabReducer', () => {
  it('starts idle with unified mode and no selection', () => {
    const state = initialReviewTabState()
    expect(state).toEqual({ status: 'idle', result: null, mode: 'unified', selectedPath: null })
  })

  it('moves to loading and back to ready on success', () => {
    let state = reviewTabReducer(initialReviewTabState(), { type: 'load-start' })
    expect(state.status).toBe('loading')
    state = reviewTabReducer(state, { type: 'load-success', result: snapshotResult(['a.ts', 'b.ts']) })
    expect(state.status).toBe('ready')
    expect(state.selectedPath).toBe('a.ts')
  })

  it('records failures with their typed reason', () => {
    let state = reviewTabReducer(initialReviewTabState(), { type: 'load-start' })
    state = reviewTabReducer(state, { type: 'load-failure', result: failure })
    expect(state.status).toBe('error')
    expect(state.result).toEqual(failure)
  })

  it('keeps the selection when the file survives a refresh and falls back to the first file otherwise', () => {
    let state = reviewTabReducer(initialReviewTabState(), { type: 'load-success', result: snapshotResult(['a.ts', 'b.ts']) })
    state = reviewTabReducer(state, { type: 'select-file', path: 'b.ts' })
    state = reviewTabReducer(state, { type: 'load-success', result: snapshotResult(['b.ts', 'c.ts']) })
    expect(state.selectedPath).toBe('b.ts')
    state = reviewTabReducer(state, { type: 'load-success', result: snapshotResult(['c.ts']) })
    expect(state.selectedPath).toBe('c.ts')
    state = reviewTabReducer(state, { type: 'load-success', result: snapshotResult([]) })
    expect(state.selectedPath).toBeNull()
  })

  it('switches modes without touching load state', () => {
    let state = reviewTabReducer(initialReviewTabState(), { type: 'load-success', result: snapshotResult(['a.ts']) })
    state = reviewTabReducer(state, { type: 'set-mode', mode: 'split' })
    expect(state.mode).toBe('split')
    expect(state.status).toBe('ready')
  })

  it('toggles the unified/split default contract: unified is initial', () => {
    expect(initialReviewTabState().mode).toBe('unified')
  })

  it('never mutates the previous state', () => {
    const state: ReturnType<typeof initialReviewTabState> = Object.freeze(initialReviewTabState())
    const next = reviewTabReducer(state, { type: 'load-start' } satisfies ReviewAction)
    expect(next).not.toBe(state)
    expect(state.status).toBe('idle')
  })
})
