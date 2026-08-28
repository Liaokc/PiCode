/**
 * Terminal service tests (main process side of Seam-3): the service spawns
 * ptys through the injected factory, batches output chunks into a
 * terminal-dedicated channel (ADR-0004: pty output must not go through the
 * per-event JSON contract stream), relays input/resize, and reports exits.
 * Runs against FakePty — the real pty only ever appears in the smoke script.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TERMINAL_FLUSH_INTERVAL_MS, TerminalService } from '../../src/main/terminal/service'
import { fakePtyFactory } from '../terminal/fake-pty'

interface SinkCalls {
  data: Array<{ id: string; data: string }>
  exit: Array<{ id: string; exitCode: number; signal: string | null }>
}

function makeService(flushMs = TERMINAL_FLUSH_INTERVAL_MS): {
  service: TerminalService
  instances: ReturnType<typeof fakePtyFactory>['instances']
  calls: SinkCalls
} {
  const { factory, instances } = fakePtyFactory()
  const calls: SinkCalls = { data: [], exit: [] }
  const service = new TerminalService(factory, {
    data: (message) => calls.data.push(message),
    exit: (message) => calls.exit.push(message)
  }, flushMs)
  return { service, instances, calls }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('terminal service — output batching', () => {
  it('coalesces rapid pty chunks into one flush per interval', () => {
    const { service, instances, calls } = makeService()
    service.start('t1', { cwd: '/tmp', cols: 80, rows: 24 })

    instances[0].emit('chunk-1')
    instances[0].emit('chunk-2')
    instances[0].emit('chunk-3')
    expect(calls.data).toEqual([])

    vi.advanceTimersByTime(TERMINAL_FLUSH_INTERVAL_MS)
    expect(calls.data).toEqual([{ id: 't1', data: 'chunk-1chunk-2chunk-3' }])
  })

  it('does not stack timers while a flush is pending', () => {
    const { service, instances, calls } = makeService()
    service.start('t1', { cwd: '/tmp', cols: 80, rows: 24 })

    instances[0].emit('a')
    vi.advanceTimersByTime(TERMINAL_FLUSH_INTERVAL_MS - 1)
    instances[0].emit('b')
    vi.advanceTimersByTime(1)
    instances[0].emit('c')
    vi.advanceTimersByTime(TERMINAL_FLUSH_INTERVAL_MS)

    expect(calls.data).toEqual([
      { id: 't1', data: 'ab' },
      { id: 't1', data: 'c' }
    ])
  })

  it('flushes pending output immediately when the pty exits, then reports the exit', () => {
    const { service, instances, calls } = makeService()
    service.start('t1', { cwd: '/tmp', cols: 80, rows: 24 })

    instances[0].emit('last words')
    instances[0].emitExit({ exitCode: 0, signal: null })

    expect(calls.data).toEqual([{ id: 't1', data: 'last words' }])
    expect(calls.exit).toEqual([{ id: 't1', exitCode: 0, signal: null }])

    // No zombie timers after exit.
    vi.advanceTimersByTime(1_000)
    expect(calls.data).toHaveLength(1)
    expect(calls.exit).toHaveLength(1)
  })

  it('reports signal deaths with the signal name', () => {
    const { service, instances, calls } = makeService()
    service.start('t1', { cwd: '/tmp', cols: 80, rows: 24 })

    instances[0].emitExit({ exitCode: 1, signal: '9' })
    expect(calls.exit).toEqual([{ id: 't1', exitCode: 1, signal: '9' }])
  })
})

describe('terminal service — relay', () => {
  it('routes input to the addressed pty only', () => {
    const { service, instances } = makeService()
    service.start('a', { cwd: '/tmp', cols: 80, rows: 24 })
    service.start('b', { cwd: '/tmp', cols: 80, rows: 24 })

    service.write('a', 'who\r')
    expect(instances[0].text).toBe('who\r')
    expect(instances[1].text).toBe('')
  })

  it('routes resize to the addressed pty and validates bounds', () => {
    const { service, instances } = makeService()
    service.start('a', { cwd: '/tmp', cols: 80, rows: 24 })
    service.start('b', { cwd: '/tmp', cols: 80, rows: 24 })

    service.resize('b', 100, 30)
    expect(instances[0].resizeCount).toBe(0)
    expect(instances[1].lastResize).toEqual({ cols: 100, rows: 30 })

    service.resize('b', 0, 30)
    service.resize('b', 10.5, 30)
    expect(instances[1].resizeCount).toBe(1)
  })

  it('ignores unknown ids on every relay call', () => {
    const { service, calls } = makeService()
    expect(() => {
      service.write('ghost', 'x')
      service.resize('ghost', 10, 10)
      service.kill('ghost')
    }).not.toThrow()
    expect(calls.exit).toEqual([])
  })

  it('refuses to start a duplicate id and reports the pid for new ones', () => {
    const { service, instances } = makeService()
    const pid = service.start('t1', { cwd: '/tmp', cols: 80, rows: 24 })
    expect(pid).toBe(4242)
    expect(service.start('t1', { cwd: '/tmp', cols: 80, rows: 24 })).toBeNull()
    expect(instances).toHaveLength(1)
  })
})

describe('terminal service — lifecycle', () => {
  it('kill forwards to the pty; the exit event cleans the entry up', () => {
    const { service, instances, calls } = makeService()
    service.start('t1', { cwd: '/tmp', cols: 80, rows: 24 })

    service.kill('t1')
    expect(instances[0].killed).toBe(true)

    instances[0].emitExit({ exitCode: 143, signal: null })
    expect(calls.exit).toHaveLength(1)

    // Entry gone: late writes are dropped silently.
    expect(() => service.write('t1', 'x')).not.toThrow()
  })

  it('disposeAll kills every live pty and clears pending timers', () => {
    const { service, instances, calls } = makeService()
    service.start('a', { cwd: '/tmp', cols: 80, rows: 24 })
    service.start('b', { cwd: '/tmp', cols: 80, rows: 24 })

    instances[1].emit('pending')
    service.disposeAll()

    expect(instances.map((p) => p.killed)).toEqual([true, true])
    vi.advanceTimersByTime(1_000)
    expect(calls.data).toEqual([])
  })
})
