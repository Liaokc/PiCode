import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  PREVIEW_WATCH_DEBOUNCE_MS,
  PREVIEW_WATCH_DIR_CAP,
  PREVIEW_WATCH_EVENT_CAP,
  PreviewWatchService,
  fsPreviewWatchFactory,
  parentDirOf,
  type PreviewWatchFactory,
  type PreviewWatchHandle
} from '../../src/main/preview/watch'
import type { PreviewWatchEvent } from '../../src/shared/preview/types'

/** Captured sink events. */
function recorder(): { events: PreviewWatchEvent[]; sink: { onWatchEvent(e: PreviewWatchEvent): void } } {
  const events: PreviewWatchEvent[] = []
  return { events, sink: { onWatchEvent: (event) => events.push(event) } }
}

/** A spy factory: counts created/closed watchers and hands the test the
 * change/error triggers so events can be fired deterministically. */
function spyFactory(): {
  factory: PreviewWatchFactory
  created: number
  closed: number
  triggerOf: (cwd: string) => { change: (p: string | null) => void; error: () => void }
} {
  let created = 0
  let closed = 0
  const triggers = new Map<string, { change: (p: string | null) => void; error: () => void }>()
  const factory: PreviewWatchFactory = (cwd, onChange, onError) => {
    created++
    triggers.set(cwd, { change: onChange, error: onError })
    const handle: PreviewWatchHandle = {
      close: () => {
        closed++
        triggers.delete(cwd)
      }
    }
    return handle
  }
  return {
    factory,
    get created(): number {
      return created
    },
    get closed(): number {
      return closed
    },
    triggerOf: (cwd) => {
      const trigger = triggers.get(cwd)
      if (trigger === undefined) throw new Error(`no live watcher for ${cwd}`)
      return trigger
    }
  }
}

describe('parentDirOf (watched change → listing that must re-read)', () => {
  it.each([
    ['a.ts', '', 'a top-level file change re-reads the root listing'],
    ['src/a.ts', 'src', 'a change one level down re-reads that directory'],
    ['src/sub/b.ts', 'src/sub', 'a deep change re-reads its immediate parent only'],
    ['src\\a.ts', 'src', 'windows-style separators normalize to posix'],
    ['.git/HEAD', '.git', 'hidden-path changes map like any other']
  ] as Array<[string, string, string]>)('%s → %s (%s)', (input, expected) => {
    expect(parentDirOf(input)).toBe(expected)
  })
})

describe('PreviewWatchService coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces a burst into ONE event with deduped sorted dirs', () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    const trigger = spy.triggerOf('/work/api')
    for (let i = 0; i < 50; i++) {
      trigger.change('src/a.ts')
      trigger.change('src/b.ts')
      trigger.change('README.md')
    }
    expect(events).toEqual([])
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS + 1)
    expect(events).toEqual([{ cwd: '/work/api', dirs: ['', 'src'], overflow: false }])
    service.stop()
  })

  it('events keep arriving after a flush (the window restarts per burst)', () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    const trigger = spy.triggerOf('/work/api')
    trigger.change('a.ts')
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS + 1)
    trigger.change('b.ts')
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS + 1)
    expect(events.map((e) => e.dirs)).toEqual([[''], ['']])
    service.stop()
  })

  it('a null/unnamed change degrades to an overflow event (full refresh)', () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    spy.triggerOf('/work/api').change(null)
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS + 1)
    expect(events).toEqual([{ cwd: '/work/api', dirs: [], overflow: true }])
    service.stop()
  })

  it(`more than ${PREVIEW_WATCH_EVENT_CAP} events in one window overflow the dir payload`, () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    const trigger = spy.triggerOf('/work/api')
    for (let i = 0; i <= PREVIEW_WATCH_EVENT_CAP; i++) trigger.change(`dir-${i}/file.txt`)
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS + 1)
    expect(events).toEqual([{ cwd: '/work/api', dirs: [], overflow: true }])
    service.stop()
  })

  it(`more than ${PREVIEW_WATCH_DIR_CAP} distinct dirs overflow the dir payload`, () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    const trigger = spy.triggerOf('/work/api')
    for (let i = 0; i <= PREVIEW_WATCH_DIR_CAP; i++) trigger.change(`dir-${i}/file.txt`)
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS + 1)
    expect(events).toEqual([{ cwd: '/work/api', dirs: [], overflow: true }])
    service.stop()
  })

  it('a change after stop emits nothing', () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    service.stop()
    expect(() => spy.triggerOf('/work/api')).toThrow()
    expect(events).toEqual([])
  })

  it('a pending window is cancelled by stop (no flush after unwatch)', () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    spy.triggerOf('/work/api').change('a.ts')
    service.stop()
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS * 5)
    expect(events).toEqual([])
  })

  it('events from a CLOSED generation never reach the sink (switch race)', () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/old')
    const oldTrigger = spy.triggerOf('/work/old')
    service.start('/work/new') // replaces the watcher; old trigger is dead
    oldTrigger.change('stale.ts')
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS * 5)
    expect(events).toEqual([])
    spy.triggerOf('/work/new').change('fresh.ts')
    vi.advanceTimersByTime(PREVIEW_WATCH_DEBOUNCE_MS + 1)
    expect(events).toEqual([{ cwd: '/work/new', dirs: [''], overflow: false }])
    service.stop()
  })
})

describe('PreviewWatchService lifecycle (watcher zero-leak)', () => {
  it('ten enter/exit cycles create and close exactly ten watchers', () => {
    const spy = spyFactory()
    const { sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    for (let i = 0; i < 10; i++) {
      service.start('/work/api')
      expect(spy.created).toBe(i + 1)
      expect(spy.closed).toBe(i)
      service.stop()
      expect(spy.closed).toBe(i + 1)
    }
    expect(spy.created).toBe(spy.closed)
  })

  it('re-entering the same cwd is idempotent (StrictMode double-mount)', () => {
    const spy = spyFactory()
    const { sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/api')
    service.start('/work/api')
    expect(spy.created).toBe(1)
    service.stop()
    expect(spy.closed).toBe(1)
  })

  it('switching cwds closes the previous watcher first', () => {
    const spy = spyFactory()
    const { sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/a')
    service.start('/work/b')
    expect(spy.created).toBe(2)
    expect(spy.closed).toBe(1)
    service.stop()
    expect(spy.closed).toBe(2)
  })

  it('a watcher error closes it cleanly and the service can watch again', () => {
    const spy = spyFactory()
    const { events, sink } = recorder()
    const service = new PreviewWatchService(spy.factory, sink)
    service.start('/work/gone')
    spy.triggerOf('/work/gone').error() // e.g. the cwd vanished
    expect(spy.closed).toBe(1)
    service.start('/work/next')
    expect(spy.created).toBe(2)
    service.stop()
    expect(events).toEqual([])
  })
})

describe('fsPreviewWatchFactory (real node:fs wiring)', () => {
  let errorSpy: MockInstance<(message?: unknown) => void>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('refuses a nonexistent cwd through the error path without throwing', async () => {
    const onError = vi.fn()
    const handle = fsPreviewWatchFactory('/picode-107-does-not-exist', () => {}, onError)
    // node:fs reports ENOENT asynchronously on the watcher's error event —
    // the factory itself must not throw synchronously.
    await new Promise((r) => setTimeout(r, 100))
    handle.close()
    expect(onError).toHaveBeenCalled()
  })

  it('closes without leaking when the cwd exists', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'picode-107-watch-'))
    const seen: Array<string | null> = []
    const onChange = (p: string | null): void => {
      seen.push(p)
    }
    let onErrorCount = 0
    const handle = fsPreviewWatchFactory(dir, onChange, () => {
      onErrorCount++
    })
    // FSEvents delivery latency varies with machine load — keep writing and
    // polling instead of betting on one fixed wait.
    for (let i = 0; seen.length === 0 && i < 25; i++) {
      writeFileSync(join(dir, `probe-${i}.txt`), 'x')
      await new Promise((r) => setTimeout(r, 200))
    }
    handle.close()
    expect(onErrorCount).toBe(0)
    expect(seen.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })
})
