import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SettingsService } from '../../src/main/settings/service'
import { DEFAULT_PREFERENCES } from '../../src/shared/preferences'
import type { AuthProbeReport } from '../../src/shared/auth-status'

const report = (providers: AuthProbeReport['providers'], error: string | null = null): AuthProbeReport => ({
  scannedAt: 1_800_000_000_000,
  providers,
  models: [],
  error
})

function serviceFile(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'picode-settings-')), 'settings.json')
}

describe('SettingsService', () => {
  it('serves the defaults when the file is missing or corrupt', async () => {
    const file = serviceFile()
    writeFileSync(file, '{ not json')
    expect((await new SettingsService({ file, probe: async () => report([]) }).getSnapshot()).preferences).toEqual(
      DEFAULT_PREFERENCES
    )
    const missing = new SettingsService({ file: path.join(file, 'nested', 'settings.json'), probe: async () => report([]) })
    expect((await missing.getSnapshot()).preferences).toEqual(DEFAULT_PREFERENCES)
    expect((await missing.getSnapshot()).lastUsedDirectory).toBeNull()
  })

  it('loads persisted preferences and the last used directory', async () => {
    const file = serviceFile()
    writeFileSync(
      file,
      JSON.stringify({
        // A pre-ticket-17 document: 'ask' must migrate to 'last-used';
        // pre-ticket-19 documents have no hiddenGroups at all.
        preferences: { defaultThinkingLevel: 'high', newTaskDirectory: 'ask' },
        lastUsedDirectory: '/Users/dev/projects/api-server'
      })
    )
    const service = new SettingsService({ file, probe: async () => report([]) })
    const snapshot = await service.getSnapshot()
    expect(snapshot.preferences).toEqual({
      defaultModel: null,
      defaultThinkingLevel: 'high',
      newTaskDirectory: 'last-used',
      newTaskFixedProject: null,
      hiddenGroups: [],
      archivedSessions: [],
      readStates: {},
      recentlyClosedTabs: [],
      // Pre-ticket-33 documents have no dropdown choice — the defaults apply.
      sidebarView: 'projects',
      sidebarSort: 'updated',
      // Pre-ticket-84 documents have no drag arrangement — the empty order.
      sidebarManualOrder: { groups: [], sessions: {} },
      // Pre-ticket-29 documents have no pane widths — the defaults apply.
      sidebarWidth: 320,
      panelWidth: 420
    })
    expect(snapshot.lastUsedDirectory).toBe('/Users/dev/projects/api-server')
  })

  it('merges patches, persists them, and survives a reload', async () => {
    const file = serviceFile()
    const service = new SettingsService({ file, probe: async () => report([]) })
    const merged = await service.setPreferences({ defaultModel: { providerId: 'bella', modelId: 'GLM-5.3' } })
    expect(merged.defaultModel).toEqual({ providerId: 'bella', modelId: 'GLM-5.3' })
    // A fresh service instance reads the same document back.
    const reloaded = new SettingsService({ file, probe: async () => report([]) })
    expect((await reloaded.getSnapshot()).preferences.defaultModel).toEqual({
      providerId: 'bella',
      modelId: 'GLM-5.3'
    })
    // Invalid patch fields are dropped by the merge.
    await service.setPreferences({ newTaskDirectory: 'whenever' })
    expect((await service.getSnapshot()).preferences.newTaskDirectory).toBe('last-used')
  })

  it('keeps concurrent patches from losing each other\u2019s fields', async () => {
    const file = serviceFile()
    const service = new SettingsService({ file, probe: async () => report([]) })
    await Promise.all([
      service.setPreferences({ defaultThinkingLevel: 'low' }),
      service.setPreferences({ newTaskDirectory: 'last-used' })
    ])
    const prefs = (await service.getSnapshot()).preferences
    expect(prefs.defaultThinkingLevel).toBe('low')
    expect(prefs.newTaskDirectory).toBe('last-used')
  })

  it('records the last used directory immediately (survives a crash)', async () => {
    const file = serviceFile()
    const service = new SettingsService({ file, probe: async () => report([]) })
    await service.recordLastUsedDirectory('/tmp/proj')
    expect(JSON.parse(readFileSync(file, 'utf-8')).lastUsedDirectory).toBe('/tmp/proj')
    expect((await service.getSnapshot()).lastUsedDirectory).toBe('/tmp/proj')
  })

  it('caches the auth report and re-probes only on force', async () => {
    const file = serviceFile()
    const probe = vi.fn(async () =>
      report([{ providerId: 'anthropic', name: 'Anthropic', modelCount: 1, authType: 'api_key', source: 'ANTHROPIC_API_KEY', oauthExpiresAt: null }])
    )
    const service = new SettingsService({ file, probe })
    const first = await service.authReport()
    const second = await service.authReport()
    expect(probe).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    const forced = await service.authReport(true)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(forced.providers).toHaveLength(1)
    expect(service.cachedAuthReport()).toEqual(forced)
  })

  it('surfaces probe failures as an error report instead of throwing', async () => {
    const file = serviceFile()
    const probe = vi.fn(async () => {
      throw new Error('probe host died')
    })
    const service = new SettingsService({ file, probe })
    const failed = await service.authReport()
    expect(failed.error).toBe('probe host died')
    expect(failed.providers).toEqual([])
    // The failure is cached until a forced refresh.
    expect((await service.authReport()).error).toBe('probe host died')
    expect(probe).toHaveBeenCalledTimes(1)
  })
})
