import { describe, expect, it } from 'vitest'
import {
  authHealth,
  isAuthProbeReport,
  type AuthProbeReport,
  type ProviderAuthStatus
} from '../../src/shared/auth-status.ts'

function status(overrides: Partial<ProviderAuthStatus> = {}): ProviderAuthStatus {
  return {
    providerId: 'anthropic',
    name: 'Anthropic',
    modelCount: 4,
    authType: null,
    source: null,
    oauthExpiresAt: null,
    ...overrides
  }
}

describe('authHealth', () => {
  const NOW = 1_800_000_000_000

  it('reports not-configured when no credential was found', () => {
    expect(authHealth(status({ authType: null, source: null }), NOW)).toBe('not-configured')
  })

  it('reports ok for an api-key credential regardless of expiry fields', () => {
    expect(
      authHealth(status({ authType: 'api_key', source: 'ANTHROPIC_API_KEY', oauthExpiresAt: null }), NOW)
    ).toBe('ok')
  })

  it('reports ok for an unexpired oauth credential and expired once past expiry', () => {
    const live = status({ authType: 'oauth', source: 'OAuth', oauthExpiresAt: NOW + 60_000 })
    expect(authHealth(live, NOW)).toBe('ok')
    const stale = status({ authType: 'oauth', source: 'OAuth', oauthExpiresAt: NOW - 1 })
    expect(authHealth(stale, NOW)).toBe('expired')
  })

  it('treats an oauth credential expiring exactly now as expired', () => {
    const boundary = status({ authType: 'oauth', source: 'OAuth', oauthExpiresAt: NOW })
    expect(authHealth(boundary, NOW)).toBe('expired')
  })

  it('reports ok for an oauth credential without expiry metadata (refresh handles it)', () => {
    expect(authHealth(status({ authType: 'oauth', source: 'OAuth', oauthExpiresAt: null }), NOW)).toBe('ok')
  })
})

describe('isAuthProbeReport', () => {
  it('accepts a well-formed report and rejects everything else', () => {
    const report: AuthProbeReport = {
      scannedAt: 1234,
      error: null,
      providers: [status()],
      models: [{ providerId: 'anthropic', modelId: 'claude-opus-4-5', name: 'Claude Opus 4.5' }]
    }
    expect(isAuthProbeReport(report)).toBe(true)
    expect(isAuthProbeReport({ scannedAt: 1, error: 'boom', providers: [], models: [] })).toBe(true)
    expect(isAuthProbeReport(null)).toBe(false)
    expect(isAuthProbeReport({ scannedAt: 'x', error: null, providers: [], models: [] })).toBe(false)
    expect(isAuthProbeReport({ scannedAt: 1, error: null, providers: 'nope', models: [] })).toBe(false)
    expect(
      isAuthProbeReport({ scannedAt: 1, error: null, providers: [{ providerId: 'a', modelCount: 'x' }], models: [] })
    ).toBe(false)
    expect(
      isAuthProbeReport({ scannedAt: 1, error: null, providers: [], models: [{ providerId: 1, modelId: 'm', name: 'm' }] })
    ).toBe(false)
  })

  // Ticket 52 (additive): the command-catalog slice is optional — reports
  // from older probe hosts (field absent) stay valid; when present every
  // row must carry a prompt/skill source.
  it('accepts reports without the command catalog (old probe payloads)', () => {
    expect(isAuthProbeReport({ scannedAt: 1, error: null, providers: [], models: [] })).toBe(true)
  })

  it('accepts a well-formed command catalog and rejects malformed rows', () => {
    const base = { scannedAt: 1, error: null, providers: [], models: [] }
    expect(
      isAuthProbeReport({
        ...base,
        commands: [
          { name: 'deploy', description: 'Ship it', argumentHint: '[env]', source: 'prompt' },
          { name: 'review-pr', description: 'Review', source: 'skill' }
        ]
      })
    ).toBe(true)
    expect(isAuthProbeReport({ ...base, commands: 'nope' })).toBe(false)
    expect(isAuthProbeReport({ ...base, commands: [{ name: 'x', description: 'x', source: 'builtin' }] })).toBe(false)
    expect(isAuthProbeReport({ ...base, commands: [{ name: 1, description: 'x', source: 'prompt' }] })).toBe(false)
    expect(isAuthProbeReport({ ...base, commands: [{ name: 'x', source: 'prompt' }] })).toBe(false)
    expect(
      isAuthProbeReport({ ...base, commands: [{ name: 'x', description: 'x', argumentHint: 3, source: 'prompt' }] })
    ).toBe(false)
  })
})
