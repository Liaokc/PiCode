import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSpawnPath, hostForkEnv, initSpawnPath, whenSpawnPathReady } from '../../src/main/spawn-path'

/**
 * Ticket 141: getSpawnPath() must merge the once-cached slow facts (the
 * login-shell snapshot and the on-disk probes) with the LIVE process PATH
 * on every read. The t89 smoke relies on exactly this: it PATH-prepends an
 * `open` shim into the main process mid-run, and the next host fork — via
 * hostForkEnv() → getSpawnPath() — must see it. The startup-frozen cache
 * this test guards against swallowed such injections and made the packaged
 * verify's OAuth leg deterministically fail.
 */

let savedPath: string | undefined
let sentinel: string

beforeEach(() => {
  savedPath = process.env['PATH']
  // A real directory on disk (the merge is pure string work, but a
  // plausible shim dir keeps the fixture honest).
  sentinel = mkdtempSync(path.join(os.tmpdir(), 'picode-spawn-path-sentinel-'))
})

afterEach(() => {
  if (savedPath === undefined) delete process.env['PATH']
  else process.env['PATH'] = savedPath
  rmSync(sentinel, { recursive: true, force: true })
})

/** The composed PATH keeps the injected current PATH first, verbatim, then
 * everything the facts add — assert every entry of the injected PATH
 * (sentinel excluded — it is asserted to lead the composed string) survives
 * in order after the sentinel. */
function assertCurrentFirstVerbatim(composed: string, injected: string): void {
  expect(composed.startsWith(`${sentinel}:`)).toBe(true)
  const entries = composed.split(':')
  let cursor = 1
  const seen = new Set<string>()
  for (const entry of injected.split(':')) {
    if (entry === '' || entry === sentinel || seen.has(entry)) continue
    seen.add(entry)
    const found = entries.indexOf(entry, cursor)
    expect(found, `entry ${entry} must survive in order after the sentinel`).toBeGreaterThanOrEqual(0)
    cursor = found + 1
  }
}

describe('spawn-path live composition (ticket 141)', () => {
  it('merges a runtime PATH injection in front of the launch PATH once the facts have landed', async () => {
    initSpawnPath()
    await whenSpawnPathReady()
    const injected = `${sentinel}:${process.env['PATH'] ?? ''}`
    process.env['PATH'] = injected
    assertCurrentFirstVerbatim(getSpawnPath(), injected)
  })

  it('exposes the same live PATH through hostForkEnv()', async () => {
    initSpawnPath()
    await whenSpawnPathReady()
    process.env['PATH'] = `${sentinel}:${process.env['PATH'] ?? ''}`
    const forkEnv = hostForkEnv()
    expect(forkEnv['ELECTRON_RUN_AS_NODE']).toBe('1')
    assertCurrentFirstVerbatim(String(forkEnv['PATH']), process.env['PATH'] ?? '')
    expect(forkEnv['PATH']).toBe(getSpawnPath())
  })

  it('falls back to the live PATH verbatim before the facts have landed', async () => {
    // A fresh module registry: no initSpawnPath(), no cached facts.
    vi.resetModules()
    const fresh = await import('../../src/main/spawn-path')
    process.env['PATH'] = `${sentinel}:${process.env['PATH'] ?? ''}`
    expect(fresh.getSpawnPath()).toBe(process.env['PATH'])
  })

  it('strips stale pi-subagents child markers from the fork env (ticket 142)', () => {
    // A suite/app launched from inside a subagent session inherits the
    // runner's child markers; pi-subagents reads them as "I am a child" and
    // refuses to register its extension — the fleet RPC never answers and
    // every host degrades to available:false. The fork env is the one
    // chokepoint every host passes through: the markers die here.
    process.env['PI_SUBAGENT_CHILD'] = '1'
    process.env['PI_SUBAGENTS_HERDR_BRIDGE'] = '1'
    const forkEnv = hostForkEnv()
    expect(forkEnv['PI_SUBAGENT_CHILD']).toBeUndefined()
    expect(forkEnv['PI_SUBAGENTS_HERDR_BRIDGE']).toBeUndefined()
    // The caller's own environment is untouched (only the child's is).
    expect(process.env['PI_SUBAGENT_CHILD']).toBe('1')
    delete process.env['PI_SUBAGENT_CHILD']
    delete process.env['PI_SUBAGENTS_HERDR_BRIDGE']
  })
})
