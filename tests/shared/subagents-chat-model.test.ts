/**
 * Ticket 99 Seam-1 tests: the subagent conversation tab's pure model —
 * the steer receipt fold (pending → delivered / queued / failed, all shown
 * honestly), the defensive read of the host's transcript payload (the
 * sessions-family push), and the tab's live/terminal behavior table over a
 * projected directory row.
 */

import { describe, expect, it } from 'vitest'
import type { TranscriptItem } from '../../src/shared/sessions/types'
import type { SubagentRowState } from '../../src/shared/subagents/types'
import {
  foldSteerReceipts,
  normalizeTranscriptPayload,
  rowIsLive,
  steerReceiptCopy,
  type SteerReceipt,
  type SubagentTranscriptPayload
} from '../../src/shared/subagents/chat-model'

// ---- the receipt fold -------------------------------------------------------

describe('foldSteerReceipts', () => {
  const base: SteerReceipt = { requestId: 'r-1', asyncId: 'run-1', status: 'pending', error: null }

  it('keeps unrelated receipts untouched (identity = requestId)', () => {
    const other: SteerReceipt = { requestId: 'r-2', asyncId: 'run-1', status: 'pending', error: null }
    const delivered = { requestId: 'r-9', asyncId: 'run-1', ok: true, deliveryStatus: 'delivered' as const }
    expect(foldSteerReceipts([base, other], delivered)).toEqual([base, other])
  })

  it('delivered: ok + deliveryStatus delivered flips the pending receipt', () => {
    const next = foldSteerReceipts([base], { requestId: 'r-1', asyncId: 'run-1', ok: true, deliveryStatus: 'delivered' })
    expect(next).toEqual([{ requestId: 'r-1', asyncId: 'run-1', status: 'delivered', error: null }])
  })

  it('queued: ok + deliveryStatus queued flips the pending receipt (the ack is the truth)', () => {
    const next = foldSteerReceipts([base], { requestId: 'r-1', asyncId: 'run-1', ok: true, deliveryStatus: 'queued' })
    expect(next).toEqual([{ requestId: 'r-1', asyncId: 'run-1', status: 'queued', error: null }])
  })

  it('ok:true without a usable deliveryStatus never invents a delivery claim (honest failure)', () => {
    const next = foldSteerReceipts([base], { requestId: 'r-1', asyncId: 'run-1', ok: true })
    expect(next).toEqual([expect.objectContaining({ requestId: 'r-1', status: 'failed' })])
    expect(next[0]!.error).toContain('delivery status')
  })

  it('failed: ok:false carries the error text verbatim', () => {
    const next = foldSteerReceipts([base], { requestId: 'r-1', asyncId: 'run-1', ok: false, error: 'run not found' })
    expect(next).toEqual([{ requestId: 'r-1', asyncId: 'run-1', status: 'failed', error: 'run not found' }])
  })

  it('ok:false with no error text still lands as failed (no silent swallow)', () => {
    const next = foldSteerReceipts([base], { requestId: 'r-1', asyncId: 'run-1', ok: false })
    expect(next).toEqual([expect.objectContaining({ requestId: 'r-1', status: 'failed', error: null })])
  })

  it('a terminal receipt never regresses (late duplicates are ignored)', () => {
    const delivered: SteerReceipt = { requestId: 'r-1', asyncId: 'run-1', status: 'delivered', error: null }
    const lateFailure = { requestId: 'r-1', asyncId: 'run-1', ok: false, error: 'late error' }
    expect(foldSteerReceipts([delivered], lateFailure)).toEqual([delivered])
  })

  it('an unknown requestId is dropped (the fold never grows from noise)', () => {
    expect(foldSteerReceipts([], { requestId: 'ghost', asyncId: 'run-1', ok: true, deliveryStatus: 'delivered' })).toEqual([])
  })
})

describe('steerReceiptCopy', () => {
  it('renders the honest copy per state', () => {
    expect(steerReceiptCopy({ requestId: 'r', asyncId: 'a', status: 'pending', error: null })).toBe('Steering…')
    expect(steerReceiptCopy({ requestId: 'r', asyncId: 'a', status: 'delivered', error: null })).toBe('Steer delivered')
    expect(steerReceiptCopy({ requestId: 'r', asyncId: 'a', status: 'queued', error: null })).toBe(
      'Steer queued — injects when the current step ends'
    )
    expect(steerReceiptCopy({ requestId: 'r', asyncId: 'a', status: 'failed', error: 'run not found' })).toBe(
      'Steer failed — run not found'
    )
    expect(steerReceiptCopy({ requestId: 'r', asyncId: 'a', status: 'failed', error: null })).toBe('Steer failed')
  })
})

// ---- the transcript payload's defensive read --------------------------------

describe('normalizeTranscriptPayload', () => {
  const item: TranscriptItem = { role: 'user', id: 'u1', text: 'hello', timestamp: '2026-01-01T00:00:00.000Z', skillName: null }

  it('accepts a well-formed payload', () => {
    const payload = { asyncDir: '/tmp/run', sessionFile: '/tmp/child.jsonl', items: [item], error: null }
    expect(normalizeTranscriptPayload(payload)).toEqual(payload)
  })

  it('rejects junk (non-records, missing asyncDir, non-array items)', () => {
    expect(normalizeTranscriptPayload(null)).toBeNull()
    expect(normalizeTranscriptPayload(42)).toBeNull()
    expect(normalizeTranscriptPayload({})).toBeNull()
    expect(normalizeTranscriptPayload({ asyncDir: '/tmp/run', items: 'nope', error: null })).toBeNull()
  })

  it('coerces the error vocabulary; unknown error strings map to unreadable (honest degradation)', () => {
    expect(normalizeTranscriptPayload({ asyncDir: '/r', sessionFile: null, items: [], error: 'artifact-missing' })?.error).toBe(
      'artifact-missing'
    )
    expect(normalizeTranscriptPayload({ asyncDir: '/r', sessionFile: null, items: [], error: 'no-session-file' })?.error).toBe(
      'no-session-file'
    )
    expect(normalizeTranscriptPayload({ asyncDir: '/r', sessionFile: null, items: [], error: 'weird' })?.error).toBe('unreadable')
    expect(normalizeTranscriptPayload({ asyncDir: '/r', sessionFile: null, items: [], error: null })?.error).toBeNull()
  })

  it('drops non-item junk from the items array instead of failing the payload', () => {
    const payload = { asyncDir: '/r', sessionFile: null, items: [item, null, 'junk', item], error: null }
    expect(normalizeTranscriptPayload(payload)?.items).toEqual([item, item])
  })
})

// ---- the tab's behavior table ------------------------------------------------

describe('rowIsLive', () => {
  const cases: Array<[SubagentRowState, boolean]> = [
    ['running', true],
    ['waiting', true],
    ['blocked', true],
    ['completed', false],
    ['failed', false],
    ['cancelled', false],
    ['lost', false]
  ]
  it.each(cases)('%s → %s', (state, live) => {
    expect(rowIsLive(state)).toBe(live)
  })
})

// ---- the payload type is structural (compile-level contract) -----------------

describe('SubagentTranscriptPayload shape', () => {
  it('carries the error vocabulary only', () => {
    const payload: SubagentTranscriptPayload = { asyncDir: '/r', sessionFile: null, items: [], error: 'artifact-missing' }
    expect(payload.error).toBe('artifact-missing')
  })
})
