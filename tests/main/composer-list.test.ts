import { describe, expect, it } from 'vitest'
import type { ProviderModels } from '../../src/shared/contract'
import {
  EXECUTABLE_BUILTIN_NAMES,
  buildSlashCommands,
  groupModelsByProvider,
  toModelRef
} from '../../src/host/composer-list'

describe('slash command menu rows', () => {
  const prompts = [
    { name: 'review', description: 'Review the current diff', argumentHint: '[path]' },
    { name: 'plan', description: 'Switch to plan mode' }
  ]
  const skills = [
    { name: 'code-review', description: 'Structured review skill' },
    { name: 'research', description: 'Deep research skill' }
  ]
  const builtins = [
    { name: 'model', description: 'Select model (opens selector UI)' },
    { name: 'login', description: 'Configure provider authentication' },
    { name: 'compact', description: 'Compact the session context' }
  ]

  it('orders rows built-ins → prompts → skills, keeping Pi descriptions', () => {
    const rows = buildSlashCommands(prompts, skills, builtins)
    expect(rows.map((r) => r.name)).toEqual(['compact', 'review', 'plan', 'code-review', 'research'])
    expect(rows[0]).toMatchObject({ source: 'builtin', description: 'Compact the session context' })
    expect(rows[1]).toMatchObject({ source: 'prompt', argumentHint: '[path]' })
    expect(rows[3]).toMatchObject({ source: 'skill' })
  })

  it('only lists built-ins PiCode can actually execute', () => {
    const rows = buildSlashCommands([], [], builtins)
    expect(rows.some((r) => r.name === 'login')).toBe(false)
    for (const row of rows) expect(EXECUTABLE_BUILTIN_NAMES.has(row.name)).toBe(true)
  })

  it('retires the six duplicated built-ins from the menu (ticket 38)', () => {
    // /new /tree /name /copy /model /thinking have dedicated PiCode UI; only
    // /compact stays (no other entry point). Typing them is gated separately
    // (shared/composer/slash-gate).
    for (const retired of ['new', 'tree', 'name', 'copy', 'model', 'thinking']) {
      expect(EXECUTABLE_BUILTIN_NAMES.has(retired), `/${retired} must be retired`).toBe(false)
    }
    expect(EXECUTABLE_BUILTIN_NAMES.has('compact')).toBe(true)
    const rows = buildSlashCommands([], [], builtins)
    expect(rows.map((r) => r.name)).toEqual(['compact'])
  })

  it('EXECUTABLE_BUILTIN_NAMES covers the mapped actions', () => {
    expect([...EXECUTABLE_BUILTIN_NAMES].sort()).toEqual(['compact'])
  })
})

describe('model grouping for the cascade menu', () => {
  const models = [
    { provider: 'anthropic', id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
    { provider: 'anthropic', id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { provider: 'openai', id: 'gpt-5.1', name: 'GPT-5.1' }
  ]

  it('groups by provider with display names, preserving first-seen order', () => {
    const groups: ProviderModels[] = groupModelsByProvider(models, (pid) => (pid === 'openai' ? 'OpenAI' : 'Anthropic'))
    expect(groups.map((g) => g.providerId)).toEqual(['anthropic', 'openai'])
    expect(groups[0]).toEqual({
      providerId: 'anthropic',
      name: 'Anthropic',
      models: [
        { providerId: 'anthropic', modelId: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
        { providerId: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }
      ]
    })
    expect(groups[1]?.name).toBe('OpenAI')
  })

  it('falls back to the provider id when no display name exists', () => {
    const groups = groupModelsByProvider(models, () => undefined)
    expect(groups.every((g) => g.name === g.providerId)).toBe(true)
  })

  it('toModelRef projects the menu row shape', () => {
    expect(toModelRef(models[0]!)).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-opus-4-5',
      name: 'Claude Opus 4.5'
    })
  })
})
