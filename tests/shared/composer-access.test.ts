import { describe, expect, it } from 'vitest'
import {
  ACCESS_MODES,
  DEFAULT_ACCESS_MODE,
  accessModeHint,
  accessModeLabel,
  decideGate,
  rememberRule,
  rulesForMode,
  emptyRules,
  type RulesByMode
} from '../../src/shared/composer/access'

describe('access mode presets (approval-gate tiers)', () => {
  it('exposes the three tiers with a safe default', () => {
    expect(ACCESS_MODES).toEqual(['full-access', 'standard', 'read-only'])
    expect(DEFAULT_ACCESS_MODE).toBe('standard')
  })

  it('labels and hints are English UI copy', () => {
    expect(accessModeLabel('full-access')).toBe('Full Access')
    expect(accessModeLabel('standard')).toBe('Standard')
    expect(accessModeLabel('read-only')).toBe('Read Only')
    expect(accessModeHint('read-only')).toMatch(/deny/i)
  })

  it('full access allows every tool without asking', () => {
    expect(decideGate('full-access', 'bash', [])).toBe('allow')
    expect(decideGate('full-access', 'edit', [])).toBe('allow')
    expect(decideGate('full-access', 'custom_tool', [])).toBe('allow')
  })

  it('read-only inspection tools never ask in any tier', () => {
    for (const mode of ACCESS_MODES) {
      expect(decideGate(mode, 'read', [])).toBe('allow')
      expect(decideGate(mode, 'grep', [])).toBe('allow')
      expect(decideGate(mode, 'ls', [])).toBe('allow')
      expect(decideGate(mode, 'find', [])).toBe('allow')
    }
  })

  it('standard asks before mutating tools', () => {
    expect(decideGate('standard', 'bash', [])).toBe('ask')
    expect(decideGate('standard', 'edit', [])).toBe('ask')
    expect(decideGate('standard', 'write', [])).toBe('ask')
    expect(decideGate('standard', 'powershell', [])).toBe('ask')
    expect(decideGate('standard', 'unknown_tool', [])).toBe('ask')
  })

  it('read-only tier denies mutating tools outright', () => {
    expect(decideGate('read-only', 'bash', [])).toBe('deny')
    expect(decideGate('read-only', 'edit', [])).toBe('deny')
    expect(decideGate('read-only', 'write', [])).toBe('deny')
  })

  it('a remembered rule upgrades ask→allow only in the remembering tier', () => {
    expect(decideGate('standard', 'bash', ['bash'])).toBe('allow')
    // Tier wins over remembered rules: read-only still denies.
    expect(decideGate('read-only', 'bash', ['bash'])).toBe('deny')
    // Full access never needed the rule in the first place.
    expect(decideGate('full-access', 'bash', ['bash'])).toBe('allow')
  })
})

describe('remember rules per preset', () => {
  it('start empty for every tier', () => {
    expect(emptyRules()).toEqual({ 'full-access': [], standard: [], 'read-only': [] })
  })

  it('rememberRule adds to exactly one tier, deduped, keeping the rest', () => {
    let rules: RulesByMode = emptyRules()
    rules = rememberRule(rules, 'standard', 'bash')
    rules = rememberRule(rules, 'standard', 'bash')
    rules = rememberRule(rules, 'read-only', 'edit')
    expect(rules).toEqual({ 'full-access': [], standard: ['bash'], 'read-only': ['edit'] })
  })

  it('rulesForMode reads one tier back', () => {
    const rules: RulesByMode = { 'full-access': [], standard: ['bash', 'edit'], 'read-only': [] }
    expect(rulesForMode(rules, 'standard')).toEqual(['bash', 'edit'])
    expect(rulesForMode(rules, 'full-access')).toEqual([])
  })
})
