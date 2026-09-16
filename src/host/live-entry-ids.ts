/**
 * Ticket 51: real session entry ids on the live path.
 *
 * The SDK emits `message_end` BEFORE it persists the message
 * (AgentSession._handleAgentEvent dispatches to listeners first, then calls
 * `sessionManager.appendMessage`), so the contract event cannot carry the
 * real session entry id at emit time. The fork anchor (ticket 16) is an
 * assistant entry id — a synthetic id makes every live-path fork throw
 * "Invalid entry ID for forking". This module owns the two host-side pieces:
 *
 *  - `HeldMessageEnd`: the assistant `message_end` contract event is held
 *    from the SDK moment and released at the persistence moment with the
 *    real entry id — or flushed id-less when the entry never persisted
 *    (aborted-turn shapes), before anything else can reorder the stream.
 *  - `monitorSessionManager`: wraps `sessionManager.appendMessage` so the
 *    host learns the real entry id exactly when the entry lands.
 *
 * Pure seam logic — no IPC, no SDK imports — so the hold/release state
 * machine is table-testable without a live session.
 */

import type { UsageTokens } from '../shared/usage/types'

/** Whether a pending assistant message_end still owes the stream a send.
 * The boolean result tells the caller to emit (with the id it read back
 * for `settle`, without one for `flush`). Ticket 77: the hold also carries
 * the finished message's ring usage — the caller reads it back with
 * `takeUsage` (read-and-clear) after a successful settle/flush and rides it
 * on the contract event. */
export class HeldMessageEnd {
  private held = false
  /** Ticket 77: the held message's valid usage (host-projected);
   * undefined when the message carried none. Cleared by `takeUsage` and
   * overwritten by every `hold`, so a stale payload can never leak into a
   * later event. */
  private usage: UsageTokens | undefined = undefined

  /** The SDK's assistant message_end arrived; hold the contract event. */
  hold(usage?: UsageTokens): void {
    this.held = true
    this.usage = usage
  }

  /** The entry persisted — release (the caller sends the id it read back). */
  settle(): boolean {
    if (!this.held) return false
    this.held = false
    return true
  }

  /** The entry never persisted — release id-less (renderer falls back to
   * its synthetic id). Called when any other SDK event arrives first. */
  flush(): boolean {
    if (!this.held) return false
    this.held = false
    return true
  }

  /** Ticket 77: read-and-clear the held usage — valid right after a
   * successful settle/flush, undefined when the message carried none. */
  takeUsage(): UsageTokens | undefined {
    const usage = this.usage
    this.usage = undefined
    return usage
  }
}

/** Wrap one manager's `appendMessage` so `onAppended` fires with the real
 * entry id at the persistence moment. The wrap is transparent: the original
 * return value (the entry id) is preserved for the SDK. Generic over the
 * manager shape (message type derived from it) so tests drive it with fakes. */
export function monitorSessionManager<M extends { appendMessage: (message: never) => string }>(
  manager: M,
  onAppended: (message: Parameters<M['appendMessage']>[0], entryId: string) => void
): void {
  type Append = M['appendMessage']
  const original = manager.appendMessage.bind(manager)
  const wrapped: Append = (message) => {
    const entryId = original(message)
    onAppended(message, entryId)
    return entryId
  }
  ;(manager as { appendMessage: Append }).appendMessage = wrapped
}
