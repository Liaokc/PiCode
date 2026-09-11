import { describe, expect, it } from 'vitest'
import {
  blockKey,
  codeBody,
  codeFileExtension,
  codeFileName,
  codeLanguage,
  codeLanguageFromClassName,
  codeLanguageLabel,
  codeLineNumbers,
  fenceCardKind,
  fenceMetaOfNode,
  hastText,
  isFenceClosed,
  isMermaidLanguage,
  parseFenceMeta,
  tableToCsv,
  tableToMarkdown,
  tableToTsv,
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

// ---- ticket 60: code-card meta (line numbers / startLine) + download +
//      table CSV/TSV — the ZCode-evidenced completion of the block family ----

describe('parseFenceMeta decision table (Seam-1: ticket 60 meta parameters)', () => {
  const TABLE: Array<{ given: string | null | undefined; noLineNumbers: boolean; startLine: number | null; why: string }> = [
    { given: '', noLineNumbers: false, startLine: null, why: 'an empty meta string is the default shape' },
    { given: null, noLineNumbers: false, startLine: null, why: 'no meta at all is the default shape' },
    { given: undefined, noLineNumbers: false, startLine: null, why: 'a missing meta is the default shape' },
    { given: 'noLineNumbers', noLineNumbers: true, startLine: null, why: 'the bare flag turns the gutter off' },
    { given: '  noLineNumbers  ', noLineNumbers: true, startLine: null, why: 'whitespace around the flag trims away' },
    { given: 'startLine=41', noLineNumbers: false, startLine: 41, why: 'startLine shifts the count' },
    { given: 'startLine=1', noLineNumbers: false, startLine: 1, why: 'startLine=1 is the implicit default, explicitly' },
    { given: 'startLine=0', noLineNumbers: false, startLine: 0, why: 'a zero base is well-defined and honored' },
    { given: 'startLine=41 noLineNumbers', noLineNumbers: true, startLine: 41, why: 'both parameters compose' },
    { given: 'title=x noLineNumbers', noLineNumbers: true, startLine: null, why: 'unrelated tokens do not disturb the flag' },
    { given: 'title=x startLine=7', noLineNumbers: false, startLine: 7, why: 'unrelated tokens do not disturb the count' },
    { given: 'startLine=abc', noLineNumbers: false, startLine: null, why: 'a non-numeric startLine degrades to the default count' },
    { given: 'startLine=-3', noLineNumbers: false, startLine: null, why: 'a negative startLine degrades to the default count' },
    { given: 'startLine=', noLineNumbers: false, startLine: null, why: 'a valueless startLine degrades to the default count' },
    { given: 'startLine=5x', noLineNumbers: false, startLine: null, why: 'a partially numeric token is not a startLine' },
    { given: 'nolineNumbers', noLineNumbers: false, startLine: null, why: 'the flag token is case-sensitive (a superstring is not the flag)' },
    { given: 'STARTLINE=41', noLineNumbers: false, startLine: null, why: 'startLine is case-sensitive like the meta arrived' },
    { given: 'noLineNumbers=true', noLineNumbers: false, startLine: null, why: 'the flag is a bare token — a key=value spelling is just an unknown token (ZCode reads the bare flag)' }
  ]

  it('parses exactly the two meta parameters out of the info string', () => {
    for (const row of TABLE) {
      expect(parseFenceMeta(row.given), row.why).toEqual({ noLineNumbers: row.noLineNumbers, startLine: row.startLine })
    }
  })
})

describe('fenceMetaOfNode (Seam-1: meta read off the hast code child)', () => {
  const preWithMeta = (meta: unknown): HastLike => ({
    type: 'element',
    tagName: 'pre',
    children: [
      {
        type: 'element',
        tagName: 'code',
        properties: { className: ['hljs', 'language-js'] },
        children: [text('x')],
        data: meta === undefined ? undefined : { meta }
      }
    ]
  })

  it('reads the meta string from the first code child (mdast-util-to-hast data.meta)', () => {
    expect(fenceMetaOfNode(preWithMeta('noLineNumbers startLine=9'))).toEqual({ noLineNumbers: true, startLine: 9 })
    expect(fenceMetaOfNode(preWithMeta('startLine=41'))).toEqual({ noLineNumbers: false, startLine: 41 })
  })

  it('degrades to the default shape without usable meta data', () => {
    expect(fenceMetaOfNode(preWithMeta(undefined))).toEqual({ noLineNumbers: false, startLine: null })
    expect(fenceMetaOfNode(preWithMeta(42))).toEqual({ noLineNumbers: false, startLine: null })
    expect(fenceMetaOfNode(element('pre', [text('not code')]))).toEqual({ noLineNumbers: false, startLine: null })
    expect(fenceMetaOfNode(undefined)).toEqual({ noLineNumbers: false, startLine: null })
  })
})

describe('codeLineNumbers decision table (Seam-1: the gutter projection)', () => {
  const TABLE: Array<{
    given: { noLineNumbers: boolean; startLine: number | null }
    lineCount: number
    expected: number[] | null
    why: string
  }> = [
    { given: { noLineNumbers: false, startLine: null }, lineCount: 3, expected: [1, 2, 3], why: 'numbers default ON from 1 (the operator ruling)' },
    { given: { noLineNumbers: false, startLine: 41 }, lineCount: 3, expected: [41, 42, 43], why: 'startLine=N shifts the count' },
    { given: { noLineNumbers: false, startLine: 0 }, lineCount: 2, expected: [0, 1], why: 'a zero base counts from zero' },
    { given: { noLineNumbers: true, startLine: null }, lineCount: 3, expected: null, why: 'noLineNumbers turns the gutter off entirely' },
    { given: { noLineNumbers: true, startLine: 41 }, lineCount: 3, expected: null, why: 'the flag wins over any startLine' },
    { given: { noLineNumbers: false, startLine: null }, lineCount: 1, expected: [1], why: 'a single line still numbers' },
    { given: { noLineNumbers: false, startLine: null }, lineCount: 0, expected: [], why: 'zero lines project zero numbers' }
  ]

  it('projects the exact number sequence the gutter renders', () => {
    for (const row of TABLE) {
      expect(codeLineNumbers(row.given, row.lineCount), row.why).toEqual(row.expected)
    }
  })
})

describe('codeBody (Seam-1: per-line token split for the gutter)', () => {
  const span = (className: string, children: HastLike[]): HastLike => element('span', children, { className })

  it('splits plain text into logical lines, dropping the trailing-newline tail', () => {
    const pre = element('pre', [element('code', [text('a\nb\nc\n')])])
    expect(codeBody(pre)).toEqual({
      className: undefined,
      lines: [[{ text: 'a', className: null }], [{ text: 'b', className: null }], [{ text: 'c', className: null }]]
    })
  })

  it('keeps highlight spans as tokens, re-opening them across line breaks', () => {
    const pre = element('pre', [
      element('code', [text('const '), span('hljs-keyword', [text('let')]), text(' x = 1\n')], { className: ['hljs', 'language-js'] })
    ])
    expect(codeBody(pre)).toEqual({
      className: ['hljs', 'language-js'],
      lines: [
        [{ text: 'const ', className: null }, { text: 'let', className: 'hljs-keyword' }, { text: ' x = 1', className: null }]
      ]
    })
  })

  it('carries a multi-line token onto every line it spans (block comment)', () => {
    const pre = element('pre', [element('code', [text('a\n'), span('hljs-comment', [text('/* c1\nc2 */')]), text('\nb\n')])])
    expect(codeBody(pre)).toEqual({
      className: undefined,
      lines: [
        [{ text: 'a', className: null }],
        [{ text: '/* c1', className: 'hljs-comment' }],
        [{ text: 'c2 */', className: 'hljs-comment' }],
        [{ text: 'b', className: null }]
      ]
    })
  })

  it('keeps blank lines as empty token lists', () => {
    const pre = element('pre', [element('code', [text('a\n\nb\n')])])
    expect(codeBody(pre).lines).toEqual([
      [{ text: 'a', className: null }],
      [],
      [{ text: 'b', className: null }]
    ])
  })

  it('renders a fully empty block as one empty line', () => {
    const pre = element('pre', [element('code', [text('')])])
    expect(codeBody(pre)).toEqual({ className: undefined, lines: [[]] })
  })

  it('reads a plain-string className the same as the hast array shape', () => {
    const pre = element('pre', [element('code', [span('hljs-string hljs-quote', [text('"x"')]), text('\n')])])
    expect(codeBody(pre).lines).toEqual([[{ text: '"x"', className: 'hljs-string hljs-quote' }]])
  })

  it('nests: an inner span class wins over its ancestor for the tokens it wraps', () => {
    const pre = element('pre', [element('code', [span('hljs-outer', [span('hljs-inner', [text('x\ny')])]), text('\n')])])
    expect(codeBody(pre).lines).toEqual([
      [{ text: 'x', className: 'hljs-inner' }],
      [{ text: 'y', className: 'hljs-inner' }]
    ])
  })

  it('returns no lines for non-code or missing shapes', () => {
    expect(codeBody(element('pre', [text('not code')]))).toEqual({ className: undefined, lines: [[]] })
    expect(codeBody(undefined)).toEqual({ className: undefined, lines: [[]] })
  })
})

describe('tableToCsv / tableToTsv decision tables (Seam-1: ticket 60 delimited copy)', () => {
  const cell = (value: string): HastLike => element('td', [text(value)])
  const row = (cells: HastLike[]): HastLike => element('tr', cells)
  const table = (rows: HastLike[], properties: Record<string, unknown> = {}): HastLike =>
    element('table', [element('thead', [rows[0] ?? row([])]), element('tbody', rows.slice(1))], properties)
  const HEADER = row([element('th', [text('Name')]), element('th', [text('Note')])])

  it('serializes header + rows with commas and no trailing newline', () => {
    const t = table([HEADER, row([cell('pi'), cell('code')]), row([cell('x'), cell('y')])])
    expect(tableToCsv(t)).toBe('Name,Note\npi,code\nx,y')
  })

  it('serializes the same shape with tabs', () => {
    const t = table([HEADER, row([cell('pi'), cell('code')])])
    expect(tableToTsv(t)).toBe('Name\tNote\npi\tcode')
  })

  it('quotes fields containing the delimiter and doubles embedded quotes (RFC 4180)', () => {
    const t = table([HEADER, row([cell('pi, code'), cell('say "hi"')])])
    expect(tableToCsv(t)).toBe('Name,Note\n"pi, code","say ""hi"""')
  })

  it('quotes a tab-bearing field in TSV even though it reads fine in CSV', () => {
    const t = table([HEADER, row([cell('a\tb'), cell('x, y')])])
    expect(tableToTsv(t)).toBe('Name\tNote\n"a\tb"\tx, y')
    expect(tableToCsv(t)).toBe('Name,Note\na\tb,"x, y"')
  })

  it('does NOT escape pipes (that is the markdown format\'s job); cell text is single-line', () => {
    const t = table([row([cell('a|b')]), row([cell('c\nd')])])
    expect(tableToCsv(t)).toBe('a|b\nc d')
    expect(tableToMarkdown(t)).toBe('| a\\|b |\n| --- |\n| c d |')
  })

  it('keeps header-less bodies rectangular and pads ragged rows', () => {
    const t = table([row([cell('a'), cell('b')]), row([cell('only')])])
    expect(tableToCsv(t)).toBe('a,b\nonly,')
  })

  it('preserves remark-gfm rows in document order (thead before tbody)', () => {
    const t = element('table', [
      element('thead', [row([element('th', [text('H')])])]),
      element('tbody', [row([cell('body1')])]),
      element('tbody', [row([cell('body2')])])
    ])
    expect(tableToCsv(t)).toBe('H\nbody1\nbody2')
  })

  it("returns '' for non-table or empty shapes", () => {
    expect(tableToCsv(undefined)).toBe('')
    expect(tableToCsv(element('div'))).toBe('')
    expect(tableToCsv(element('table'))).toBe('')
    expect(tableToTsv(undefined)).toBe('')
  })
})

describe('codeFileExtension / codeFileName (Seam-1: download naming)', () => {
  const TABLE: Array<{ given: string | null; ext: string; why: string }> = [
    { given: 'typescript', ext: 'ts', why: 'the language name maps to its canonical extension' },
    { given: 'typescript ', ext: 'ts', why: 'info tokens arrive as typed — trim first' },
    { given: 'Python', ext: 'py', why: 'case-insensitive, and the alias maps to the file extension' },
    { given: 'javascript', ext: 'js', why: 'the full name maps too' },
    { given: 'shell', ext: 'sh', why: 'shell aliases collapse onto one extension' },
    { given: 'mermaid', ext: 'mmd', why: 'a mermaid fallback card downloads its source as mermaid' },
    { given: 'text', ext: 'txt', why: 'the untagged fallback label downloads as text' },
    { given: 'json', ext: 'json', why: 'already-extension-shaped tags pass through' },
    { given: 'rs', ext: 'rs', why: 'an already-extension tag passes through' },
    { given: 'foobar', ext: 'foobar', why: 'an unknown but safe token derives its own extension' },
    { given: 'Foo_Bar9', ext: 'foo_bar9', why: 'safe tokens normalize to lowercase' },
    { given: 'c++', ext: 'cpp', why: 'a punctuation alias maps explicitly' },
    { given: 'c#', ext: 'cs', why: 'another punctuation alias maps explicitly' },
    { given: 'some lang', ext: 'txt', why: 'a token with whitespace is not a safe extension' },
    { given: '../../etc/passwd', ext: 'txt', why: 'path-like input can never become an extension' },
    { given: '.hidden', ext: 'txt', why: 'a dotfile-ish token is not a safe extension' },
    { given: 'a'.repeat(17), ext: 'txt', why: 'an overlong token is not a safe extension' },
    { given: '', ext: 'txt', why: 'an empty token falls back to text' },
    { given: null, ext: 'txt', why: 'a missing language falls back to text' }
  ]

  it('derives the download extension from the fence language', () => {
    for (const row of TABLE) {
      expect(codeFileExtension(row.given), row.why).toBe(row.ext)
    }
  })

  it('wraps the extension in a neutral snippet filename', () => {
    expect(codeFileName('typescript')).toBe('snippet.ts')
    expect(codeFileName(null)).toBe('snippet.txt')
  })
})
