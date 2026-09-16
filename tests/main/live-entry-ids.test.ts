import { describe, expect, it } from 'vitest'
import { HeldMessageEnd, monitorSessionManager } from '../../src/host/live-entry-ids'

describe('HeldMessageEnd (ticket 51)', () => {
  it('settles a held end with the real entry id exactly once', () => {
    const held = new HeldMessageEnd()
    expect(held.settle()).toBe(false) // nothing held
    held.hold()
    expect(held.settle()).toBe(true)
    expect(held.settle()).toBe(false) // already released
    expect(held.flush()).toBe(false)
  })

  it('flushes a held end id-less when the entry never persisted, exactly once', () => {
    const held = new HeldMessageEnd()
    expect(held.flush()).toBe(false) // nothing held
    held.hold()
    expect(held.flush()).toBe(true)
    expect(held.flush()).toBe(false)
    expect(held.settle()).toBe(false)
  })

  it('holds across repeated holds and releases once', () => {
    const held = new HeldMessageEnd()
    held.hold()
    held.hold()
    expect(held.settle()).toBe(true)
    expect(held.settle()).toBe(false)
  })

  it('re-arms after a release (next message ends are independent)', () => {
    const held = new HeldMessageEnd()
    held.hold()
    expect(held.settle()).toBe(true)
    held.hold()
    expect(held.settle()).toBe(true)
  })

  it('carries the ring usage payload through settle and flush (ticket 77)', () => {
    const usage = { input: 10, output: 2, cacheRead: 3, cacheWrite: 1, total: 16 }
    const held = new HeldMessageEnd()
    expect(held.takeUsage()).toBeUndefined() // nothing held
    held.hold(usage)
    expect(held.settle()).toBe(true)
    expect(held.takeUsage()).toEqual(usage)
    expect(held.takeUsage()).toBeUndefined() // read-and-clear
  })

  it('flush releases the payload too — a completed message keeps its usage id-less', () => {
    const usage = { input: 10, output: 2, cacheRead: 3, cacheWrite: 1, total: 16 }
    const held = new HeldMessageEnd()
    held.hold(usage)
    expect(held.flush()).toBe(true)
    expect(held.takeUsage()).toEqual(usage)
  })

  it('a later argument-less hold overwrites a stale payload (no leak)', () => {
    const usage = { input: 10, output: 2, cacheRead: 3, cacheWrite: 1, total: 16 }
    const held = new HeldMessageEnd()
    held.hold(usage)
    held.settle()
    held.takeUsage() // the caller consumed the payload
    held.hold() // next message without valid usage
    expect(held.settle()).toBe(true)
    expect(held.takeUsage()).toBeUndefined()
  })
})

describe('monitorSessionManager (ticket 51)', () => {
  interface FakeMessage {
    role: string
  }
  type FakeManager = { appendMessage: (message: FakeMessage) => string } & { wrapped?: boolean }

  it('reports every persisted message with its real entry id and preserves the return value', () => {
    const appended: Array<{ message: FakeMessage; entryId: string }> = []
    const manager: FakeManager = {
      appendMessage: (message) => `id-for-${message.role}`
    }
    monitorSessionManager(manager, (message, entryId) => appended.push({ message, entryId }))
    const returned = manager.appendMessage({ role: 'assistant' })
    expect(returned).toBe('id-for-assistant')
    expect(appended).toEqual([{ message: { role: 'assistant' }, entryId: 'id-for-assistant' }])
  })

  it('keeps relaying across many appends (one wrapper, many turns)', () => {
    const roles: string[] = []
    const manager: FakeManager = { appendMessage: () => 'fixed' }
    monitorSessionManager(manager, (message) => roles.push(message.role))
    manager.appendMessage({ role: 'user' })
    manager.appendMessage({ role: 'assistant' })
    manager.appendMessage({ role: 'toolResult' })
    expect(roles).toEqual(['user', 'assistant', 'toolResult'])
  })
})
