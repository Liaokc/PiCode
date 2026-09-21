/**
 * Ticket 111: the async-runner package-root override (the only host-side
 * drift fix the 0.70.x re-verification produced). Table-driven on the
 * setter's contract: idempotent, operator override wins, asar layouts
 * refuse (the detached runner is a plain node process that cannot read
 * asar — pi-subagents keeps its own fail-closed spawn error there).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { ensureSubagentRunnerPackageRoot, SUBAGENT_RUNNER_PACKAGE_ROOT_ENV } from '../../src/host/subagent-runner-root'

const ENV_KEY = SUBAGENT_RUNNER_PACKAGE_ROOT_ENV
const saved = (): string | undefined => process.env[ENV_KEY]

afterEach(() => {
  delete process.env[ENV_KEY]
})

describe('ensureSubagentRunnerPackageRoot', () => {
  it('sets the env to the resolved SDK package dir', () => {
    ensureSubagentRunnerPackageRoot('/app/node_modules/@earendil-works/pi-coding-agent')
    expect(saved()).toBe('/app/node_modules/@earendil-works/pi-coding-agent')
  })

  it('is idempotent — the first value sticks', () => {
    process.env[ENV_KEY] = '/operator/override'
    ensureSubagentRunnerPackageRoot('/app/node_modules/@earendil-works/pi-coding-agent')
    expect(saved()).toBe('/operator/override')
  })

  it('an explicit operator override wins (the setter never overwrites)', () => {
    process.env[ENV_KEY] = '/operator/override'
    ensureSubagentRunnerPackageRoot('/somewhere/else')
    expect(saved()).toBe('/operator/override')
  })

  it.each([
    ['posix asar', '/app.asar/node_modules/@earendil-works/pi-coding-agent'],
    ['windows asar', 'C:\\app.asar\\node_modules\\@earendil-works\\pi-coding-agent']
  ])('refuses %s layouts (plain-node runners cannot read asar)', (_label, dir) => {
    ensureSubagentRunnerPackageRoot(dir)
    expect(saved()).toBeUndefined()
  })

  it('accepts app.asar.unpacked layouts (a REAL directory Electron unpacked for exactly this)', () => {
    ensureSubagentRunnerPackageRoot('/Applications/PiCode.app/Contents/Resources/app.asar.unpacked/node_modules/@earendil-works/pi-coding-agent')
    expect(saved()).toBe('/Applications/PiCode.app/Contents/Resources/app.asar.unpacked/node_modules/@earendil-works/pi-coding-agent')
  })

  it('accepts windows drive paths outside asar', () => {
    ensureSubagentRunnerPackageRoot('C:\\app\\node_modules\\@earendil-works\\pi-coding-agent')
    expect(saved()).toBe('C:\\app\\node_modules\\@earendil-works\\pi-coding-agent')
  })
})
