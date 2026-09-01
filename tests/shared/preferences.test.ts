import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
  sessionDefaultsFromPreferences
} from '../../src/shared/preferences.ts'

describe('normalizePreferences', () => {
  it('falls back to the defaults for missing, corrupt, or non-object input', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences('nope')).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences({ defaultModel: 42, newTaskDirectory: 'sometimes' })).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps valid values and drops invalid ones field by field', () => {
    const prefs = normalizePreferences({
      defaultModel: { providerId: 'anthropic', modelId: 'claude-opus-4-5' },
      defaultThinkingLevel: 'high',
      newTaskDirectory: 'fixed',
      newTaskFixedProject: '/Users/dev/repos/api'
    })
    expect(prefs).toEqual({
      defaultModel: { providerId: 'anthropic', modelId: 'claude-opus-4-5' },
      defaultThinkingLevel: 'high',
      newTaskDirectory: 'fixed',
      newTaskFixedProject: '/Users/dev/repos/api'
    })
    expect(
      normalizePreferences({
        defaultModel: { providerId: 7, modelId: 'x' },
        defaultThinkingLevel: 'ultra',
        newTaskDirectory: 'remember',
        newTaskFixedProject: 42
      })
    ).toEqual(DEFAULT_PREFERENCES)
  })

  it('migrates the retired ask value to last-used (ticket 17)', () => {
    expect(normalizePreferences({ newTaskDirectory: 'ask' }).newTaskDirectory).toBe('last-used')
  })

  it('treats blank or non-string fixed projects as unset', () => {
    expect(normalizePreferences({ newTaskFixedProject: '   ' }).newTaskFixedProject).toBeNull()
    expect(normalizePreferences({ newTaskFixedProject: '/repos/api' }).newTaskFixedProject).toBe('/repos/api')
  })

  it('accepts null defaultModel/defaultThinkingLevel explicitly', () => {
    const prefs = normalizePreferences({ defaultModel: null, defaultThinkingLevel: null })
    expect(prefs.defaultModel).toBeNull()
    expect(prefs.defaultThinkingLevel).toBeNull()
  })
})

describe('mergePreferences', () => {
  it('applies only the known, valid fields of the patch', () => {
    const merged = mergePreferences(DEFAULT_PREFERENCES, {
      defaultModel: { providerId: 'bella', modelId: 'GLM-5.3' },
      newTaskDirectory: 'last-used',
      bogus: true
    })
    expect(merged).toEqual({
      defaultModel: { providerId: 'bella', modelId: 'GLM-5.3' },
      defaultThinkingLevel: null,
      newTaskDirectory: 'last-used',
      newTaskFixedProject: null
    })
  })

  it('lets a patch clear the default model and thinking level with null', () => {
    const base = normalizePreferences({
      defaultModel: { providerId: 'bella', modelId: 'GLM-5.3' },
      defaultThinkingLevel: 'high'
    })
    const merged = mergePreferences(base, { defaultModel: null, defaultThinkingLevel: null })
    expect(merged.defaultModel).toBeNull()
    expect(merged.defaultThinkingLevel).toBeNull()
  })

  it('rejects invalid patch values and keeps the previous ones', () => {
    const base = normalizePreferences({ newTaskDirectory: 'fixed', newTaskFixedProject: '/repos/api' })
    expect(mergePreferences(base, { newTaskDirectory: 'whenever' }).newTaskDirectory).toBe('fixed')
    expect(mergePreferences(base, { newTaskFixedProject: 7 }).newTaskFixedProject).toBe('/repos/api')
    expect(mergePreferences(base, { defaultModel: 'claude' }).defaultModel).toBeNull()
  })

  it('sets and clears the fixed project through patches', () => {
    const base = normalizePreferences(undefined)
    const pinned = mergePreferences(base, { newTaskFixedProject: ' /repos/api ' })
    expect(pinned.newTaskFixedProject).toBe('/repos/api')
    const cleared = mergePreferences(pinned, { newTaskFixedProject: null })
    expect(cleared.newTaskFixedProject).toBeNull()
  })
})

describe('sessionDefaultsFromPreferences', () => {
  it('returns null when nothing is configured (Pi picks its own defaults)', () => {
    expect(sessionDefaultsFromPreferences(DEFAULT_PREFERENCES)).toBeNull()
  })

  it('carries the model and thinking level when both are set', () => {
    const prefs = normalizePreferences({
      defaultModel: { providerId: 'bella', modelId: 'GLM-5.3' },
      defaultThinkingLevel: 'high'
    })
    expect(sessionDefaultsFromPreferences(prefs)).toEqual({
      providerId: 'bella',
      modelId: 'GLM-5.3',
      thinkingLevel: 'high'
    })
  })

  it('carries a thinking level alone when no default model is set', () => {
    const prefs = normalizePreferences({ defaultThinkingLevel: 'off' })
    expect(sessionDefaultsFromPreferences(prefs)).toEqual({ thinkingLevel: 'off' })
  })
})
