import { describe, expect, it } from 'vitest'
import type { AuthProbeReport, ModelCatalogEntry, ProviderAuthStatus } from '../../src/shared/auth-status'
import { ALL_THINKING_LEVELS } from '../../src/shared/contract'
import type { SessionDefaults } from '../../src/shared/preferences'
import {
  clampThinkingLevelToLevels,
  findCatalogModel,
  mergeNewTaskDefaults,
  PI_FALLBACK_THINKING_LEVEL,
  projectNewTaskCatalog,
  resolveNewTaskModelChip,
  resolveNewTaskThinkingLevels,
  type NewTaskModelChoice
} from '../../src/shared/new-task-models.ts'

// ---- fixtures (ticket 41: the probe report is the catalog's only source) ----

function provider(providerId: string, authType: ProviderAuthStatus['authType'], name = providerId): ProviderAuthStatus {
  return { providerId, name, modelCount: 0, authType, source: authType === null ? null : 'KEY', oauthExpiresAt: null }
}

function model(providerId: string, modelId: string, name = modelId, thinkingLevels?: string[]): ModelCatalogEntry {
  return thinkingLevels === undefined
    ? { providerId, modelId, name }
    : { providerId, modelId, name, thinkingLevels: thinkingLevels as ModelCatalogEntry['thinkingLevels'] }
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
    model('anthropic', 'claude-opus-4', 'Claude Opus 4', ['off', 'medium', 'high', 'xhigh', 'max']),
    model('anthropic', 'claude-sonnet-4', 'Claude Sonnet 4', ['off', 'low', 'medium', 'high', 'xhigh', 'max']),
    model('openai', 'gpt-5', 'GPT-5'),
    model('gemini', 'gemini-2.5-pro', 'Gemini 2.5 Pro', ['low', 'high', 'max'])
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
          {
            providerId: 'anthropic',
            modelId: 'claude-opus-4',
            name: 'Claude Opus 4',
            thinkingLevels: ['off', 'medium', 'high', 'xhigh', 'max']
          },
          {
            providerId: 'anthropic',
            modelId: 'claude-sonnet-4',
            name: 'Claude Sonnet 4',
            thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh', 'max']
          }
        ]
      },
      {
        providerId: 'openai',
        name: 'OpenAI',
        models: [{ providerId: 'openai', modelId: 'gpt-5', name: 'GPT-5' }]
      },
      {
        providerId: 'gemini',
        name: 'Google',
        models: [
          {
            providerId: 'gemini',
            modelId: 'gemini-2.5-pro',
            name: 'Gemini 2.5 Pro',
            thinkingLevels: ['low', 'high', 'max']
          }
        ]
      }
    ])
  })

  it('falls back to the provider id when the report has no provider row for a model', () => {
    const catalog = projectNewTaskCatalog(report({ models: [model('mystery', 'm1')] }))
    expect(catalog.providers).toEqual([{ providerId: 'mystery', name: 'mystery', models: [model('mystery', 'm1')] }])
  })

  it('resolves Pi fallback default: the first model of the first auth-configured provider', () => {
    const catalog = projectNewTaskCatalog(CATALOG)
    expect(catalog.piFallback).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-opus-4',
      name: 'Claude Opus 4',
      thinkingLevels: ['off', 'medium', 'high', 'xhigh', 'max']
    })
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

  it('finds a model by provider + id with its display name and level data', () => {
    expect(findCatalogModel(providers, 'anthropic', 'claude-sonnet-4')).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      name: 'Claude Sonnet 4',
      thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh', 'max']
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
    expect(mergeNewTaskDefaults(null, { model: null, thinkingLevel: null, accessMode: null })).toBeNull()
  })

  it('keeps the preference defaults untouched without a choice', () => {
    const base: SessionDefaults = { providerId: 'a', modelId: 'm', thinkingLevel: 'low' }
    expect(mergeNewTaskDefaults(base, { model: null, thinkingLevel: null, accessMode: null })).toEqual(base)
  })

  it('lets the empty-state choice override model and thinking independently (table)', () => {
    const base: SessionDefaults = { providerId: 'a', modelId: 'm', thinkingLevel: 'low' }
    const choice = (
      model: NewTaskModelChoice['model'],
      thinkingLevel: NewTaskModelChoice['thinkingLevel']
    ): NewTaskModelChoice => ({ model, thinkingLevel, accessMode: null })
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
    expect(mergeNewTaskDefaults(null, { model: { providerId: 'x', modelId: 'y' }, thinkingLevel: null, accessMode: null })).toEqual({
      providerId: 'x',
      modelId: 'y'
    })
  })

  it('carries the empty-state access pick into the defaults (ticket 80, additive accessMode)', () => {
    expect(mergeNewTaskDefaults(null, { model: null, thinkingLevel: null, accessMode: 'read-only' })).toEqual({
      accessMode: 'read-only'
    })
    const base: SessionDefaults = { providerId: 'a', modelId: 'm', thinkingLevel: 'low' }
    expect(mergeNewTaskDefaults(base, { model: null, thinkingLevel: null, accessMode: 'full-access' })).toEqual({
      providerId: 'a',
      modelId: 'm',
      thinkingLevel: 'low',
      accessMode: 'full-access'
    })
  })

  it('keeps accessMode ABSENT when the access chip was left untouched (legacy payload shape)', () => {
    const merged = mergeNewTaskDefaults(null, {
      model: { providerId: 'x', modelId: 'y' },
      thinkingLevel: 'max',
      accessMode: null
    })
    expect(merged).toEqual({ providerId: 'x', modelId: 'y', thinkingLevel: 'max' })
    expect('accessMode' in (merged ?? {})).toBe(false)
  })
})

describe('resolveNewTaskThinkingLevels', () => {
  const providers = projectNewTaskCatalog(CATALOG).providers

  it('filters to the chip model supported levels from the catalog (table)', () => {
    const cases: Array<{ modelId: string | null; levels: string[] }> = [
      { modelId: 'claude-opus-4', levels: ['off', 'medium', 'high', 'xhigh', 'max'] },
      { modelId: 'gemini-2.5-pro', levels: ['low', 'high', 'max'] },
      // Catalog entry without level info (older probe) → the full seven.
      { modelId: 'gpt-5', levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] }
    ]
    for (const c of cases) {
      const ref = c.modelId === null ? null : (findCatalogModel(providers, 'anthropic', c.modelId) ?? findCatalogModel(providers, 'gemini', c.modelId!))
      expect(resolveNewTaskThinkingLevels(providers, ref)).toEqual(c.levels)
    }
  })

  it('degrades to the full seven when the model or catalog is unknown', () => {
    const all = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    expect(resolveNewTaskThinkingLevels(providers, null)).toEqual(all)
    expect(resolveNewTaskThinkingLevels(providers, { providerId: 'x', modelId: 'y', name: 'y' })).toEqual(all)
    expect(resolveNewTaskThinkingLevels([], null)).toEqual(all)
  })
})

describe('clampThinkingLevelToLevels', () => {
  it('keeps a supported request (table)', () => {
    expect(clampThinkingLevelToLevels('high', ['low', 'high', 'max'])).toBe('high')
    expect(clampThinkingLevelToLevels('off', ['off'])).toBe('off')
  })

  it('searches forward then backward, mirroring the SDK clamp (table)', () => {
    // GLM-5.3 shape: 'off' unsupported → forward to the lowest supported.
    expect(clampThinkingLevelToLevels('off', ['low', 'high', 'max'])).toBe('low')
    // 'medium' unsupported → forward to 'high'.
    expect(clampThinkingLevelToLevels('medium', ['low', 'high', 'max'])).toBe('high')
    // 'max' requested but unsupported → backward to 'high'.
    expect(clampThinkingLevelToLevels('max', ['off', 'low'])).toBe('low')
    // Unknown levels → passthrough.
    expect(clampThinkingLevelToLevels('medium', [])).toBe('medium')
  })
})
