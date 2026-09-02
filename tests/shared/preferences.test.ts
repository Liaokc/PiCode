import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
  sessionDefaultsFromPreferences,
  toggleHiddenGroup
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
      newTaskFixedProject: '/Users/dev/repos/api',
      hiddenGroups: [],
      readStates: {},
      recentlyClosedTabs: []
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
      newTaskFixedProject: null,
      hiddenGroups: [],
      readStates: {},
      recentlyClosedTabs: []
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

  it('normalizes hiddenGroups: strings only, trimmed, blank-free, deduped, order-stable (ticket 19)', () => {
    expect(normalizePreferences(undefined).hiddenGroups).toEqual([])
    expect(normalizePreferences({ hiddenGroups: [] }).hiddenGroups).toEqual([])
    expect(
      normalizePreferences({ hiddenGroups: ['/work/api', ' /work/web ', '/work/api', '', 42, null, '/work/web'] }).hiddenGroups
    ).toEqual(['/work/api', '/work/web'])
    expect(normalizePreferences({ hiddenGroups: 'nope' }).hiddenGroups).toEqual([])
    expect(normalizePreferences({ hiddenGroups: [1337] }).hiddenGroups).toEqual([])
  })

  it('normalizes readStates: valid per-session entries only (ticket 28)', () => {
    expect(normalizePreferences(undefined).readStates).toEqual({})
    expect(normalizePreferences({ readStates: 'nope' }).readStates).toEqual({})
    expect(
      normalizePreferences({
        readStates: {
          's-a': { watermarkMs: 1000, manualUnread: false },
          's-b': { watermarkMs: 2000, manualUnread: true },
          's-bad-watermark': { watermarkMs: 'soon', manualUnread: false },
          's-bad-flag': { watermarkMs: 3000, manualUnread: 'yes' },
          's-partial': { watermarkMs: 4000 },
          's-not-object': 42,
          nullish: null
        }
      }).readStates
    ).toEqual({
      's-a': { watermarkMs: 1000, manualUnread: false },
      's-b': { watermarkMs: 2000, manualUnread: true }
    })
  })

  it('patches hiddenGroups as a whole array; non-array and missing patches keep the previous value', () => {
    const base = normalizePreferences({ hiddenGroups: ['/work/api'] })
    expect(mergePreferences(base, { hiddenGroups: [] }).hiddenGroups).toEqual([])
    expect(mergePreferences(base, { hiddenGroups: ['/b', '/a'] }).hiddenGroups).toEqual(['/b', '/a'])
    expect(mergePreferences(base, {}).hiddenGroups).toEqual(['/work/api'])
    expect(mergePreferences(base, { hiddenGroups: '/work/api' }).hiddenGroups).toEqual(['/work/api'])
    // Arrays replace as a whole (sanitized like on read); only non-array
    // patches keep the previous value.
    expect(mergePreferences(base, { hiddenGroups: [7] }).hiddenGroups).toEqual([])
  })

  it('patches readStates per session: upserts merge over the previous record (ticket 28)', () => {
    const base = normalizePreferences({
      readStates: {
        's-a': { watermarkMs: 1000, manualUnread: false },
        's-b': { watermarkMs: 2000, manualUnread: false }
      }
    })
    // Two racing writers each send their own session upsert — per-session
    // merging never loses the other writer's entry.
    const first = mergePreferences(base, { readStates: { 's-a': { watermarkMs: 5000, manualUnread: false } } })
    expect(first.readStates['s-a']).toEqual({ watermarkMs: 5000, manualUnread: false })
    expect(first.readStates['s-b']).toEqual({ watermarkMs: 2000, manualUnread: false })
    const second = mergePreferences(base, { readStates: { 's-b': { watermarkMs: 2000, manualUnread: true } } })
    expect(second.readStates['s-a']).toEqual({ watermarkMs: 1000, manualUnread: false })
    expect(second.readStates['s-b']).toEqual({ watermarkMs: 2000, manualUnread: true })
  })

  it('drops invalid readStates patch entries and keeps the previous ones; non-object patches keep everything', () => {
    const base = normalizePreferences({ readStates: { 's-a': { watermarkMs: 1000, manualUnread: false } } })
    const merged = mergePreferences(base, {
      readStates: {
        's-a': { watermarkMs: 5000, manualUnread: false },
        's-bad': { watermarkMs: 'soon', manualUnread: false },
        's-worse': 7
      }
    })
    expect(merged.readStates).toEqual({ 's-a': { watermarkMs: 5000, manualUnread: false } })
    expect(mergePreferences(base, { readStates: 'nope' }).readStates).toEqual(base.readStates)
    expect(mergePreferences(base, {}).readStates).toEqual(base.readStates)
  })

  it('leaves session defaults untouched by hiddenGroups', () => {
    expect(sessionDefaultsFromPreferences(normalizePreferences({ hiddenGroups: ['/work/api'] }))).toBeNull()
  })

  it('normalizes recentlyClosedTabs: valid file/trace entries only, capped (ticket 31)', () => {
    expect(normalizePreferences(undefined).recentlyClosedTabs).toEqual([])
    expect(normalizePreferences({ recentlyClosedTabs: 'nope' }).recentlyClosedTabs).toEqual([])
    const prefs = normalizePreferences({
      recentlyClosedTabs: [
        { tab: { kind: 'file', cwd: '/w', path: 'a.md' }, closedAt: 3000 },
        { tab: { kind: 'review' }, closedAt: 4000 },
        { tab: { kind: 'trace', sessionFile: '/s/one.jsonl' }, closedAt: 1000 }
      ]
    })
    expect(prefs.recentlyClosedTabs).toEqual([
      { tab: { kind: 'file', cwd: '/w', path: 'a.md' }, closedAt: 3000 },
      { tab: { kind: 'trace', sessionFile: '/s/one.jsonl' }, closedAt: 1000 }
    ])
  })

  it('patches recentlyClosedTabs as a whole list: valid replaces, invalid keeps (ticket 31)', () => {
    const base = normalizePreferences({
      recentlyClosedTabs: [{ tab: { kind: 'file', cwd: '/w', path: 'a.md' }, closedAt: 1000 }]
    })
    const patched = mergePreferences(base, {
      recentlyClosedTabs: [{ tab: { kind: 'trace', sessionFile: '/s/two.jsonl' }, closedAt: 2000 }]
    })
    expect(patched.recentlyClosedTabs).toEqual([{ tab: { kind: 'trace', sessionFile: '/s/two.jsonl' }, closedAt: 2000 }])
    expect(mergePreferences(base, { recentlyClosedTabs: 7 }).recentlyClosedTabs).toEqual(base.recentlyClosedTabs)
    expect(mergePreferences(base, {}).recentlyClosedTabs).toEqual(base.recentlyClosedTabs)
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

describe('toggleHiddenGroup', () => {
  it('re-appends an already-hidden cwd at the end (most recently hidden last)', () => {
    expect(toggleHiddenGroup([], '/work/api', true)).toEqual(['/work/api'])
    expect(toggleHiddenGroup(['/work/api', '/work/web'], '/work/api', true)).toEqual(['/work/web', '/work/api'])
  })

  it('removes a cwd and ignores cwds that were never hidden', () => {
    expect(toggleHiddenGroup(['/work/api', '/work/web'], '/work/api', false)).toEqual(['/work/web'])
    expect(toggleHiddenGroup([], '/work/api', false)).toEqual([])
  })
})
