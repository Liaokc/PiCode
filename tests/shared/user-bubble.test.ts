import { describe, expect, it } from 'vitest'
import { userBubbleSegments, type UserBubbleSegment } from '../../src/shared/user-bubble'
import type { UserEntry } from '../../src/shared/chat-reducer'

const SKILL_TEXT = '<skill name="grilling" location="~/.pi/skills/grilling/SKILL.md">\nbody\n</skill>\n'

function entry(overrides: Partial<UserEntry>): UserEntry {
  return { id: 'u1', role: 'user', text: 'hello', skillName: null, ...overrides }
}

const IMG_A = { kind: 'image' as const, mimeType: 'image/png', data: 'AAAA' }
const IMG_B = { kind: 'image' as const, mimeType: 'image/jpeg', data: 'BBBB' }

/** The kinds of the produced segments — the composition shape under test. */
function kinds(segments: UserBubbleSegment[]): string[] {
  return segments.map((segment) => segment.kind)
}

describe('userBubbleSegments — the composite user bubble (ticket 97)', () => {
  it('table · plain message: one text segment only', () => {
    const segments = userBubbleSegments(entry({ text: 'plain message' }))
    expect(kinds(segments)).toEqual(['text'])
    expect(segments[0]).toEqual({ kind: 'text', text: 'plain message' })
  })

  it('table · skill-only message: the skill segment alone — no empty text box', () => {
    const segments = userBubbleSegments(entry({ text: SKILL_TEXT, skillName: 'grilling' }))
    expect(kinds(segments)).toEqual(['skill'])
    expect(segments[0]).toEqual({ kind: 'skill', name: 'grilling' })
  })

  it('table · skill + text: both segments, skill first', () => {
    const segments = userBubbleSegments(entry({ text: `${SKILL_TEXT}Now grill it`, skillName: 'grilling' }))
    expect(kinds(segments)).toEqual(['skill', 'text'])
    expect(segments[0]).toEqual({ kind: 'skill', name: 'grilling' })
    expect(segments[1]).toEqual({ kind: 'text', text: 'Now grill it' })
  })

  it('table · text + images: text first, images after', () => {
    const segments = userBubbleSegments(entry({ text: 'look at this', images: [IMG_A] }))
    expect(kinds(segments)).toEqual(['text', 'images'])
    expect(segments[1]).toEqual({ kind: 'images', images: [IMG_A] })
  })

  it('table · skill + text + images: the full three-segment composition in order', () => {
    const segments = userBubbleSegments(entry({ text: `${SKILL_TEXT}And look`, skillName: 'grilling', images: [IMG_A, IMG_B] }))
    expect(kinds(segments)).toEqual(['skill', 'text', 'images'])
  })

  it('table · skill + images (stripped text empty): skill then images, no text segment', () => {
    const segments = userBubbleSegments(entry({ text: SKILL_TEXT, skillName: 'grilling', images: [IMG_A] }))
    expect(kinds(segments)).toEqual(['skill', 'images'])
  })

  it('table · images only: the image strip alone', () => {
    const segments = userBubbleSegments(entry({ text: '', images: [IMG_A, IMG_B] }))
    expect(kinds(segments)).toEqual(['images'])
    expect(segments[0]).toEqual({ kind: 'images', images: [IMG_A, IMG_B] })
  })

  it('table · nothing at all (defensive): zero segments — no empty bubble', () => {
    expect(userBubbleSegments(entry({ text: '' }))).toEqual([])
  })

  it('absent images field (pre-97 live entries / legacy payloads) means no image segment', () => {
    expect(kinds(userBubbleSegments(entry({ text: 'plain' })))).toEqual(['text'])
  })

  it('an EMPTY images array means no image segment (never an empty strip)', () => {
    expect(kinds(userBubbleSegments(entry({ text: 'plain', images: [] })))).toEqual(['text'])
  })

  it('defensive: a mismatched skill name leaves the raw text as the text segment', () => {
    const segments = userBubbleSegments(entry({ text: '<skill name="x"> never closed', skillName: 'x' }))
    expect(kinds(segments)).toEqual(['skill', 'text'])
    expect(segments[1]).toEqual({ kind: 'text', text: '<skill name="x"> never closed' })
  })
})
