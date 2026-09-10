import { describe, expect, it } from 'vitest'
import {
  collectAuthStatuses,
  collectCommandCatalog,
  supportedThinkingLevels,
  type AuthProbeModels,
  type ProbeResourceLoader,
  type StoredCredentialLike
} from '../../src/host/auth-probe.ts'

function fakeRuntime(
  providers: Array<{
    id: string
    name?: string
    models?: Array<{ id: string; name?: string; reasoning?: boolean; thinkingLevelMap?: Record<string, string | null> }>
  }>
): AuthProbeModels {
  return {
    getProviders: () => providers.map((p) => ({ id: p.id })),
    getProvider: (id: string) => {
      const found = providers.find((p) => p.id === id)
      return found?.name === undefined ? undefined : { name: found.name }
    },
    getModels: (id: string) => providers.find((p) => p.id === id)?.models ?? [],
    checkAuth: async (id: string) => {
      if (id === 'anthropic') return { source: 'ANTHROPIC_API_KEY', type: 'api_key' as const }
      if (id === 'minimax') return { source: 'OAuth', type: 'oauth' as const }
      return undefined
    }
  }
}

describe('collectAuthStatuses', () => {
  const NOW = 1_800_000_000_000

  it('lists every registry provider with names, model counts, and auth metadata', async () => {
    const runtime = fakeRuntime([
      { id: 'anthropic', name: 'Anthropic', models: [{ id: 'claude-opus-4-5' }, { id: 'claude-sonnet-4-5' }] },
      { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-5.1', name: 'GPT-5.1' }] },
      { id: 'minimax', name: 'MiniMax', models: [] }
    ])
    const credentials = new Map<string, StoredCredentialLike>([
      ['minimax', { type: 'oauth', expires: NOW + 60_000 }]
    ])
    const report = await collectAuthStatuses(runtime, (id) => credentials.get(id))
    expect(report.providers).toEqual([
      {
        providerId: 'anthropic',
        name: 'Anthropic',
        modelCount: 2,
        authType: 'api_key',
        source: 'ANTHROPIC_API_KEY',
        oauthExpiresAt: null
      },
      { providerId: 'openai', name: 'OpenAI', modelCount: 1, authType: null, source: null, oauthExpiresAt: null },
      {
        providerId: 'minimax',
        name: 'MiniMax',
        modelCount: 0,
        authType: 'oauth',
        source: 'OAuth',
        oauthExpiresAt: NOW + 60_000
      }
    ])
    // Non-reasoning fixtures support 'off' only (SDK getSupportedThinkingLevels).
    expect(report.models).toEqual([
      {
        providerId: 'anthropic',
        modelId: 'claude-opus-4-5',
        name: 'claude-opus-4-5',
        thinkingLevels: ['off']
      },
      {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        name: 'claude-sonnet-4-5',
        thinkingLevels: ['off']
      },
      { providerId: 'openai', modelId: 'gpt-5.1', name: 'GPT-5.1', thinkingLevels: ['off'] }
    ])
    expect(report.error).toBeNull()
  })

  it('falls back to the provider id as the display name', async () => {
    const runtime = fakeRuntime([{ id: 'custom-gateway', models: [{ id: 'm1' }] }])
    const report = await collectAuthStatuses(runtime, () => undefined)
    expect(report.providers[0]?.name).toBe('custom-gateway')
    expect(report.models[0]?.name).toBe('m1')
  })

  it('records an api_key credential even when the ambient check finds nothing', async () => {
    const runtime = fakeRuntime([{ id: 'bella', models: [{ id: 'GLM-5.3' }] }])
    const report = await collectAuthStatuses(runtime, () => ({ type: 'api_key' }))
    expect(report.providers[0]).toMatchObject({ authType: 'api_key', source: null, oauthExpiresAt: null })
  })
})

// Ticket 41: the level extraction mirrors the SDK's getSupportedThinkingLevels
// (reasoning gate; null mappings unsupported; xhigh/max need explicit maps).
describe('supportedThinkingLevels', () => {
  it('gives a non-reasoning model only off', () => {
    expect(supportedThinkingLevels({ id: 'm' })).toEqual(['off'])
    expect(supportedThinkingLevels({ id: 'm', reasoning: false })).toEqual(['off'])
  })

  it('treats null mappings as unsupported and missing low-tier keys as supported', () => {
    // GLM-5.3 shape: off/minimal/medium/xhigh map to null → only low/high/max.
    expect(
      supportedThinkingLevels({
        id: 'GLM-5.3',
        reasoning: true,
        thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' }
      })
    ).toEqual(['low', 'high', 'max'])
  })

  it('requires explicit maps for xhigh/max, defaults the rest (reasoning model)', () => {
    expect(supportedThinkingLevels({ id: 'm', reasoning: true })).toEqual(['off', 'minimal', 'low', 'medium', 'high'])
    expect(
      supportedThinkingLevels({ id: 'm', reasoning: true, thinkingLevelMap: { max: 'max' } })
    ).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'max'])
  })
})

// Ticket 52: the resource-loader enumeration — prompt templates + skills
// projected into raw catalog rows (no session machinery behind it).
describe('collectCommandCatalog', () => {
  it('projects loader prompts and skills into raw rows, order preserved', () => {
    const loader: ProbeResourceLoader = {
      getPrompts: () => ({
        prompts: [
          { name: 'deploy', description: 'Ship it', argumentHint: '[env]' },
          { name: 'weekly', description: 'Weekly report' }
        ]
      }),
      getSkills: () => ({
        skills: [{ name: 'review-pr', description: 'Review a PR' }]
      })
    }
    expect(collectCommandCatalog(loader)).toEqual([
      { name: 'deploy', description: 'Ship it', argumentHint: '[env]', source: 'prompt' },
      { name: 'weekly', description: 'Weekly report', source: 'prompt' },
      { name: 'review-pr', description: 'Review a PR', source: 'skill' }
    ])
  })

  it('stringifies non-string argument hints (YAML frontmatter delivers arrays)', () => {
    const loader: ProbeResourceLoader = {
      getPrompts: () => ({
        prompts: [
          // `argument-hint: [env]` parses as a one-element YAML array.
          { name: 'deploy', description: 'Ship it', argumentHint: ['env'] as unknown as string },
          { name: 'wait', description: 'Wait', argumentHint: 3 as unknown as string }
        ]
      }),
      getSkills: () => ({ skills: [] })
    }
    expect(collectCommandCatalog(loader)).toEqual([
      { name: 'deploy', description: 'Ship it', argumentHint: 'env', source: 'prompt' },
      { name: 'wait', description: 'Wait', argumentHint: '3', source: 'prompt' }
    ])
  })

  it('degrades to an empty catalog when the loader enumeration throws', () => {
    const loader: ProbeResourceLoader = {
      getPrompts: () => {
        throw new Error('loader exploded')
      },
      getSkills: () => ({ skills: [] })
    }
    expect(collectCommandCatalog(loader)).toEqual([])
  })

  it('reports an empty catalog for an empty loader (no templates, no skills)', () => {
    const loader: ProbeResourceLoader = {
      getPrompts: () => ({ prompts: [] }),
      getSkills: () => ({ skills: [] })
    }
    expect(collectCommandCatalog(loader)).toEqual([])
  })
})
