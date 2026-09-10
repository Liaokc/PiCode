import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandCatalogService, type CommandCatalogPush } from '../../src/main/settings/command-catalog'
import type { AuthProbeReport } from '../../src/shared/auth-status'

const report = (commands: AuthProbeReport['models'] extends never ? never : AuthProbeReport['commands'], error: string | null = null): AuthProbeReport => ({
  scannedAt: 1_800_000_000_000,
  providers: [],
  models: [],
  commands,
  error
})

describe('CommandCatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function harness(probeImpl: (cwd: string | null) => Promise<AuthProbeReport>, debounceMs = 100) {
    const probe = vi.fn(probeImpl)
    const pushed: CommandCatalogPush[] = []
    const service = new CommandCatalogService({
      probe,
      push: (payload) => pushed.push(payload),
      debounceMs
    })
    return { probe, pushed, service }
  }

  it('debounces requests: a burst of directory switches probes only the last one', async () => {
    const { probe, service } = harness(async () => report([{ name: 'x', description: 'x', source: 'prompt' as const }]))
    service.request('/a')
    service.request('/b')
    service.request('/c')
    await vi.advanceTimersByTimeAsync(150)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith('/c')
  })

  it('probes each distinct directory once and pushes its catalog (cache)', async () => {
    const { probe, pushed, service } = harness(async (cwd) =>
      report([{ name: `cmd-${cwd}`, description: 'd', source: 'prompt' as const }])
    )
    service.request('/a')
    await vi.advanceTimersByTimeAsync(150)
    service.request('/a')
    await vi.advanceTimersByTimeAsync(150)
    service.request('/b')
    await vi.advanceTimersByTimeAsync(150)
    expect(probe).toHaveBeenCalledTimes(2)
    // /a fresh, /a re-pushed from cache on the second request, /b fresh.
    expect(pushed).toHaveLength(3)
    expect(pushed[0]).toMatchObject({ cwd: '/a', commands: [{ name: 'cmd-/a' }], error: null })
    expect(pushed[1]).toMatchObject({ cwd: '/a', commands: [{ name: 'cmd-/a' }] })
    expect(pushed[2]).toMatchObject({ cwd: '/b', commands: [{ name: 'cmd-/b' }], error: null })
  })

  it('pushes the cached catalog immediately when the directory is already known', async () => {
    const { probe, pushed, service } = harness(async () => report([]))
    service.request('/a')
    await vi.advanceTimersByTimeAsync(150)
    expect(pushed).toHaveLength(1)
    service.request('/a')
    await vi.advanceTimersByTimeAsync(150)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(pushed).toHaveLength(2) // cache hit re-pushes at once, no debounce wait for the probe
  })

  it('coalesces concurrent requests for the same directory into one probe', async () => {
    let release!: (value: AuthProbeReport) => void
    const { probe, pushed, service } = harness(
      () => new Promise<AuthProbeReport>((resolve) => (release = resolve)))
    service.request('/a')
    await vi.advanceTimersByTimeAsync(150)
    service.request('/a') // while the first probe is still in flight
    await vi.advanceTimersByTimeAsync(150)
    expect(probe).toHaveBeenCalledTimes(1)
    release(report([{ name: 'late', description: 'd', source: 'skill' as const }]))
    await vi.advanceTimersByTimeAsync(0)
    expect(pushed).toHaveLength(2) // both requests get the catalog
    expect(pushed[1]).toMatchObject({ cwd: '/a', commands: [{ name: 'late', source: 'skill' }] })
  })

  it('probes the null selection separately (home-directory fallback, global resources only)', async () => {
    const { probe, pushed, service } = harness(async () => report([{ name: 'global', description: 'g', source: 'prompt' as const }]))
    service.request(null)
    await vi.advanceTimersByTimeAsync(150)
    expect(probe).toHaveBeenCalledWith(null)
    expect(pushed[0]).toMatchObject({ cwd: null, commands: [{ name: 'global' }] })
  })

  it('surfaces probe failures as an error payload with an empty catalog', async () => {
    const { pushed, service } = harness(async () => {
      throw new Error('probe host died')
    })
    service.request('/a')
    await vi.advanceTimersByTimeAsync(150)
    expect(pushed[0]).toMatchObject({ cwd: '/a', commands: [], error: 'probe host died' })
  })

  it('normalizes an invalid report into an error payload (defensive guard)', async () => {
    const { pushed, service } = harness(async () => ({ junk: true }) as unknown as AuthProbeReport)
    service.request('/a')
    await vi.advanceTimersByTimeAsync(150)
    expect(pushed[0]).toMatchObject({ cwd: '/a', commands: [], error: 'The command probe returned an invalid report.' })
  })

  it('dispose cancels a pending debounce without probing', async () => {
    const { probe, service } = harness(async () => report([]))
    service.request('/a')
    service.dispose()
    await vi.advanceTimersByTimeAsync(300)
    expect(probe).not.toHaveBeenCalled()
  })
})
