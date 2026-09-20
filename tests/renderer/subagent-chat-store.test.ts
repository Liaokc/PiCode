/**
 * Ticket 99 renderer-store tests: the subagent conversation tab's steer
 * receipt store. Pure pub/sub like the MCP auth store — the App folds the
 * scoped host event stream into it; each open conversation tab subscribes
 * and selects its own run's receipts. The fold itself is the pure
 * `foldSteerReceipts` (chat-model), tested separately; here the store's
 * pending-seeding, session scoping and subscription behavior.
 */

import { describe, expect, it, vi } from 'vitest'
import { SubagentChatStore } from '../../src/renderer/src/components/subagent-chat-store'

describe('subagentChatStore', () => {
  it('seeds a pending receipt when the tab sends a steer', () => {
    const store = new SubagentChatStore()
    store.steerSent('s1', 'run-1', 'req-1')
    expect(store.receiptsFor('s1', 'run-1')).toEqual([
      { sessionId: 's1', requestId: 'req-1', asyncId: 'run-1', status: 'pending', error: null }
    ])
  })

  it('folds the receipt event scoped to its session (other sessions are noise)', () => {
    const store = new SubagentChatStore()
    store.steerSent('s1', 'run-1', 'req-1')
    store.dispatch(
      { type: 'subagent_steer_receipt', requestId: 'req-1', asyncId: 'run-1', ok: true, deliveryStatus: 'delivered' },
      's2'
    )
    expect(store.receiptsFor('s1', 'run-1')[0]?.status).toBe('pending')
    store.dispatch(
      { type: 'subagent_steer_receipt', requestId: 'req-1', asyncId: 'run-1', ok: true, deliveryStatus: 'delivered' },
      's1'
    )
    expect(store.receiptsFor('s1', 'run-1')[0]?.status).toBe('delivered')
  })

  it('a failed receipt carries the error verbatim', () => {
    const store = new SubagentChatStore()
    store.steerSent('s1', 'run-1', 'req-1')
    store.dispatch({ type: 'subagent_steer_receipt', requestId: 'req-1', asyncId: 'run-1', ok: false, error: 'no such async run' }, 's1')
    expect(store.receiptsFor('s1', 'run-1')[0]).toMatchObject({ status: 'failed', error: 'no such async run' })
  })

  it('notifies subscribers on every change', () => {
    const store = new SubagentChatStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.steerSent('s1', 'run-1', 'req-1')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.steerSent('s1', 'run-2', 'req-2')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('caps the receipt list (a long steering session cannot grow it unbounded)', () => {
    const store = new SubagentChatStore()
    for (let i = 0; i < 60; i++) store.steerSent('s1', 'run-1', `req-${i}`)
    expect(store.receiptsFor('s1', 'run-1').length).toBe(50)
    expect(store.receiptsFor('s1', 'run-1')[0]?.requestId).toBe('req-10') // oldest dropped
  })
})
