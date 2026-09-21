import { describe, expect, it } from 'vitest'
import type { SlashCommandItem } from '../../src/shared/contract'
import {
  cardInvocation,
  composeCommandText,
  filterCommands,
  pickCommand,
  stripSkillQuery,
  stripTriggerToken,
  type ComposerCommandCard
} from '../../src/shared/composer/commands'
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

  it('strips a hand-typed /skill: prefix so the inserted form finds its own row (ticket 72)', () => {
    // The composer inserts `/skill:skill-one ` — typing it back by hand must
    // surface the very row that produced it (pi16-slash-no-match-persist).
    expect(filterCommands(MENU, 'skill:skill-one').map((c) => c.name)).toEqual(['skill-one'])
    expect(filterCommands(MENU, 'skill:skill-o').map((c) => c.name)).toEqual(['skill-one'])
    // The bare prefix matches everything (an empty query after the strip).
    expect(filterCommands(MENU, 'skill:')).toHaveLength(MENU.length)
  })

  it('leaves queries without the skill: prefix untouched', () => {
    expect(stripSkillQuery('skill-one')).toBe('skill-one')
    expect(stripSkillQuery('')).toBe('')
    expect(stripSkillQuery('skillful')).toBe('skillful')
    // The strip is a prefix rule, not a substring rule.
    expect(stripSkillQuery('my skill:one')).toBe('my skill:one')
    expect(filterCommands(MENU, 'skill-one').map((c) => c.name)).toEqual(['skill-one'])
  })
})

describe('stripSkillQuery (the `skill:` namespace strip, ticket 72)', () => {
  it('strips the exact prefix only', () => {
    expect(stripSkillQuery('skill:grill')).toBe('grill')
    expect(stripSkillQuery('skill:')).toBe('')
    expect(stripSkillQuery('Skill:grill')).toBe('Skill:grill') // case-sensitive — the surface echoes the typed token
  })
})

describe('the command card (ticket 72: 卡+文本 value structure)', () => {
  it('cardInvocation reconstitutes the wire form per source', () => {
    expect(cardInvocation({ source: 'skill', name: 'grill-me' })).toBe('/skill:grill-me')
    expect(cardInvocation({ source: 'prompt', name: 'review' })).toBe('/review')
  })

  it('composeCommandText recombines the invocation + args byte-exactly', () => {
    // Today's pick inserts `/skill:grill-me ` and the operator appends args;
    // the send text is the trimmed join. The card must produce the SAME
    // string for every arg shape the textarea can hold.
    const skill: ComposerCommandCard = { source: 'skill', name: 'grill-me' }
    expect(composeCommandText(skill, 'fix the bug').trim()).toBe('/skill:grill-me fix the bug')
    // Empty args: the inserted form's trailing space — trim lands on the
    // bare invocation, exactly like sending the untouched insert.
    expect(composeCommandText(skill, '').trim()).toBe('/skill:grill-me')
    expect(composeCommandText(skill, '   ').trim()).toBe('/skill:grill-me')
    // Leading/internal whitespace is the textarea's business — preserved.
    // (' spaced' joins after the invocation's own separator space: exactly
    // the two-space string today's insert + typing produces.)
    expect(composeCommandText(skill, ' spaced').trim()).toBe('/skill:grill-me  spaced')
    expect(composeCommandText(skill, 'a  b').trim()).toBe('/skill:grill-me a  b')
    // Prompt templates ride the same rule with the bare /name form.
    const prompt: ComposerCommandCard = { source: 'prompt', name: 'review' }
    expect(composeCommandText(prompt, 'the diff').trim()).toBe('/review the diff')
    expect(composeCommandText(prompt, '').trim()).toBe('/review')
  })

  it('composeCommandText without a card passes the args through untouched', () => {
    expect(composeCommandText(null, 'plain message')).toBe('plain message')
    expect(composeCommandText(null, '')).toBe('')
  })
})

describe('pickCommand (what executing a row does)', () => {
  it('prompt templates stage a command card (ticket 72: same treatment as skills)', () => {
    expect(pickCommand(cmd('review', 'prompt'))).toEqual({ kind: 'card', card: { source: 'prompt', name: 'review' } })
  })

  it('skills stage a command card carrying the skill source', () => {
    expect(pickCommand(cmd('reviewer', 'skill'))).toEqual({ kind: 'card', card: { source: 'skill', name: 'reviewer' } })
  })

  it('built-ins execute as PiCode actions (the immediate path is untouched)', () => {
    expect(pickCommand(cmd('compact', 'builtin'))).toEqual({ kind: 'builtin', name: 'compact' })
  })
})

describe('stripTriggerToken (ticket 118: picking keeps the pre-existing text)', () => {
  // The trigger surface guarantees the menu can only be open while the
  // caret sits inside the first-line leading token (no whitespace before
  // it), so at pick time the token is the `/` + query up to the caret.
  // The images are NOT a dimension here: they are independent composer
  // state the pick never touches (the electron smoke asserts their
  // survival end to end) — this table locks the text transition only.
  const CASES: Array<{ text: string; caret: number; want: string; note: string }> = [
    // 无前导文本：the whole value IS the trigger token — the pick leaves
    // the ticket-72 empty-args form (token runs to the string's end).
    { text: '/grill', caret: 6, want: '', note: 'bare token' },
    { text: '/g', caret: 2, want: '', note: 'one-char query' },
    // 有前导文本，粘接（the operator repro: draft first, then `/` typed at
    // the very start）：everything after the typed query survives whole.
    { text: '/grillfix the bug', caret: 6, want: 'fix the bug', note: 'glued draft kept whole' },
    { text: '/grill帮我修这个 bug', caret: 6, want: '帮我修这个 bug', note: 'CJK draft kept whole' },
    // 有前导文本，分隔（query typed, separator, args — the caret re-entered
    // the token to pick）：the separator whitespace is consumed with the
    // token so the recomposed send stays byte-identical (single space).
    { text: '/grill fix the bug', caret: 6, want: 'fix the bug', note: 'space separator consumed' },
    { text: '/grill\nfix the bug', caret: 6, want: 'fix the bug', note: 'newline separator consumed' },
    { text: '/grill  fix', caret: 6, want: 'fix', note: 'separator run consumed to the first word' },
    { text: '/grill\tfix', caret: 6, want: 'fix', note: 'tab separator consumed' },
    // caret 位 inside the token：the strip ends at the caret — text after
    // the caret is pre-existing by the surface's own query definition
    // (query = text.slice(1, caret)); nothing beyond the caret is eaten.
    { text: '/grillfix the bug', caret: 3, want: 'illfix the bug', note: 'mid-token caret keeps the tail' },
    { text: '/grill fix the bug', caret: 1, want: 'grill fix the bug', note: 'caret just after the slash' },
    // 全空白尾：the separator runs to the string's end — args empty.
    { text: '/grill   ', caret: 6, want: '', note: 'only separator whitespace remains' }
  ]

  it('strips exactly the trigger token and lands the caret at the remaining head', () => {
    for (const c of CASES) {
      expect(stripTriggerToken(c.text, c.caret), `${c.note}: text=${JSON.stringify(c.text)} caret=${c.caret}`).toEqual({
        value: c.want,
        caret: 0
      })
    }
  })

  it('out-of-domain carets clamp without eating text', () => {
    // Beyond the end: nothing follows the token — empty args.
    expect(stripTriggerToken('/grill', 99)).toEqual({ value: '', caret: 0 })
    // Before the token (caret 0 cannot open the menu): the strip cannot
    // prove anything is the token, so the whole text survives.
    expect(stripTriggerToken('/grill fix', 0)).toEqual({ value: '/grill fix', caret: 0 })
    expect(stripTriggerToken('/grill fix', -3)).toEqual({ value: '/grill fix', caret: 0 })
  })

  it('the kept text recombines byte-identically through composeCommandText', () => {
    // The full pick → send pipeline over the table's operator-repro rows:
    // the card plus the KEPT draft must equal the invocation form the
    // raw-text composer would have sent for the same intent.
    const skill: ComposerCommandCard = { source: 'skill', name: 'grill-me' }
    for (const c of CASES.filter((row) => row.want !== '')) {
      expect(composeCommandText(skill, stripTriggerToken(c.text, c.caret).value).trim()).toBe(
        `/skill:grill-me ${c.want}`
      )
    }
  })
})
