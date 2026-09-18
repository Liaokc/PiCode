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
