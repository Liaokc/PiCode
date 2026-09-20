/**
 * The subagent conversation tab's steer receipt store (ticket 99). The App
 * folds the scoped host event stream into it (the chat reducer no-ops these
 * events); each open conversation tab subscribes and selects the receipts
 * for ITS run. Pure pub/sub — no React, no Electron — with the receipt
 * semantics in the shared pure fold (`foldSteerReceipts`, Seam-1 tested):
 * the RPC's acknowledged-delivery receipt is shown verbatim, delivered /
 * queued / failed alike.
 */

import type { SessionScopedEvent } from '../../../shared/contract'
import { foldSteerReceipts, type SteerReceipt } from '../../../shared/subagents/chat-model'

export type SteerReceiptEvent = Extract<SessionScopedEvent, { type: 'subagent_steer_receipt' }>

/** Whether one scoped event is a steer receipt (App-side filter). */
export function isSteerReceiptEvent(event: SessionScopedEvent): event is SteerReceiptEvent {
  return event.type === 'subagent_steer_receipt'
}

/** A receipt as the store holds it: the shared record plus its session
 * scope (the App folds the wrapped stream, so every receipt knows which
 * session's host answered it). */
export type StoredReceipt = SteerReceipt & { sessionId: string }

/** The receipt list is bounded — a steering-heavy session cannot grow the
 * store without limit; the oldest receipts drop (they are acks, not
 * transcript history). */
const RECEIPTS_CAPACITY = 50

export class SubagentChatStore {
  private receipts: StoredReceipt[] = []
  private listeners = new Set<() => void>()

  /** The receipts for ONE run (the tab selects its own). */
  receiptsFor(sessionId: string, asyncId: string): StoredReceipt[] {
    return this.receipts.filter((receipt) => receipt.sessionId === sessionId && receipt.asyncId === asyncId)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** The conversation tab sent a steer: seed the optimistic pending receipt. */
  steerSent(sessionId: string, asyncId: string, requestId: string): void {
    this.receipts = [
      ...this.receipts,
      { sessionId, requestId, asyncId, status: 'pending' as const, error: null }
    ].slice(-RECEIPTS_CAPACITY)
    this.emit()
  }

  /** Fold one (already filtered) receipt event tagged with its session. */
  dispatch(event: SteerReceiptEvent, sessionId: string): void {
    const sessionReceipts: SteerReceipt[] = this.receipts
      .filter((receipt) => receipt.sessionId === sessionId)
      .map(({ sessionId: _scope, ...receipt }) => receipt)
    const folded = foldSteerReceipts(sessionReceipts, event)
    if (folded === sessionReceipts) return
    const byId = new Map(folded.map((receipt) => [receipt.requestId, receipt]))
    this.receipts = this.receipts.map((receipt) => {
      if (receipt.sessionId !== sessionId) return receipt
      const next = byId.get(receipt.requestId)
      return next !== undefined ? { ...next, sessionId } : receipt
    })
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export const subagentChatStore = new SubagentChatStore()
