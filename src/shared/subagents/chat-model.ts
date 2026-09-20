/**
 * The subagent conversation tab's pure model (ticket 99). The tab reuses the
 * main transcript component family over the CHILD session's transcript —
 * the child is a real Pi session whose file the host's sessions service
 * tails (the trace-follow precedent) — plus a compact steer composer whose
 * send rides pi-subagents' acknowledged-delivery RPC (the receipt is shown
 * verbatim: delivered / queued / failed).
 *
 * Everything here is JSON-shape defense + pure folding (Seam-1): the
 * renderer never trusts a push, and a receipt never invents a delivery
 * claim the RPC did not make.
 */

import type { TranscriptItem } from '../sessions/types'
import type { SubagentRowState } from './types'

// ---- the transcript payload (sessions-family push) --------------------------

/** Why a conversation tab has no transcript. Honest vocabulary: the artifacts
 * were cleaned (lost runs), the run recorded no child session file
 * (foreground calls), or the child file is unreadable. */
export type SubagentTranscriptError = 'artifact-missing' | 'no-session-file' | 'unreadable'

/** One transcript snapshot for ONE async run's artifact dir. `items` replay
 * through the same `replayEntry` path as `history_loaded`, so the tab renders
 * the exact main-transcript component family. */
export interface SubagentTranscriptPayload {
  asyncDir: string
  /** The resolved child session file (null when unresolvable — `error` says why). */
  sessionFile: string | null
  items: TranscriptItem[]
  error: SubagentTranscriptError | null
}

const TRANSCRIPT_ERRORS: ReadonlySet<string> = new Set(['artifact-missing', 'no-session-file', 'unreadable'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTranscriptItem(value: unknown): value is TranscriptItem {
  if (!isRecord(value)) return false
  const role = value['role']
  return role === 'user' || role === 'assistant' || role === 'tool'
}

/**
 * Defensive read of a pushed (or resolved) transcript payload: junk pushes
 * are dropped (null), unknown error strings degrade to `unreadable`, and
 * non-item junk inside `items` is dropped item-wise instead of failing the
 * whole snapshot.
 */
export function normalizeTranscriptPayload(value: unknown): SubagentTranscriptPayload | null {
  if (!isRecord(value)) return null
  const asyncDir = value['asyncDir']
  if (typeof asyncDir !== 'string' || asyncDir === '') return null
  const rawItems = value['items']
  if (!Array.isArray(rawItems)) return null
  const sessionFile = typeof value['sessionFile'] === 'string' && value['sessionFile'] !== '' ? value['sessionFile'] : null
  const rawError = value['error']
  const error: SubagentTranscriptError | null =
    typeof rawError === 'string' && TRANSCRIPT_ERRORS.has(rawError)
      ? (rawError as SubagentTranscriptError)
      : typeof rawError === 'string'
        ? 'unreadable'
        : null
  return { asyncDir, sessionFile, items: rawItems.filter(isTranscriptItem), error }
}

// ---- the steer receipt (acknowledged-delivery, shown verbatim) --------------

/** One steer send's receipt. `pending` is the optimistic local state; the
 * host's `subagent_steer_receipt` event folds it to a terminal state. */
export interface SteerReceipt {
  requestId: string
  asyncId: string
  status: 'pending' | 'delivered' | 'queued' | 'failed'
  /** The failure text verbatim (RPC error / timeout / no-host degradation). */
  error: string | null
}

/** The wire shape of the host's receipt event (the fold's input). */
export interface SteerReceiptEvent {
  requestId: string
  asyncId: string
  ok: boolean
  deliveryStatus?: string
  error?: string
}

/**
 * Fold one receipt event into the tab's receipt list. Identity = requestId;
 * terminal receipts never regress (late duplicates are ignored); an ok
 * reply without a usable deliveryStatus lands as an honest failure — the
 * RPC's acknowledged-delivery contract guarantees the field, so its absence
 * is a broken reply, never a claim we invent.
 */
export function foldSteerReceipts(records: readonly SteerReceipt[], event: SteerReceiptEvent): SteerReceipt[] {
  const index = records.findIndex((record) => record.requestId === event.requestId)
  if (index === -1) return [...records]
  const current = records[index]!
  if (current.status !== 'pending') return [...records]
  let next: SteerReceipt
  if (event.ok && event.deliveryStatus === 'delivered') {
    next = { ...current, status: 'delivered', error: null }
  } else if (event.ok && event.deliveryStatus === 'queued') {
    next = { ...current, status: 'queued', error: null }
  } else if (event.ok) {
    next = { ...current, status: 'failed', error: 'the steer reply carried no delivery status' }
  } else {
    next = { ...current, status: 'failed', error: typeof event.error === 'string' && event.error !== '' ? event.error : null }
  }
  const copy = [...records]
  copy[index] = next
  return copy
}

/** The receipt row's copy — every state visible, failure text verbatim. */
export function steerReceiptCopy(receipt: SteerReceipt): string {
  switch (receipt.status) {
    case 'pending':
      return 'Steering…'
    case 'delivered':
      return 'Steer delivered'
    case 'queued':
      return 'Steer queued — injects when the current step ends'
    case 'failed':
      return receipt.error !== null ? `Steer failed — ${receipt.error}` : 'Steer failed'
  }
}

// ---- the tab's behavior table ------------------------------------------------

/** The badge states that mean the child is still working (composer shown,
 * transcript following). Terminal states are read-only. */
export function rowIsLive(state: SubagentRowState): boolean {
  return state === 'running' || state === 'waiting' || state === 'blocked'
}
