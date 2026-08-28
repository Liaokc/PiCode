import { describe, expect, it } from 'vitest'
import { collectAuthStatuses, type AuthProbeModels, type StoredCredentialLike } from '../../src/host/auth-probe.ts'

function fakeRuntime(providers: Array<{ id: string; name?: string; models?: Array<{ id: string; name?: string }> }>): AuthProbeModels {
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
    expect(report.models).toEqual([
      { providerId: 'anthropic', modelId: 'claude-opus-4-5', name: 'claude-opus-4-5' },
      { providerId: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'claude-sonnet-4-5' },
      { providerId: 'openai', modelId: 'gpt-5.1', name: 'GPT-5.1' }
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
