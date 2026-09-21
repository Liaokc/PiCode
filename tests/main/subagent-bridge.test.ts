/**
 * Ticket 90 host-side tests: the subagent bridge's payload forwarding (the
 * additive contract events), the status.json artifact reader, and the
 * session-record asyncDir collector — the primary/live seam shapes the
 * host-contract smoke pins against the real packages.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SubagentBridge, readRunStateFromArtifact, collectSessionAsyncDirs } from '../../src/host/subagent-bridge'
import type { HostToParent, SessionScopedEvent } from '../../src/shared/contract'

type HostEvent = Exclude<SessionScopedEvent, { type: 'host_exit' }>

/** The factory-bearing view of the InlineExtension union (the bridge always
 * registers the object shape). */
type FactoryExtension = { name: string; hidden?: boolean; factory: (pi: never) => void }

/** Install the bridge's factory against a stub event bus; returns the bus's
 * emit so tests can inject pi-subagents payloads. */
function wireBus(factory: (pi: never) => void): { emit: (channel: string, data: unknown) => void } {
  const handlers = new Map<string, Array<(data: unknown) => void>>()
  factory({
    events: {
      emit: (channel: string, data: unknown) => {
        for (const handler of handlers.get(channel) ?? []) handler(data)
      },
      on: (channel: string, handler: (data: unknown) => void) => {
        handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
        return () => {}
      }
    }
  } as never)
  return {
    emit: (channel, data) => {
      for (const handler of handlers.get(channel) ?? []) handler(data)
    }
  }
}

function bridgeWithBus(sent: HostEvent[]): { emit: (channel: string, data: unknown) => void } {
  const bridge = new SubagentBridge((event) => sent.push(event))
  const ext = bridge.extension as unknown as FactoryExtension
  return wireBus(ext.factory)
}
// ---- lifecycle forwarding -------------------------------------------------

describe('lifecycle event forwarding', () => {
  it('forwards subagent:async-started as a bounded subagent_async_started', () => {
    const sent: HostEvent[] = []
    const { emit } = bridgeWithBus(sent)
    emit('subagent:async-started', {
      lifecycleArtifactVersion: 1,
      id: 'run-1',
      pid: 4242,
      sessionId: 's1',
      mode: 'single',
      agent: 'scout',
      agents: ['scout'],
      task: '[prompt redacted]',
      asyncDir: '/tmp/pi-subagents-x/async-subagent-runs/run-1'
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      type: 'subagent_async_started',
      runId: 'run-1',
      mode: 'single',
      agent: 'scout',
      agents: ['scout'],
      asyncDir: '/tmp/pi-subagents-x/async-subagent-runs/run-1'
    })
  })

  it('drops a started payload without a run id (defensive)', () => {
    const sent: HostEvent[] = []
    const { emit } = bridgeWithBus(sent)
    emit('subagent:async-started', { mode: 'single' })
    expect(sent).toHaveLength(0)
  })

  it('forwards subagent:async-complete with state/success/summary', () => {
    const sent: HostEvent[] = []
    const { emit } = bridgeWithBus(sent)
    emit('subagent:async-complete', {
      id: 'run-1',
      runId: 'run-1',
      success: true,
      state: 'complete',
      summary: 'All three files reviewed.',
      durationMs: 42_000,
      triggerTurn: true,
      intercomDelivered: false
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'subagent_async_completed',
      runId: 'run-1',
      state: 'complete',
      success: true,
      summary: 'All three files reviewed.',
      durationMs: 42_000
    })
    // The one-shot bookkeeping fields never enter the contract.
    expect(JSON.stringify(sent[0])).not.toContain('triggerTurn')
    expect(JSON.stringify(sent[0])).not.toContain('intercomDelivered')
  })

  it('forwards subagent:foreground-complete (detached foreground terminal evidence)', () => {
    const sent: HostEvent[] = []
    const { emit } = bridgeWithBus(sent)
    emit('subagent:foreground-complete', {
      id: 'fg-1:0',
      runId: 'fg-1',
      source: 'foreground',
      mode: 'single',
      agent: 'scout',
      success: true,
      state: 'complete',
      summary: 'done',
      taskIndex: 0,
      sessionId: 's1'
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'subagent_foreground_completed',
      runId: 'fg-1',
      mode: 'single',
      agent: 'scout',
      success: true,
      state: 'complete',
      summary: 'done',
      taskIndex: 0
    })
  })

  it('forwards subagent:child-status with the bounded hint shape', () => {
    const sent: HostEvent[] = []
    const { emit } = bridgeWithBus(sent)
    emit('subagent:child-status', {
      type: 'subagent.child-status',
      version: 1,
      runId: 'run-1',
      childId: 'step:0',
      status: 'stopping',
      ts: 1234,
      source: 'rpc',
      agent: 'worker',
      stepIndex: 0
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      type: 'subagent_child_status',
      runId: 'run-1',
      childId: 'step:0',
      status: 'stopping',
      ts: 1234,
      agent: 'worker',
      stepIndex: 0
    })
    // Malformed statuses never forward.
    const sent2: HostEvent[] = []
    const { emit: emit2 } = bridgeWithBus(sent2)
    emit2('subagent:child-status', { runId: 'r', childId: 'c', status: 'running', ts: 1 })
    expect(sent2).toHaveLength(0)
  })
})

// ---- the status command -----------------------------------------------------

describe('subagent_status handling', () => {
  it('answers available:false when the pi-subagents bus never wired', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event))
    await bridge.handleStatusRequest('req-1', () => [])
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'subagent_status', requestId: 'req-1', available: false, runs: [], fleet: null })
  })

  it('answers with artifact-derived runs and the fleet DTO from the RPC', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'picode-bridge-test-'))
    try {
      const runDir = path.join(dir, 'async-subagent-runs', 'run-9')
      mkdirSync(runDir, { recursive: true })
      writeFileSync(
        path.join(runDir, 'status.json'),
        JSON.stringify({ runId: 'run-9', mode: 'single', state: 'running', startedAt: 1000, sessionId: '/x/s.jsonl', agents: ['scout'] })
      )
      const sent: HostEvent[] = []
      // Wire the bridge to a bus that CAPTURES the RPC request and answers
      // it asynchronously with a successful untargeted status reply (the
      // in-memory path shape pi-subagents returns).
      const capturingBridge = new SubagentBridge((event) => sent.push(event))
      const { factory } = capturingBridge.extension as unknown as FactoryExtension
      const handlers = new Map<string, Array<(data: unknown) => void>>()
      factory({
        events: {
          emit: (channel: string, data: unknown) => {
            if (channel === 'subagents:rpc:v1:request') {
              const request = data as { requestId: string }
              // A successful untargeted status reply (in-memory path shape).
              const reply = {
                version: 1,
                requestId: request.requestId,
                method: 'status',
                success: true,
                data: {
                  text: 'In-memory subagent status: 0 active children.',
                  details: { mode: 'management', results: [] },
                  fleet: {
                    version: 1,
                    entries: [
                      { key: 'fleet-1', agent: 'scout', startedAt: 500, tokens: { input: 10, output: 5, total: 15 }, goal: 'Go' }
                    ],
                    totalActive: 1,
                    topLevelAsyncCapacity: { used: 0, limit: 4 },
                    omitted: 0
                  },
                  asyncSnapshot: { kind: 'pi-subagents.async-status-snapshot', version: 1, generatedAt: 1, caps: {}, omitted: { runs: 0, children: 0, byteLimitExceeded: false }, runs: [] }
                }
              }
              queueMicrotask(() => {
                for (const handler of handlers.get(`subagents:rpc:v1:reply:${request.requestId}`) ?? []) handler(reply)
              })
            }
            for (const handler of handlers.get(channel) ?? []) handler(data)
          },
          on: (channel: string, handler: (data: unknown) => void) => {
            handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
            return () => {}
          }
        }
      } as never)
      await capturingBridge.handleStatusRequest('req-2', () => [runDir])
      expect(sent).toHaveLength(1)
      const reply = sent[0]
      if (reply.type !== 'subagent_status') throw new Error('wrong event')
      expect(reply.available).toBe(true)
      expect(reply.runs).toEqual([
        { runId: 'run-9', state: 'running', startedAt: 1000, mode: 'single', agents: ['scout'] }
      ])
      expect(reply.fleet).toMatchObject({ entries: [{ key: 'fleet-1', agent: 'scout' }], totalActive: 1 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---- the steer command (ticket 99) ------------------------------------------
// Ticket 111: the happy-path fixtures now carry the REAL 0.70.1 steer reply
// shape (live-probe evidence): the steering receipt rides
// data.details.steering (management-action result shape), not a top-level
// deliveryStatus field. The top-level fallback stays covered below.

describe('subagent_steer handling', () => {
  it('sends the acknowledged-delivery receipt (delivered) with the RPC params verbatim', async () => {
    let captured: { requestId: string; method: string; params: Record<string, unknown> } | null = null
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            captured = data as { requestId: string; method: string; params: Record<string, unknown> }
            const req = captured
            queueMicrotask(() => {
              for (const handler of handlers.get(`subagents:rpc:v1:reply:${req.requestId}`) ?? []) {
                handler({ version: 1, requestId: req.requestId, success: true, data: { content: [{ type: 'text', text: 'Steering delivered for async run run-1.' }], details: { mode: 'management', results: [], steering: { requestId: 'pi-r-1', state: 'delivered', deliveryStatus: 'delivered', sourceRunId: 'run-1', targets: [{ index: 0, state: 'pending' }] } } } })
              }
            })
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleSteerRequest('req-s1', 'run-1', 'Focus on the auth bypass')
    expect(captured).not.toBeNull()
    expect(captured!.method).toBe('steer')
    expect(captured!.params).toMatchObject({ id: 'run-1', message: 'Focus on the auth bypass' })
    expect(sent).toEqual([
      { type: 'subagent_steer_receipt', requestId: 'req-s1', asyncId: 'run-1', ok: true, deliveryStatus: 'delivered' }
    ])
  })

  it('queued deliveries ride the same receipt shape', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            const req = data as { requestId: string }
            queueMicrotask(() => {
              for (const handler of handlers.get(`subagents:rpc:v1:reply:${req.requestId}`) ?? []) {
                handler({ version: 1, requestId: req.requestId, success: true, data: { content: [{ type: 'text', text: 'Steering scheduled.' }], details: { mode: 'management', results: [], steering: { requestId: 'pi-r-2', state: 'scheduled', deliveryStatus: 'queued', sourceRunId: 'run-2', targets: [{ index: 0, state: 'scheduled' }] } } } })
              }
            })
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleSteerRequest('req-s2', 'run-2', 'Also check the docs')
    expect(sent).toEqual([
      { type: 'subagent_steer_receipt', requestId: 'req-s2', asyncId: 'run-2', ok: true, deliveryStatus: 'queued' }
    ])
  })

  it('a bare top-level deliveryStatus still lands (tolerant fallback, unknown-field rule)', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            const req = data as { requestId: string }
            queueMicrotask(() => {
              for (const handler of handlers.get(`subagents:rpc:v1:reply:${req.requestId}`) ?? []) {
                handler({ version: 1, requestId: req.requestId, success: true, data: { deliveryStatus: 'queued', state: 'scheduled' } })
              }
            })
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleSteerRequest('req-s2b', 'run-2b', 'Also check the docs')
    expect(sent).toEqual([
      { type: 'subagent_steer_receipt', requestId: 'req-s2b', asyncId: 'run-2b', ok: true, deliveryStatus: 'queued' }
    ])
  })

  it('the RPC error reply rides the receipt verbatim (unknown run / foreign session / ended run)', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            const req = data as { requestId: string }
            queueMicrotask(() => {
              for (const handler of handlers.get(`subagents:rpc:v1:reply:${req.requestId}`) ?? []) {
                handler({ version: 1, requestId: req.requestId, success: false, error: { code: 'not_found', message: 'no such async run' } })
              }
            })
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleSteerRequest('req-s3', 'ghost', 'hello?')
    expect(sent).toEqual([
      { type: 'subagent_steer_receipt', requestId: 'req-s3', asyncId: 'ghost', ok: false, error: 'no such async run' }
    ])
  })

  it('a success reply without a usable deliveryStatus lands as an honest failure (no invented claim)', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            const req = data as { requestId: string }
            queueMicrotask(() => {
              for (const handler of handlers.get(`subagents:rpc:v1:reply:${req.requestId}`) ?? []) {
                handler({ version: 1, requestId: req.requestId, success: true, data: { unexpected: true } })
              }
            })
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleSteerRequest('req-s4', 'run-4', 'hello')
    expect(sent).toHaveLength(1)
    const receipt = sent[0]
    if (receipt.type !== 'subagent_steer_receipt') throw new Error('wrong event')
    expect(receipt.ok).toBe(false)
    expect(receipt.error).toContain('delivery status')
  })

  it('an unanswered RPC times out into a failed receipt (the tab never hangs)', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 20)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleSteerRequest('req-s5', 'run-5', 'anyone there?')
    expect(sent).toHaveLength(1)
    const receipt = sent[0]
    if (receipt.type !== 'subagent_steer_receipt') throw new Error('wrong event')
    expect(receipt.ok).toBe(false)
    expect(receipt.error).toContain('timed out')
  })

  it('an unwired bus answers a failed receipt immediately', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event))
    await bridge.handleSteerRequest('req-s6', 'run-6', 'hello')
    expect(sent).toHaveLength(1)
    const receipt = sent[0]
    if (receipt.type !== 'subagent_steer_receipt') throw new Error('wrong event')
    expect(receipt.ok).toBe(false)
    expect(receipt.error).toContain('unavailable')
  })

  it('an empty message never reaches the RPC (failed receipt, no request)', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event))
    await bridge.handleSteerRequest('req-s7', 'run-7', '   ')
    expect(sent).toEqual([
      { type: 'subagent_steer_receipt', requestId: 'req-s7', asyncId: 'run-7', ok: false, error: 'the steer message is empty' }
    ])
  })
})

// ---- the artifact reader ----------------------------------------------------

describe('readRunStateFromArtifact', () => {
  it('reads the envelope fields and folds the nested children count', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'picode-bridge-test-'))
    try {
      writeFileSync(
        path.join(dir, 'status.json'),
        JSON.stringify({
          lifecycleArtifactVersion: 1,
          runId: 'run-2',
          mode: 'workflow',
          state: 'running',
          startedAt: 10,
          currentTool: 'bash',
          activityState: 'active',
          nestedChildren: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }]
        })
      )
      const run = readRunStateFromArtifact(dir)
      expect(run).toMatchObject({ runId: 'run-2', state: 'running', nestedCount: 3, currentTool: 'bash' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null for a missing/corrupt artifact and for unknown states', () => {
    expect(readRunStateFromArtifact('/nonexistent/run')).toBeNull()
    const dir = mkdtempSync(path.join(tmpdir(), 'picode-bridge-test-'))
    try {
      writeFileSync(path.join(dir, 'status.json'), 'not json')
      expect(readRunStateFromArtifact(dir)).toBeNull()
      writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ runId: 'r', state: 'flying' }))
      expect(readRunStateFromArtifact(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---- the asyncDir collector (host-side replay walk) -------------------------

describe('collectSessionAsyncDirs', () => {
  it('collects the asyncDirs the session record names, deduplicated', () => {
    const entries = [
      { type: 'session', id: 'h' },
      {
        type: 'message',
        id: 'e1',
        message: {
          role: 'toolResult',
          toolCallId: 't1',
          toolName: 'subagent',
          isError: false,
          details: { mode: 'single', runId: 'r1', asyncId: 'r1', asyncDir: '/tmp/x/runs/r1', results: [] }
        }
      },
      {
        type: 'message',
        id: 'e2',
        message: {
          role: 'toolResult',
          toolCallId: 't2',
          toolName: 'subagent',
          isError: false,
          details: { mode: 'single', runId: 'r2', asyncId: 'r2', asyncDir: '/tmp/x/runs/r1', results: [] }
        }
      },
      {
        type: 'message',
        id: 'e3',
        message: { role: 'toolResult', toolCallId: 't3', toolName: 'bash', isError: false, details: { exitCode: 0 } }
      }
    ]
    expect(collectSessionAsyncDirs(entries)).toEqual(['/tmp/x/runs/r1'])
  })
})

// keep the import used (contract types referenced in assertions above)
describe('contract shapes', () => {
  it('the forwarded events stay session-scoped events', () => {
    const event: HostToParent = {
      type: 'session_event',
      sessionId: 's',
      event: { type: 'subagent_child_status', runId: 'r', childId: 'c', status: 'stopped', ts: 1 }
    }
    expect(event.type).toBe('session_event')
  })
})

// ---- ticket 101: the stop receipt (the stop control channel's UI seam) ------

describe('subagent_stop handling', () => {
  /** A bus whose RPC `stop` answers with `reply` (a function of requestId so
   * tests can vary per-call). */
  function stopBus(sent: HostEvent[], reply: (requestId: string) => unknown): SubagentBridge {
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            const req = data as { requestId: string }
            queueMicrotask(() => {
              for (const handler of handlers.get(`subagents:rpc:v1:reply:${req.requestId}`) ?? []) handler(reply(req.requestId))
            })
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    return bridge
  }

  it('an accepted stop lands as ok:true state stopping (the receipt is the assertion)', async () => {
    const sent: HostEvent[] = []
    const bridge = stopBus(sent, () => ({ version: 1, requestId: 'pi-r-1', success: true, data: { runId: 'run-1', asyncDir: '/tmp/run-1', previousState: 'running', state: 'stopping', message: 'Stop requested for async run run-1.' } }))
    await bridge.handleStopRequest('req-stop-1', 'run-1')
    expect(sent).toEqual([{ type: 'subagent_stop_receipt', requestId: 'req-stop-1', asyncId: 'run-1', ok: true, state: 'stopping' }])
  })

  it('the RPC request carries method stop with the async id as the target', async () => {
    let captured: { method: string; params: Record<string, unknown> } | null = null
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            const req = data as { requestId: string; method: string; params: Record<string, unknown> }
            captured = { method: req.method, params: req.params }
            queueMicrotask(() => {
              for (const handler of handlers.get(`subagents:rpc:v1:reply:${req.requestId}`) ?? []) {
                handler({ version: 1, requestId: req.requestId, success: true, data: { state: 'stopping' } })
              }
            })
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleStopRequest('req-stop-1', 'run-1')
    expect(captured).toEqual({ method: 'stop', params: { id: 'run-1' } })
    expect(sent).toEqual([{ type: 'subagent_stop_receipt', requestId: 'req-stop-1', asyncId: 'run-1', ok: true, state: 'stopping' }])
  })

  it('an RPC error reply rides the receipt verbatim (unknown run / ended run / foreign session)', async () => {
    const sent: HostEvent[] = []
    const bridge = stopBus(sent, () => ({ version: 1, requestId: 'pi-r-1', success: false, error: { code: 'invalid_state', message: 'Async run run-1 is complete; stop only supports running async runs.' } }))
    await bridge.handleStopRequest('req-stop-2', 'run-1')
    expect(sent).toEqual([
      { type: 'subagent_stop_receipt', requestId: 'req-stop-2', asyncId: 'run-1', ok: false, error: 'Async run run-1 is complete; stop only supports running async runs.' }
    ])
  })

  it('an unanswered RPC times out into a failed receipt (the stop UI never hangs)', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 50)
    const { factory } = bridge.extension as unknown as FactoryExtension
    const handlers = new Map<string, Array<(data: unknown) => void>>()
    factory({
      events: {
        emit: (channel: string, data: unknown) => {
          if (channel === 'subagents:rpc:v1:request') {
            const req = data as { requestId: string }
            handlers.set(`subagents:rpc:v1:reply:${req.requestId}`, [])
          }
          for (const handler of handlers.get(channel) ?? []) handler(data)
        },
        on: (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, [...(handlers.get(channel) ?? []), handler])
          return () => {}
        }
      }
    } as never)
    await bridge.handleStopRequest('req-stop-3', 'run-1')
    expect(sent).toEqual([{ type: 'subagent_stop_receipt', requestId: 'req-stop-3', asyncId: 'run-1', ok: false, error: 'the stop request timed out (pi-subagents did not answer)' }])
  })

  it('an unwired bus answers a failed receipt immediately', async () => {
    const sent: HostEvent[] = []
    const bridge = new SubagentBridge((event) => sent.push(event), 100)
    await bridge.handleStopRequest('req-stop-4', 'run-1')
    expect(sent).toEqual([{ type: 'subagent_stop_receipt', requestId: 'req-stop-4', asyncId: 'run-1', ok: false, error: 'the subagent bridge is unavailable (no session bus)' }])
  })

  it('a success reply without a stopping state lands as an honest failure (no invented claim)', async () => {
    const sent: HostEvent[] = []
    const bridge = stopBus(sent, () => ({ version: 1, requestId: 'pi-r-1', success: true, data: { runId: 'run-1' } }))
    await bridge.handleStopRequest('req-stop-5', 'run-1')
    expect(sent).toEqual([{ type: 'subagent_stop_receipt', requestId: 'req-stop-5', asyncId: 'run-1', ok: false, error: 'the stop reply carried no stopping state' }])
  })
})
