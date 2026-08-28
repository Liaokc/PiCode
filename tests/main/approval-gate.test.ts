import { describe, expect, it } from 'vitest'
import { ApprovalGate, type GateAnswer } from '../../src/host/approval-gate'
import type { HostToParent } from '../../src/shared/contract'

describe('ApprovalGate — tier decisions', () => {
  it('defaults to the standard tier', () => {
    expect(new ApprovalGate().getMode()).toBe('standard')
  })

  it('read-only inspection tools never ask', () => {
    const gate = new ApprovalGate()
    expect(gate.decide('read')).toBe('allow')
    expect(gate.decide('grep')).toBe('allow')
  })

  it('standard tier asks for mutating tools; full access does not', () => {
    const gate = new ApprovalGate()
    expect(gate.decide('bash')).toBe('ask')
    gate.setMode('full-access')
    expect(gate.decide('bash')).toBe('allow')
  })

  it('read-only tier denies mutating tools with an explanatory reason', () => {
    const gate = new ApprovalGate()
    gate.setMode('read-only')
    expect(gate.decide('edit')).toBe('deny')
    expect(gate.denialReason('edit')).toMatch(/Read Only/)
  })

  it('a remembered rule applies to the tier that earned it', () => {
    const gate = new ApprovalGate()
    gate.remember('bash')
    expect(gate.decide('bash')).toBe('allow')
    gate.setMode('read-only')
    expect(gate.decide('bash')).toBe('deny')
    gate.setMode('standard')
    expect(gate.decide('bash')).toBe('allow')
  })
})

describe('ApprovalGate — the ask/resolve roundtrip', () => {
  it('request emits approval_required and resolves with the renderer answer', async () => {
    const gate = new ApprovalGate()
    const events: HostToParent[] = []
    const pending = gate.request({ toolCallId: 'tc-1', toolName: 'bash', args: { command: 'ls' } }, (event) =>
      events.push(event)
    )
    expect(events).toEqual([
      { type: 'approval_required', toolCallId: 'tc-1', toolName: 'bash', args: { command: 'ls' } }
    ])
    expect(gate.pendingIds()).toEqual(['tc-1'])
    const delivered = gate.resolve('tc-1', { approved: true, reason: '', remember: true })
    expect(delivered).toBe(true)
    await expect(pending).resolves.toEqual({ approved: true, reason: '', remember: true })
    expect(gate.pendingIds()).toEqual([])
  })

  it('resolve for an unknown id reports false and leaves the waiter pending', async () => {
    const gate = new ApprovalGate()
    const pending = gate.request({ toolCallId: 'tc-1', toolName: 'bash', args: {} }, () => {})
    expect(gate.resolve('nope', { approved: true, reason: '', remember: false })).toBe(false)
    expect(gate.pendingIds()).toEqual(['tc-1'])
    gate.cancelAll('shutdown')
    await expect(pending).resolves.toMatchObject({ approved: false })
  })

  it('cancelAll resolves every pending pill as denied with the given reason', async () => {
    const gate = new ApprovalGate()
    const first = gate.request({ toolCallId: 'tc-1', toolName: 'bash', args: {} }, () => {})
    const second = gate.request({ toolCallId: 'tc-2', toolName: 'edit', args: {} }, () => {})
    gate.cancelAll('The turn ended before a decision.')
    await expect(first).resolves.toEqual({ approved: false, reason: 'The turn ended before a decision.', remember: false })
    await expect(second).resolves.toEqual({ approved: false, reason: 'The turn ended before a decision.', remember: false })
  })

  it('a resolved id can be requested again (a fresh pill for a new call)', async () => {
    const gate = new ApprovalGate()
    const first = gate.request({ toolCallId: 'tc-1', toolName: 'bash', args: {} }, () => {})
    gate.resolve('tc-1', { approved: true, reason: '', remember: false })
    await first
    const second = gate.request({ toolCallId: 'tc-2', toolName: 'bash', args: {} }, () => {})
    expect(gate.pendingIds()).toEqual(['tc-2'])
    gate.resolve('tc-2', { approved: false, reason: 'no', remember: false })
    await expect(second).resolves.toMatchObject({ approved: false })
  })
})

describe('ApprovalGate — answer shapes', () => {
  it('a denial answer carries the user reason verbatim', async () => {
    const gate = new ApprovalGate()
    const pending = gate.request({ toolCallId: 'tc-1', toolName: 'write', args: {} }, () => {})
    gate.resolve('tc-1', { approved: false, reason: 'Do not touch src/', remember: false })
    const answer: GateAnswer = await pending
    expect(answer.reason).toBe('Do not touch src/')
  })
})
