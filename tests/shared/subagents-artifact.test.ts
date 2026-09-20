/**
 * Ticket 99 Seam-1 tests: the shared status.json envelope parsers. The
 * artifact envelope table is PURE (the fs reads live node-side — host
 * bridge / main sessions service — since src/shared stays
 * environment-free). Covered: the run-state table (moved from the host
 * bridge in ticket 99, byte-identical) and the ticket-99 transcript source
 * resolver: which child session file one run's conversation tab should
 * follow. Junk envelopes resolve null — no live evidence, no invention
 * (the ticket-90 epistemology rule).
 */

import { describe, expect, it } from 'vitest'
import { parseRunStateEnvelope, parseTranscriptSourceEnvelope } from '../../src/shared/subagents/artifact'

// ---- parseRunStateEnvelope (moved from the host bridge — same table) --------

describe('parseRunStateEnvelope', () => {
  it('reads the bounded run state (regression: the ticket-90 table)', () => {
    expect(
      parseRunStateEnvelope({ runId: 'r-1', state: 'running', startedAt: 5, mode: 'single', agents: ['scout'], currentTool: 'grep' })
    ).toEqual({
      runId: 'r-1',
      state: 'running',
      startedAt: 5,
      mode: 'single',
      agents: ['scout'],
      currentTool: 'grep'
    })
  })

  it('returns null for junk / unknown-state / identity-less envelopes', () => {
    expect(parseRunStateEnvelope(null)).toBeNull()
    expect(parseRunStateEnvelope('not an object')).toBeNull()
    expect(parseRunStateEnvelope({ runId: 'r-1', state: 'quantum' })).toBeNull()
    expect(parseRunStateEnvelope({ state: 'running' })).toBeNull()
    expect(parseRunStateEnvelope({ id: 'r-1', state: 'running' })).toMatchObject({ runId: 'r-1' }) // the `id` alias still works
  })
})

// ---- parseTranscriptSourceEnvelope (ticket 99) -------------------------------

describe('parseTranscriptSourceEnvelope', () => {
  it('resolves the top-level sessionFile of a single-child run', () => {
    expect(parseTranscriptSourceEnvelope({ runId: 'r-1', state: 'running', sessionFile: '/store/child.jsonl' })).toEqual({
      sessionFile: '/store/child.jsonl',
      state: 'running',
      steps: 0
    })
  })

  it('falls back to the first step with a sessionFile (chain / parallel runs)', () => {
    expect(
      parseTranscriptSourceEnvelope({
        runId: 'r-2',
        state: 'running',
        steps: [{ index: 0, sessionFile: null }, { index: 1, sessionFile: '/store/step-1.jsonl' }]
      })
    ).toEqual({ sessionFile: '/store/step-1.jsonl', state: 'running', steps: 2 })
  })

  it('a run with no sessionFile anywhere resolves null (honest no-source)', () => {
    expect(parseTranscriptSourceEnvelope({ runId: 'r-3', state: 'running' })).toEqual({
      sessionFile: null,
      state: 'running',
      steps: 0
    })
  })

  it('junk / identity-less envelopes resolve null — the error path the tab renders', () => {
    expect(parseTranscriptSourceEnvelope(null)).toBeNull()
    expect(parseTranscriptSourceEnvelope({ runId: 'r-4', state: 'nope' })).toBeNull()
  })

  it('nested-run noise (nestedChildren, agents) never breaks the read', () => {
    expect(
      parseTranscriptSourceEnvelope({
        runId: 'r-5',
        state: 'complete',
        endedAt: 99,
        sessionFile: '/store/child-5.jsonl',
        nestedChildren: [{ runId: 'n-1' }],
        agents: ['scout']
      })
    ).toEqual({ sessionFile: '/store/child-5.jsonl', state: 'complete', steps: 0 })
  })
})
