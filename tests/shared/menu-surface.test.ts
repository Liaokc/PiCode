import { describe, expect, it } from 'vitest'
import { textMenuSurface, type TextMenuSurface } from '../../src/shared/composer/menu-surface'

/**
 * Ticket 68 (spec R2, shared with R12): ONE trigger surface drives BOTH
 * text menus — the `/` command menu and the `@` file menu open only while
 * the caret sits inside the first-line leading token, and close the moment
 * a newline (Enter/Shift+Enter) or a space is typed or the cursor leaves
 * the token. The decision is a table-driven pure function (Seam-1,
 * slash-gate/keymap precedent): (text, caret) → { kind, query } | null.
 *
 * Key events enter the table as the (text, caret) states they produce —
 * by the time the change event runs, Enter/Shift+Enter have inserted the
 * newline and a space keystroke is in the value — so the surface itself
 * only ever sees text × caret. (Escape stays a renderer-side dismissal;
 * the surface deliberately re-opens when the cursor re-enters the token.)
 */

interface SurfaceRow {
  /** The user action that produced this state (the key-event column). */
  via: string
  text: string
  caret: number
  expect: TextMenuSurface | null
}

const TABLE: SurfaceRow[] = [
  // ---- opening: the trigger typed at position 0, caret inside the token
  { via: 'typed "/"', text: '/', caret: 1, expect: { kind: 'slash', query: '' } },
  { via: 'typed "/com"', text: '/com', caret: 4, expect: { kind: 'slash', query: 'com' } },
  { via: 'typed "/skill:research"', text: '/skill:research', caret: 16, expect: { kind: 'slash', query: 'skill:research' } },
  { via: 'typed "@"', text: '@', caret: 1, expect: { kind: 'files', query: '' } },
  { via: 'typed "@src/fo"', text: '@src/fo', caret: 8, expect: { kind: 'files', query: 'src/fo' } },
  // ---- the SAME table rules the @ menu: mid-text triggers never open
  { via: 'typed "@s" mid-text', text: 'see @s', caret: 6, expect: null },
  { via: 'typed "/com" mid-text', text: 'run /com', caret: 8, expect: null },
  // ---- space closes (the token ends; args after the space stay closed)
  { via: 'typed space after "/com"', text: '/com ', caret: 5, expect: null },
  { via: 'typed space after the skill form', text: '/skill:research ', caret: 16, expect: null },
  { via: 'typed space after "@src"', text: '@src ', caret: 5, expect: null },
  { via: 'typed "/name my task"', text: '/name my task', caret: 13, expect: null },
  // ---- newline closes (Enter or Shift+Enter inserted the line break)
  { via: 'pressed Enter after "/com"', text: '/com\n', caret: 5, expect: null },
  { via: 'pressed Shift+Enter mid-report', text: '/report line one\nline two', caret: 25, expect: null },
  { via: 'pressed Enter after "@src"', text: '@src\n', caret: 5, expect: null },
  // ---- cursor moved out of the token (click / arrows, no text change)
  { via: 'clicked before the "/"', text: '/compact', caret: 0, expect: null },
  { via: 'clicked just after the space', text: '/name my task', caret: 6, expect: null },
  { via: 'clicked back before the space', text: '/name my task', caret: 5, expect: { kind: 'slash', query: 'name' } },
  { via: 'clicked mid-token "/compact"', text: '/compact', caret: 5, expect: { kind: 'slash', query: 'comp' } },
  { via: 'clicked mid-token "@src/app.ts"', text: '@src/app.ts', caret: 5, expect: { kind: 'files', query: 'src/' } },
  // the surface is caret-based, not text-based: the cursor back inside the
  // leading token of a multi-line text re-engages the menu
  { via: 'clicked back into the leading token', text: '/report line one\nline two', caret: 3, expect: { kind: 'slash', query: 're' } },
  // ---- shapes that never trigger
  { via: 'empty composer', text: '', caret: 0, expect: null },
  { via: 'plain text', text: 'plain text', caret: 10, expect: null },
  { via: 'indented command', text: '\t/cmd', caret: 5, expect: null }
]

describe('textMenuSurface — the shared trigger surface (ticket 68)', () => {
  it('resolves every row of the decision table', () => {
    for (const row of TABLE) {
      expect(textMenuSurface(row.text, row.caret), `${row.via} (${JSON.stringify(row.text)} @${row.caret})`).toEqual(
        row.expect
      )
    }
  })

  it('walks the multi-line report: open inside the token, closed forever after', () => {
    // The pi16-slash-menu-multiline scene, step by step: the menu may be
    // open only while the caret is inside the leading token — the first
    // space ends it and no later line ever brings it back.
    const walk: Array<[string, TextMenuSurface | null]> = [
      ['/', { kind: 'slash', query: '' }],
      ['/Report', { kind: 'slash', query: 'Report' }],
      ['/Report title', null],
      ['/Report title\nbody line', null],
      ['/Report title\nbody line\n/three', null]
    ]
    for (const [text, want] of walk) {
      expect(textMenuSurface(text, text.length), JSON.stringify(text)).toEqual(want)
    }
  })

  it('is match-agnostic — zero-match queries still resolve (the render gate owns "no rows, no menu")', () => {
    // Whether commands/files match is the menu's concern: the surface only
    // decides trigger × caret, so the composer can close on zero matches
    // without the surface ever consulting a candidate list.
    expect(textMenuSurface('/skill:zzzqqq', 13)).toEqual({ kind: 'slash', query: 'skill:zzzqqq' })
    expect(textMenuSurface('@no/such/path', 13)).toEqual({ kind: 'files', query: 'no/such/path' })
  })
})
