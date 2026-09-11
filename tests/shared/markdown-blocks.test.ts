import { describe, expect, it } from 'vitest'
import {
  blockKey,
  codeLanguage,
  codeLanguageFromClassName,
  codeLanguageLabel,
  fenceCardKind,
  hastText,
  isFenceClosed,
  isMermaidLanguage,
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

describe('codeLanguageLabel decision table (Seam-1: ticket 50 untagged fallback)', () => {
  const pre = (className?: unknown): HastLike =>
    element('pre', [element('code', [text('x')], className === undefined ? {} : { className })])

  const TABLE: Array<{ given: HastLike | undefined; label: string; why: string }> = [
    { given: pre(['hljs', 'language-json']), label: 'json', why: 'a tagged fence keeps its language — zero regression' },
    { given: pre('language-bash hljs'), label: 'bash', why: 'the plain-string class shape reads the same' },
    { given: pre(), label: 'text', why: 'a bare fenced block falls back to text (ZCode same-shape)' },
    { given: pre(['hljs']), label: 'text', why: 'a highlight class alone is not a language tag' },
    { given: pre('language-'), label: 'text', why: 'the bare language- prefix is not a tag' },
    { given: pre(['language-   ']), label: 'text', why: 'a whitespace-only token trims into the fallback' },
    { given: element('pre', [text('not code')]), label: 'text', why: 'non-code shapes still get a label' },
    { given: undefined, label: 'text', why: 'a missing node still gets a label' }
  ]

  it('always yields a display label: language when tagged, text otherwise', () => {
    for (const row of TABLE) {
      expect(codeLanguageLabel(row.given), row.why).toBe(row.label)
    }
  })

  it('never returns null or an empty string, whatever the fence carries', () => {
    for (const row of TABLE) {
      const label = codeLanguageLabel(row.given)
      expect(label.length, row.why).toBeGreaterThan(0)
    }
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

describe('isMermaidLanguage (ticket 59: fence lang gate)', () => {
  const TABLE: Array<{ given: string | null; mermaid: boolean; why: string }> = [
    { given: 'mermaid', mermaid: true, why: 'the exact tag routes to the diagram machinery' },
    { given: '  mermaid  ', mermaid: true, why: 'whitespace around the info token trims away' },
    { given: 'MERMAID', mermaid: true, why: 'info tokens are case-insensitive in practice' },
    { given: 'mermaidx', mermaid: false, why: 'a superstring is not the tag' },
    { given: 'typescript', mermaid: false, why: 'every other language keeps the plain code card' },
    { given: 'text', mermaid: false, why: 'the untagged fallback label is not mermaid' },
    { given: null, mermaid: false, why: 'a missing tag is not mermaid' }
  ]

  it('accepts only the mermaid tag (trimmed, case-insensitive)', () => {
    for (const row of TABLE) {
      expect(isMermaidLanguage(row.given), row.why).toBe(row.mermaid)
    }
  })
})

describe('isFenceClosed (ticket 59: streaming-vs-closed projection)', () => {
  const TABLE: Array<{ given: string; offset: number | undefined; closed: boolean; why: string }> = [
    {
      given: '```mermaid\nflowchart TD\n  A --> B\n```\n\ndone.',
      offset: 0,
      closed: true,
      why: 'a fence closed mid-document is closed'
    },
    {
      given: '```mermaid\nflowchart TD\n  A --> B\n```',
      offset: 0,
      closed: true,
      why: 'a fence closed at EOF is closed (no trailing newline needed)'
    },
    {
      given: '```mermaid\nflowchart TD\n  A --> B',
      offset: 0,
      closed: false,
      why: 'EOF inside the fence = the streaming shape — open'
    },
    {
      given: '```mermaid\nflowchart TD\n  A --> B\n``',
      offset: 0,
      closed: false,
      why: 'a partially-streamed closing marker does not close (needs the full marker)'
    },
    {
      given: '```mermaid\nflowchart TD\n  A --> B\n```\n```mermaid\n  C --> D',
      offset: 0,
      closed: true,
      why: 'the FIRST closing fence closes; later content (even a new open fence) is irrelevant'
    },
    {
      given: '~~~mermaid\nflowchart TD\n~~~',
      offset: 0,
      closed: true,
      why: 'tilde fences close on their own marker'
    },
    {
      given: '~~~mermaid\nflowchart TD\n```',
      offset: 0,
      closed: false,
      why: 'backticks do not close a tilde fence'
    },
    {
      given: '````mermaid\nflowchart TD\n```\n````',
      offset: 0,
      closed: true,
      why: 'a 4-backtick fence closes on 4+ backticks (3 inside are content)'
    },
    {
      given: '   ```mermaid\nflowchart TD\n   ```',
      offset: 0,
      closed: true,
      why: 'indented (≤3 spaces) fences close like bare ones'
    },
    {
      given: '```mermaid title=x\nflowchart TD\n```',
      offset: 0,
      closed: true,
      why: 'an info string with extra tokens still reads as one fence'
    },
    {
      given: 'not a fence at all',
      offset: 0,
      closed: true,
      why: 'a non-fence offset has no streaming ambiguity — closed'
    },
    {
      given: '```mermaid\nflowchart TD\n```',
      offset: undefined,
      closed: false,
      why: 'no position data degrades to the safe (source-card) answer'
    },
    {
      given: '```mermaid\nflowchart TD\n```',
      offset: 999,
      closed: false,
      why: 'an out-of-range offset degrades to the safe answer too'
    }
  ]

  it('projects the closed/streaming state of the fence opening at the offset', () => {
    for (const row of TABLE) {
      expect(isFenceClosed(row.given, row.offset), row.why).toBe(row.closed)
    }
  })
})

describe('fenceCardKind decision table (Seam-1: ticket 59 diagram vs source)', () => {
  const TABLE: Array<{
    given: { lang: string | null; closed: boolean; parseOk: boolean | null }
    kind: 'diagram' | 'source'
    why: string
  }> = [
    {
      given: { lang: 'mermaid', closed: true, parseOk: true },
      kind: 'diagram',
      why: 'closed + parse success → the diagram card'
    },
    {
      given: { lang: 'mermaid', closed: true, parseOk: false },
      kind: 'source',
      why: 'parse failure falls back to the source card (lang chip unchanged, no toast)'
    },
    {
      given: { lang: 'mermaid', closed: true, parseOk: null },
      kind: 'source',
      why: 'parse still in flight → source card until the verdict lands'
    },
    {
      given: { lang: 'mermaid', closed: false, parseOk: null },
      kind: 'source',
      why: 'streaming (unclosed) fences show source — mermaid needs the full text'
    },
    {
      given: { lang: 'mermaid', closed: false, parseOk: true },
      kind: 'source',
      why: 'defensive: a parse verdict is never trusted while the fence is open'
    },
    {
      given: { lang: 'typescript', closed: true, parseOk: true },
      kind: 'source',
      why: 'non-mermaid fences never become diagrams'
    },
    {
      given: { lang: null, closed: true, parseOk: true },
      kind: 'source',
      why: 'untagged fences never become diagrams'
    }
  ]

  it('routes exactly the closed + parse-ok mermaid fence to the diagram card', () => {
    for (const row of TABLE) {
      expect(fenceCardKind(row.given), row.why).toBe(row.kind)
    }
  })
})
