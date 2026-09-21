import { describe, expect, it } from 'vitest'
import { forkAutoName, parseSessionLines, sidebarTitleProjection } from '../../src/shared/sessions/parse.ts'

/**
 * Ticket 130: the fork auto-name projection — table-driven over the source's
 * identity (named / unnamed / over-long), all through the SAME sidebar title
 * projection the index scanner uses (Q7 ruling).
 */

function entriesOf(fileText: string) {
  return parseSessionLines(fileText).entries
}

function headerLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'session',
    version: 3,
    id: 'aaaa1111-1111-1111-1111-111111111111',
    timestamp: '2026-08-27T13:02:33.302Z',
    cwd: '/Users/liaokechen/PiCode',
    ...overrides
  })
}

function messageLine(id: string, parentId: string | null, role: string, content: unknown, timestamp = '2026-08-27T13:05:32.731Z'): string {
  return JSON.stringify({ type: 'message', id, parentId, timestamp, message: { role, content } })
}

function sessionInfoLine(name: string): string {
  return JSON.stringify({ type: 'session_info', id: 'n1', parentId: null, timestamp: '2026-08-27T13:06:00.000Z', name })
}

const text = (t: string): unknown => [{ type: 'text', text: t }]

describe('forkAutoName — the naming projection table (ticket 130)', () => {
  it.each([
    {
      leg: 'named source → "Fork of <source name>"',
      fileText: [headerLine(), messageLine('u1', null, 'user', text('fix the login redirect')), sessionInfoLine('Login redirect hunt')].join('\n'),
      sourceName: 'Login redirect hunt' as string | null,
      expected: 'Fork of Login redirect hunt'
    },
    {
      leg: 'unnamed source → "Fork of <sidebar title projection>" (first user message)',
      fileText: [headerLine(), messageLine('u1', null, 'user', text('fix the login redirect'))].join('\n'),
      sourceName: null,
      expected: 'Fork of fix the login redirect'
    },
    {
      leg: 'unnamed source with a skill prologue → the projection skips it (ticket 42 reuse)',
      fileText: [
        headerLine(),
        messageLine('u1', null, 'user', text('<skill name="implement" location="/tmp/x">\nDo the thing\n</skill>\n\n.ship/issue-130.md'))
      ].join('\n'),
      sourceName: null,
      expected: 'Fork of .ship/issue-130.md'
    },
    {
      leg: 'unnamed source with no user text → "Fork of New Task" (the projection\'s empty fallback)',
      fileText: [headerLine(), messageLine('u1', null, 'system', '')].join('\n'),
      sourceName: null,
      expected: 'Fork of New Task'
    },
    {
      leg: 'over-long source name → truncated to the TITLE_MAX_CHARS budget',
      fileText: [headerLine(), sessionInfoLine('x'.repeat(200))].join('\n'),
      sourceName: 'x'.repeat(200),
      expected: `Fork of ${'x'.repeat(72)}…`
    },
    {
      leg: 'multi-line / spaced source name → collapsed to a single line',
      fileText: [headerLine(), sessionInfoLine('fix  the\n\nlogin   redirect')].join('\n'),
      sourceName: 'fix  the\n\nlogin   redirect',
      expected: 'Fork of fix the login redirect'
    }
  ])('$leg', ({ fileText, sourceName, expected }) => {
    expect(forkAutoName(sourceName, entriesOf(fileText))).toBe(expected)
  })

  it('the unnamed projection equals what the sidebar itself would title the source', () => {
    // The two callers must agree BY CONSTRUCTION: sidebarTitleProjection is
    // the single code path for the index scanner's title and the fork name.
    const fileText = [headerLine(), messageLine('u1', null, 'user', text('why does the build fail?'))].join('\n')
    const entries = entriesOf(fileText)
    expect(forkAutoName(null, entries)).toBe(`Fork of ${sidebarTitleProjection(null, entries)}`)
  })
})

describe('sidebarTitleProjection — the extracted index-scanner projection (ticket 130 refactor)', () => {
  it('prefers the explicit name, then the first user message, then the neutral title', () => {
    const named = entriesOf([headerLine(), messageLine('u1', null, 'user', text('hello')), sessionInfoLine('Chosen')].join('\n'))
    expect(sidebarTitleProjection('Chosen', named)).toBe('Chosen')
    const unnamed = entriesOf([headerLine(), messageLine('u1', null, 'user', text('hello'))].join('\n'))
    expect(sidebarTitleProjection(null, unnamed)).toBe('hello')
    expect(sidebarTitleProjection(null, [])).toBe('New Task')
  })
})
