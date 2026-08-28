import { describe, expect, it } from 'vitest'
import type { SlashCommandItem } from '../../src/shared/contract'
import { filterCommands, pickCommand } from '../../src/shared/composer/commands'
import { fuzzyScore } from '../../src/shared/composer/fuzzy'

function cmd(name: string, source: SlashCommandItem['source'], description = ''): SlashCommandItem {
  return { name, description, source }
}

const MENU: SlashCommandItem[] = [
  cmd('model', 'builtin', 'Select model'),
  cmd('compact', 'builtin', 'Compact the conversation'),
  cmd('review', 'prompt', 'Review the current diff'),
  cmd('plan', 'prompt', 'Switch to plan mode'),
  cmd('skill-one', 'skill', 'First skill')
]

describe('fuzzyScore', () => {
  it('null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'compact')).toBeNull()
  })

  it('case-insensitive subsequence match', () => {
    expect(fuzzyScore('CMP', 'compact')).not.toBeNull()
    expect(fuzzyScore('cx', 'compact')).toBeNull()
  })

  it('prefix matches score higher than scattered matches', () => {
    const prefix = fuzzyScore('co', 'compact')
    const scattered = fuzzyScore('co', 'icon-model')
    expect(prefix).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(prefix!).toBeGreaterThan(scattered!)
  })

  it('short queries matching short names rank above long names', () => {
    expect(fuzzyScore('plan', 'plan')!).toBeGreaterThan(fuzzyScore('plan', 'plan-review-extra')!)
  })
})

describe('filterCommands (the `/` menu)', () => {
  it('empty query keeps menu order: built-ins, prompts, skills', () => {
    expect(filterCommands(MENU, '').map((c) => c.name)).toEqual([
      'model',
      'compact',
      'review',
      'plan',
      'skill-one'
    ])
  })

  it('filters out non-matching rows (name or description)', () => {
    expect(filterCommands(MENU, 'conv').map((c) => c.name)).toEqual(['compact'])
  })

  it('ranks name-prefix matches above description-only matches', () => {
    const menu = [cmd('review-next', 'prompt'), cmd('foo', 'prompt', 'review things')]
    expect(filterCommands(menu, 'rev').map((c) => c.name)).toEqual(['review-next', 'foo'])
  })

  it('caps the list length', () => {
    const many = Array.from({ length: 30 }, (_, i) => cmd(`cmd${i}`, 'prompt'))
    expect(filterCommands(many, '')).toHaveLength(12)
  })
})

describe('pickCommand (what executing a row does)', () => {
  it('prompt templates insert "/name " into the composer', () => {
    expect(pickCommand(cmd('review', 'prompt'))).toEqual({ kind: 'insert', text: '/review ' })
  })

  it('skills insert their explicit "/skill:" invocation form', () => {
    expect(pickCommand(cmd('reviewer', 'skill'))).toEqual({ kind: 'insert', text: '/skill:reviewer ' })
  })

  it('built-ins execute as PiCode actions', () => {
    expect(pickCommand(cmd('model', 'builtin'))).toEqual({ kind: 'builtin', name: 'model' })
  })
})
