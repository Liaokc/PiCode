import { describe, expect, it } from 'vitest'
import {
  blockKey,
  codeLanguage,
  codeLanguageFromClassName,
  hastText,
  tableToMarkdown,
  type HastLike
} from '../../src/shared/markdown-blocks'

function text(value: string): HastLike {
  return { type: 'text', value }
}

function element(tagName: string, children: HastLike[] = [], properties: Record<string, unknown> = {}): HastLike {
  return { type: 'element', tagName, children, properties }
}

describe('codeLanguageFromClassName', () => {
  it('reads the language- token from a class array (hast shape)', () => {
    expect(codeLanguageFromClassName(['hljs', 'language-typescript'])).toBe('typescript')
  })

  it('reads the language- token from a plain class string', () => {
    expect(codeLanguageFromClassName('language-bash hljs')).toBe('bash')
  })

  it('returns null without a usable language token', () => {
    expect(codeLanguageFromClassName(['hljs'])).toBeNull()
    expect(codeLanguageFromClassName('language-')).toBeNull()
    expect(codeLanguageFromClassName(undefined)).toBeNull()
    expect(codeLanguageFromClassName(42)).toBeNull()
  })
})

describe('codeLanguage', () => {
  it('reads the language from the first code child', () => {
    const pre = element('pre', [element('code', [text('x')], { className: ['hljs', 'language-python'] })])
    expect(codeLanguage(pre)).toBe('python')
  })

  it('returns null for plain fenced blocks and non-pre shapes', () => {
    expect(codeLanguage(element('pre', [element('code', [text('x')])]))).toBeNull()
    expect(codeLanguage(element('pre', [text('not code')]))).toBeNull()
    expect(codeLanguage(undefined)).toBeNull()
  })
})

describe('hastText', () => {
  it('concatenates text values depth-first across highlight spans', () => {
    const code = element('code', [
      text('const '),
      element('span', [text('x')], { className: 'hljs-keyword' }),
      text(' = 1\n')
    ])
    expect(hastText(code)).toBe('const x = 1\n')
  })

  it("returns '' for missing nodes", () => {
    expect(hastText(undefined)).toBe('')
  })
})

describe('blockKey', () => {
  it('derives a stable key from the start position', () => {
    expect(blockKey({ position: { start: { line: 12, column: 1 } } })).toBe('12:1')
  })

  it('returns null without position data', () => {
    expect(blockKey({})).toBeNull()
    expect(blockKey({ position: { start: {} } })).toBeNull()
    expect(blockKey(undefined)).toBeNull()
  })
})

describe('tableToMarkdown', () => {
  const cell = (value: string): HastLike => element('td', [text(value)])
  const row = (cells: HastLike[]): HastLike => element('tr', cells)

  it('renders a GFM table with a header separator', () => {
    const table = element('table', [
      element('thead', [row([element('th', [text('Field')]), element('th', [text('Rule')])])]),
      element('tbody', [row([cell('email'), cell('≤ 254 chars')])])
    ])
    expect(tableToMarkdown(table)).toBe('| Field | Rule |\n| --- | --- |\n| email | ≤ 254 chars |')
  })

  it('preserves remark-gfm alignment', () => {
    const table = element('table', [element('tbody', [row([cell('a'), cell('b'), cell('c')])])], {
      align: ['left', 'center', 'right']
    })
    expect(tableToMarkdown(table)).toContain('| :--- | :---: | ---: |')
  })

  it('escapes pipes and flattens newlines inside cells', () => {
    const table = element('table', [element('tbody', [row([element('td', [text('a|b\nc')])])])])
    expect(tableToMarkdown(table)).toBe('| a\\|b c |\n| --- |')
  })

  it('keeps inline markup as plain text (code, strong)', () => {
    const table = element('table', [
      element('tbody', [row([element('td', [element('code', [text('x = 1')]), text(' is set')])])])
    ])
    expect(tableToMarkdown(table)).toContain('| x = 1 is set |')
  })

  it('pads ragged rows to the widest row', () => {
    const table = element('table', [element('tbody', [row([cell('a'), cell('b')]), row([cell('only')])])])
    expect(tableToMarkdown(table)).toBe('| a | b |\n| --- | --- |\n| only |  |')
  })

  it("returns '' for non-table or empty shapes", () => {
    expect(tableToMarkdown(undefined)).toBe('')
    expect(tableToMarkdown(element('div'))).toBe('')
    expect(tableToMarkdown(element('table'))).toBe('')
  })
})
