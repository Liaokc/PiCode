import { describe, expect, it } from 'vitest'
import type { AuthProbeReport, ModelCatalogEntry, ProviderAuthStatus } from '../../src/shared/auth-status'
import { ALL_THINKING_LEVELS } from '../../src/shared/contract'
import type { SessionDefaults } from '../../src/shared/preferences'
import {
  findCatalogModel,
  mergeNewTaskDefaults,
  PI_FALLBACK_THINKING_LEVEL,
  projectNewTaskCatalog,
  resolveNewTaskModelChip,
  type NewTaskModelChoice
} from '../../src/shared/new-task-models.ts'

// ---- fixtures (ticket 41: the probe report is the catalog's only source) ----

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

const CATALOG = report({
  providers: [provider('anthropic', 'oauth', 'Anthropic'), provider('openai', null, 'OpenAI'), provider('gemini', 'api_key', 'Google')],
  models: [
    model('anthropic', 'claude-opus-4', 'Claude Opus 4'),
    model('anthropic', 'claude-sonnet-4', 'Claude Sonnet 4'),
    model('openai', 'gpt-5', 'GPT-5'),
    model('gemini', 'gemini-2.5-pro', 'Gemini 2.5 Pro')
  ]
})

describe('ALL_THINKING_LEVELS', () => {
  it('lists the seven Pi thinking levels in canonical order (host-free constant)', () => {
    expect(ALL_THINKING_LEVELS).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })
})

describe('projectNewTaskCatalog', () => {
  it('groups the probe models by provider, first-seen order kept (groupModelsByProvider shape)', () => {
    const catalog = projectNewTaskCatalog(CATALOG)
    expect(catalog.error).toBeNull()
    expect(catalog.providers).toEqual([
      {
        providerId: 'anthropic',
        name: 'Anthropic',
        models: [
          { providerId: 'anthropic', modelId: 'claude-opus-4', name: 'Claude Opus 4' },
          { providerId: 'anthropic', modelId: 'claude-sonnet-4', name: 'Claude Sonnet 4' }
        ]
      },
      { providerId: 'openai', name: 'OpenAI', models: [{ providerId: 'openai', modelId: 'gpt-5', name: 'GPT-5' }] },
      {
        providerId: 'gemini',
        name: 'Google',
        models: [{ providerId: 'gemini', modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }]
      }
    ])
  })

  it('falls back to the provider id when the report has no provider row for a model', () => {
    const catalog = projectNewTaskCatalog(report({ models: [model('mystery', 'm1')] }))
    expect(catalog.providers).toEqual([{ providerId: 'mystery', name: 'mystery', models: [model('mystery', 'm1')] }])
  })

  it('resolves Pi fallback default: the first model of the first auth-configured provider', () => {
    const catalog = projectNewTaskCatalog(CATALOG)
    expect(catalog.piFallback).toEqual({ providerId: 'anthropic', modelId: 'claude-opus-4', name: 'Claude Opus 4' })
  })

  it('skips auth-configured providers that carry no models, then keeps looking', () => {
    const catalog = projectNewTaskCatalog(
      report({
        providers: [provider('empty-but-authed', 'api_key'), provider('later', 'oauth', 'Later')],
        models: [model('later', 'l1')]
      })
    )
    expect(catalog.piFallback).toEqual({ providerId: 'later', modelId: 'l1', name: 'l1' })
  })

  it('yields no fallback when nothing is configured', () => {
    const catalog = projectNewTaskCatalog(
      report({ providers: [provider('openai', null)], models: [model('openai', 'gpt-5')] })
    )
    expect(catalog.piFallback).toBeNull()
  })

  it('keeps the probe error and an empty shape for a failed scan', () => {
    const catalog = projectNewTaskCatalog(report({ error: 'The auth probe timed out.' }))
    expect(catalog.error).toBe('The auth probe timed out.')
    expect(catalog.providers).toEqual([])
    expect(catalog.piFallback).toBeNull()
  })
})

describe('resolveNewTaskModelChip', () => {
  const resolved = projectNewTaskCatalog(CATALOG)

  it('chains: preference model → Pi fallback (tagged) → none (table)', () => {
    const cases: Array<{
      preferenceModel: { providerId: string; modelId: string } | null
      catalog: typeof resolved | null
      model: string | null
      source: 'preference' | 'pi-fallback' | 'none'
    }> = [
      // Preference points at a catalog model — it wins, untagged.
      { preferenceModel: { providerId: 'openai', modelId: 'gpt-5' }, catalog: resolved, model: 'gpt-5', source: 'preference' },
      // No preference — Pi's fallback (first authed provider's first model).
      { preferenceModel: null, catalog: resolved, model: 'claude-opus-4', source: 'pi-fallback' },
      // Preference outside the catalog never takes effect (the host falls
      // back at create time) — the chip shows what will actually run.
      {
        preferenceModel: { providerId: 'openai', modelId: 'not-a-model' },
        catalog: resolved,
        model: 'claude-opus-4',
        source: 'pi-fallback'
      },
      // Catalog present but nothing configured → no chip model.
      {
        preferenceModel: null,
        catalog: projectNewTaskCatalog(report({ providers: [provider('openai', null)], models: [model('openai', 'gpt-5')] })),
        model: null,
        source: 'none'
      },
      // Probe still in flight (no catalog yet) → no chip model.
      { preferenceModel: null, catalog: null, model: null, source: 'none' }
    ]
    for (const c of cases) {
      const chip = resolveNewTaskModelChip({
        preferenceModel: c.preferenceModel,
        preferenceThinkingLevel: null,
        catalog: c.catalog
      })
      expect([chip.model?.modelId ?? null, chip.modelSource]).toEqual([c.model, c.source])
    }
  })

  it('chains the thinking level: preference → Pi built-in fallback, even without a catalog', () => {
    const withPreference = resolveNewTaskModelChip({
      preferenceModel: null,
      preferenceThinkingLevel: 'high',
      catalog: null
    })
    expect([withPreference.thinkingLevel, withPreference.thinkingSource]).toEqual(['high', 'preference'])

    const withoutPreference = resolveNewTaskModelChip({
      preferenceModel: null,
      preferenceThinkingLevel: null,
      catalog: resolved
    })
    expect([withoutPreference.thinkingLevel, withoutPreference.thinkingSource]).toEqual([
      PI_FALLBACK_THINKING_LEVEL,
      'pi-fallback'
    ])
  })

  it('resolves model and thinking sources independently (preference model + Pi fallback thinking)', () => {
    const chip = resolveNewTaskModelChip({
      preferenceModel: { providerId: 'gemini', modelId: 'gemini-2.5-pro' },
      preferenceThinkingLevel: null,
      catalog: resolved
    })
    expect(chip.model?.modelId).toBe('gemini-2.5-pro')
    expect(chip.modelSource).toBe('preference')
    expect(chip.thinkingSource).toBe('pi-fallback')
  })
})

describe('findCatalogModel', () => {
  const providers = projectNewTaskCatalog(CATALOG).providers

  it('finds a model by provider + id with its display name', () => {
    expect(findCatalogModel(providers, 'anthropic', 'claude-sonnet-4')).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      name: 'Claude Sonnet 4'
    })
  })

  it('returns null for an unknown provider or model', () => {
    expect(findCatalogModel(providers, 'openai', 'claude-sonnet-4')).toBeNull()
    expect(findCatalogModel([], 'openai', 'gpt-5')).toBeNull()
  })
})

describe('mergeNewTaskDefaults', () => {
  it('returns null when neither preference defaults nor an empty-state choice exist', () => {
    expect(mergeNewTaskDefaults(null, null)).toBeNull()
    expect(mergeNewTaskDefaults(null, { model: null, thinkingLevel: null })).toBeNull()
  })

  it('keeps the preference defaults untouched without a choice', () => {
    const base: SessionDefaults = { providerId: 'a', modelId: 'm', thinkingLevel: 'low' }
    expect(mergeNewTaskDefaults(base, { model: null, thinkingLevel: null })).toEqual(base)
  })

  it('lets the empty-state choice override model and thinking independently (table)', () => {
    const base: SessionDefaults = { providerId: 'a', modelId: 'm', thinkingLevel: 'low' }
    const choice = (model: NewTaskModelChoice['model'], thinkingLevel: NewTaskModelChoice['thinkingLevel']): NewTaskModelChoice => ({
      model,
      thinkingLevel
    })
    expect(mergeNewTaskDefaults(base, choice({ providerId: 'x', modelId: 'y' }, null))).toEqual({
      providerId: 'x',
      modelId: 'y',
      thinkingLevel: 'low'
    })
    expect(mergeNewTaskDefaults(base, choice(null, 'max'))).toEqual({ providerId: 'a', modelId: 'm', thinkingLevel: 'max' })
    expect(mergeNewTaskDefaults(base, choice({ providerId: 'x', modelId: 'y' }, 'off'))).toEqual({
      providerId: 'x',
      modelId: 'y',
      thinkingLevel: 'off'
    })
  })

  it('builds defaults from a bare choice when no preference defaults exist', () => {
    expect(mergeNewTaskDefaults(null, { model: { providerId: 'x', modelId: 'y' }, thinkingLevel: null })).toEqual({
      providerId: 'x',
      modelId: 'y'
    })
  })
})
