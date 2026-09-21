import { describe, expect, it } from 'vitest'
import type { AuthProbeReport, ModelCatalogEntry, ProviderAuthStatus } from '../../src/shared/auth-status'
import type { ProviderModels } from '../../src/shared/contract'
import { configuredProviderIds, configuredProvidersOnly, sortProvidersConfiguredFirst } from '../../src/shared/provider-sort.ts'
import { projectNewTaskCatalog } from '../../src/shared/new-task-models.ts'

// ---- fixtures (ticket 76: the probe report is the only credential source) ----

function provider(providerId: string, authType: ProviderAuthStatus['authType'], name = providerId): ProviderAuthStatus {
  return { providerId, name, modelCount: 0, authType, source: authType === null ? null : 'KEY', oauthExpiresAt: null }
}

function model(providerId: string, modelId: string, name = modelId): ModelCatalogEntry {
  return { providerId, modelId, name }
}

function report(parts: {
  providers?: ProviderAuthStatus[]
  models?: ModelCatalogEntry[]
  error?: string | null
}): AuthProbeReport {
  return {
    scannedAt: 1_700_000_000_000,
    providers: parts.providers ?? [],
    models: parts.models ?? [],
    error: parts.error ?? null
  }
}

/** The pi16-settings-providers shape: registry order puts the configured
 * lowercase provider (bella) last; the fix must float it to the top. */
const MIXED_REPORT = report({
  providers: [
    provider('anthropic', 'oauth', 'Anthropic'),
    provider('openai', 'api_key', 'OpenAI'),
    provider('google', 'oauth', 'Google'),
    provider('bella', 'api_key', 'Bella'),
    provider('github-copilot', null, 'GitHub Copilot'),
    provider('zai', null, 'Z.ai')
  ]
})

describe('configuredProviderIds', () => {
  it('returns null for a missing report', () => {
    expect(configuredProviderIds(null)).toBeNull()
  })

  it('returns null for an error report (providers cannot be trusted)', () => {
    expect(configuredProviderIds(report({ error: 'probe failed' }))).toBeNull()
  })

  it('returns null for an empty report', () => {
    expect(configuredProviderIds(report({}))).toBeNull()
  })

  it('collects every provider holding a credential (api key or oauth, incl. expired)', () => {
    const ids = configuredProviderIds(MIXED_REPORT)
    expect([...(ids ?? [])].sort()).toEqual(['anthropic', 'bella', 'google', 'openai'])
  })

  it('returns an empty set when the report is healthy but nothing is configured', () => {
    const ids = configuredProviderIds(report({ providers: [provider('anthropic', null, 'Anthropic')] }))
    expect(ids).not.toBeNull()
    expect(ids?.size).toBe(0)
  })
})

describe('sortProvidersConfiguredFirst', () => {
  it('puts configured providers first, unconfigured after, alphabetical within each group', () => {
    const sorted = sortProvidersConfiguredFirst(MIXED_REPORT.providers, configuredProviderIds(MIXED_REPORT))
    expect(sorted.map((p) => p.providerId)).toEqual([
      'anthropic', // configured, A
      'bella', // configured — floats to the top group (pi16-settings-providers fix)
      'google', // configured (expired OAuth still holds a credential)
      'openai', // configured
      'github-copilot', // unconfigured, alphabetical
      'zai' // unconfigured
    ])
  })

  it('degrades to the incoming order when the report is missing', () => {
    const rows = [provider('zai', null, 'Z.ai'), provider('anthropic', 'oauth', 'Anthropic')]
    const sorted = sortProvidersConfiguredFirst(rows, null)
    expect(sorted.map((p) => p.providerId)).toEqual(['zai', 'anthropic'])
  })

  it('sorts case-insensitively within a group (registry casing never sinks a name)', () => {
    const rows = [
      provider('zai', null, 'zai'),
      provider('anthropic', null, 'Anthropic'),
      provider('bella', null, 'Bella')
    ]
    const sorted = sortProvidersConfiguredFirst(rows, new Set())
    expect(sorted.map((p) => p.providerId)).toEqual(['anthropic', 'bella', 'zai'])
  })

  it('breaks display-name ties by provider id', () => {
    const rows = [provider('b-two', null, 'Same'), provider('b-one', null, 'Same')]
    const sorted = sortProvidersConfiguredFirst(rows, new Set())
    expect(sorted.map((p) => p.providerId)).toEqual(['b-one', 'b-two'])
  })

  it('does not mutate the input and keeps nested model lists untouched', () => {
    const groups: ProviderModels[] = [
      { providerId: 'zai', name: 'Z.ai', models: [{ providerId: 'zai', modelId: 'm1', name: 'M1' }] },
      { providerId: 'bella', name: 'Bella', models: [{ providerId: 'bella', modelId: 'm2', name: 'M2' }] }
    ]
    const sorted = sortProvidersConfiguredFirst(groups, new Set(['bella']))
    expect(sorted.map((g) => g.providerId)).toEqual(['bella', 'zai'])
    // The model column rides its group by reference — never reordered (the
    // ticket's 模型列内不重排).
    expect(sorted[0]!.models).toBe(groups[1]!.models)
    expect(groups.map((g) => g.providerId)).toEqual(['zai', 'bella'])
  })
})

describe('configuredProvidersOnly (ticket 121: the new-task menu speaks the session surface list)', () => {
  it('keeps only the configured providers, alphabetical among them', () => {
    const filtered = configuredProvidersOnly(MIXED_REPORT.providers, configuredProviderIds(MIXED_REPORT))
    expect(filtered.map((p) => p.providerId)).toEqual(['anthropic', 'bella', 'google', 'openai'])
  })

  it('drops every provider when the report is healthy but nothing is configured', () => {
    const rows = [provider('anthropic', null, 'Anthropic'), provider('zai', null, 'Z.ai')]
    expect(configuredProvidersOnly(rows, new Set())).toEqual([])
  })

  it('degrades to the incoming order when the report is missing', () => {
    const rows = [provider('zai', null, 'Z.ai'), provider('anthropic', 'oauth', 'Anthropic')]
    expect(configuredProvidersOnly(rows, null).map((p) => p.providerId)).toEqual(['zai', 'anthropic'])
  })

  it('sorts case-insensitively with the provider id as the tiebreaker', () => {
    const rows = [
      provider('zai-gluon', 'api_key', 'zai gluon'),
      provider('b-two', 'api_key', 'Same'),
      provider('b-one', 'api_key', 'Same'),
      provider('bella', 'api_key', 'Bella')
    ]
    const configured = new Set(['zai-gluon', 'b-two', 'b-one', 'bella'])
    expect(configuredProvidersOnly(rows, configured).map((p) => p.providerId)).toEqual([
      'bella',
      'b-one',
      'b-two',
      'zai-gluon'
    ])
  })

  it('does not mutate the input and keeps nested model lists untouched', () => {
    const groups: ProviderModels[] = [
      { providerId: 'zai', name: 'Z.ai', models: [{ providerId: 'zai', modelId: 'm1', name: 'M1' }] },
      { providerId: 'bella', name: 'Bella', models: [{ providerId: 'bella', modelId: 'm2', name: 'M2' }] }
    ]
    const filtered = configuredProvidersOnly(groups, new Set(['bella']))
    expect(filtered.map((g) => g.providerId)).toEqual(['bella'])
    // The model column rides its group by reference — never reordered.
    expect(filtered[0]!.models).toBe(groups[1]!.models)
    expect(groups.map((g) => g.providerId)).toEqual(['zai', 'bella'])
  })
})

describe('new-task join (projectNewTaskCatalog + sort)', () => {
  it('sorts the projected cascade the way the empty-state menu renders it', () => {
    const full = report({
      providers: MIXED_REPORT.providers,
      models: [
        model('anthropic', 'claude-opus-4-5'),
        model('bella', 'GLM-5.3'),
        model('openai', 'gpt-5.1'),
        model('github-copilot', 'gpt-4.1'),
        model('google', 'gemini-3-pro'),
        model('zai', 'glm-4.6')
      ]
    })
    const catalog = projectNewTaskCatalog(full)
    const sorted = sortProvidersConfiguredFirst(catalog.providers, configuredProviderIds(full))
    // Pi's fallback stays the first configured provider in REPORT order —
    // sorting the display list must not move it.
    expect(catalog.piFallback?.providerId).toBe('anthropic')
    expect(sorted.map((g) => g.providerId)).toEqual([
      'anthropic',
      'bella',
      'google',
      'openai',
      'github-copilot',
      'zai'
    ])
  })
})

describe('new-task join (ticket 121: configured-only, the in-session parity)', () => {
  it('renders the same configured-only column the in-session menu would show', () => {
    const full = report({
      providers: MIXED_REPORT.providers,
      models: [
        model('anthropic', 'claude-opus-4-5'),
        model('bella', 'GLM-5.3'),
        model('openai', 'gpt-5.1'),
        model('github-copilot', 'gpt-4.1'),
        model('google', 'gemini-3-pro'),
        model('zai', 'glm-4.6')
      ]
    })
    const catalog = projectNewTaskCatalog(full)
    const configured = configuredProviderIds(full)
    const newTask = configuredProvidersOnly(catalog.providers, configured)
    // The in-session surface sorts its configured-only host list with the
    // ticket-76 rule — same set, same alphabetical order, so both menus
    // render the identical column.
    const inSession = sortProvidersConfiguredFirst(catalog.providers, configured).filter((group) =>
      configured?.has(group.providerId)
    )
    expect(newTask.map((g) => g.providerId)).toEqual(['anthropic', 'bella', 'google', 'openai'])
    expect(newTask.map((g) => g.providerId)).toEqual(inSession.map((g) => g.providerId))
    // Pi's fallback stays inside the filtered list — the chip's chained
    // default is always a listed provider.
    expect(catalog.piFallback?.providerId).toBe('anthropic')
    expect(newTask.some((group) => group.providerId === catalog.piFallback?.providerId)).toBe(true)
  })

  it('empties the menu when the catalog holds only unconfigured providers (the hint state)', () => {
    const full = report({
      providers: [provider('anthropic', null, 'Anthropic'), provider('zai', null, 'Z.ai')],
      models: [model('anthropic', 'claude-opus-4-5'), model('zai', 'glm-4.6')]
    })
    const catalog = projectNewTaskCatalog(full)
    // The raw catalog is NOT empty (the ticket-41 hint chain used to stop
    // here) — but the configured-only menu is, so the "No models
    // configured" hint takes over instead of a blank panel.
    expect(catalog.providers.length).toBe(2)
    expect(configuredProvidersOnly(catalog.providers, configuredProviderIds(full))).toEqual([])
    expect(catalog.piFallback).toBeNull()
  })
})
