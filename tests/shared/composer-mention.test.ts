import { describe, expect, it } from 'vitest'
import { applyMention, filterFiles, mentionQueryAt } from '../../src/shared/composer/mention'

const FILES = [
  'src/server/routes/register.ts',
  'src/server/routes/login.ts',
  'src/client/register-form.tsx',
  'README.md',
  'src/rr/index.ts'
]

describe('mentionQueryAt (the active @-token at the caret)', () => {
  it('finds a token at the very start', () => {
    expect(mentionQueryAt('@sr', 3)).toBe('sr')
  })

  it('finds a token after whitespace', () => {
    expect(mentionQueryAt('look at @src/cl', 15)).toBe('src/cl')
  })

  it('returns the bare query right after @', () => {
    expect(mentionQueryAt('@', 1)).toBe('')
  })

  it('cuts the query at the caret, not the token end', () => {
    expect(mentionQueryAt('@src more', 4)).toBe('src')
  })

  it('null when the caret is before the token', () => {
    expect(mentionQueryAt('@src more', 1 + 3 + 1 + 4)).toBeNull()
  })

  it('null when @ is not at a token start', () => {
    expect(mentionQueryAt('mail me@a.com', 13)).toBeNull()
  })

  it('null with no @ at all', () => {
    expect(mentionQueryAt('plain text', 10)).toBeNull()
  })
})

describe('applyMention (inserting a picked path)', () => {
  it('replaces the @-token with the path and a trailing space', () => {
    const result = applyMention('look at @sr and more', 11, 'src/server')
    expect(result.text).toBe('look at src/server  and more')
    expect(result.caret).toBe('look at src/server '.length)
  })

  it('works when the token ends the text', () => {
    const result = applyMention('@RE', 3, 'README.md')
    expect(result.text).toBe('README.md ')
    expect(result.caret).toBe(10)
  })
})

describe('filterFiles (ranking candidate paths for the @ menu)', () => {
  it('matches on basename prefix first', () => {
    expect(filterFiles(FILES, 'reg')[0]).toBe('src/server/routes/register.ts')
  })

  it('matches on path subsequence when the basename does not prefix', () => {
    expect(filterFiles(FILES, 'srcl')[0]).toBe('src/client/register-form.tsx')
  })

  it('drops non-matching paths entirely', () => {
    expect(filterFiles(FILES, 'zzz')).toEqual([])
  })

  it('caps the result at the menu limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => `src/mod${i}/file${i}.ts`)
    expect(filterFiles(many, 'src')).toHaveLength(8)
  })

  it('is case-insensitive', () => {
    expect(filterFiles(FILES, 'readme')).toEqual(['README.md'])
  })
})
