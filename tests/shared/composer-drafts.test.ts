import { describe, expect, it } from 'vitest'
import {
  composerDraft,
  draftIsEmpty,
  parkedDraft,
  type ComposerDraft,
  type ComposerDraftOwner
} from '../../src/shared/composer/drafts'
import type { ComposerCommandCard } from '../../src/shared/composer/commands'
import type { ImageAttachment } from '../../src/shared/contract'

const IMG: ImageAttachment = { mimeType: 'image/png', data: 'aGk=' }
const CARD: ComposerCommandCard = { source: 'skill', name: 'grill-me' }

describe('composerDraft (record shape)', () => {
  it('builds a draft from text + images and defensively copies the image list', () => {
    const source: ImageAttachment[] = [IMG]
    const draft = composerDraft('hello', source)
    expect(draft).toEqual({ text: 'hello', images: [IMG], card: null })
    source.push({ mimeType: 'image/jpeg', data: 'eA==' })
    expect(draft.images).toHaveLength(1)
  })

  it('defaults to no images and no card', () => {
    expect(composerDraft('hello')).toEqual({ text: 'hello', images: [], card: null })
  })

  it('carries the command card (ticket 72): the args ride text, the invocation rides card', () => {
    expect(composerDraft('fix the bug', [], CARD)).toEqual({ text: 'fix the bug', images: [], card: CARD })
    expect(composerDraft('hello', [], null)).toEqual({ text: 'hello', images: [], card: null })
  })
})

describe('draftIsEmpty — 空槽不存: a draft occupies a slot only with content', () => {
  const cases: Array<[ComposerDraft | null | undefined, boolean, string]> = [
    [null, true, 'no draft at all'],
    [undefined, true, 'undefined is empty'],
    [composerDraft('', []), true, 'blank text, no images'],
    [composerDraft('   \n\t ', []), true, 'whitespace-only text without images is empty'],
    [composerDraft('milk', []), false, 'text counts'],
    [composerDraft('', [IMG]), false, 'images count without text'],
    [composerDraft('   ', [IMG]), false, 'images count even with whitespace-only text'],
    [composerDraft('', [], CARD), false, 'a card counts on its own (ticket 72) — the invocation is content'],
    [composerDraft('   ', [], { source: 'prompt', name: 'review' }), false, 'a prompt card counts too']
  ]
  for (const [draft, empty, label] of cases) {
    it(label, () => expect(draftIsEmpty(draft)).toBe(empty))
  }
})

describe('parkedDraft — the slot write rule (set + clear unified by 空槽不存)', () => {
  it('parks an empty draft as NO slot (null)', () => {
    expect(parkedDraft(composerDraft('', []))).toBeNull()
    expect(parkedDraft(composerDraft(' \n ', []))).toBeNull()
    expect(parkedDraft(null)).toBeNull()
    expect(parkedDraft(undefined)).toBeNull()
  })

  it('parks content as a defensive copy', () => {
    const draft = composerDraft('milk', [IMG])
    const parked = parkedDraft(draft)
    expect(parked).toEqual({ text: 'milk', images: [IMG], card: null })
    expect(parked).not.toBe(draft)
    draft.images.push(IMG)
    expect(parked?.images).toHaveLength(1)
  })

  it('parks image-only drafts (images are content even without text)', () => {
    const parked = parkedDraft(composerDraft('  ', [IMG]))
    expect(parked).toEqual({ text: '  ', images: [IMG], card: null })
  })

  it('parks card drafts — the single slot survives view switches (ticket 72)', () => {
    const draft = composerDraft('fix the bug', [], CARD)
    const parked = parkedDraft(draft)
    expect(parked).toEqual({ text: 'fix the bug', images: [], card: CARD })
    expect(parked).not.toBe(draft)
    expect(parked?.card).not.toBe(CARD)
  })

  it('a card-only draft (no args yet) is content, not an empty slot', () => {
    expect(parkedDraft(composerDraft('', [], CARD))).toEqual({ text: '', images: [], card: CARD })
  })

  it('a null card parks as null (the pre-card shape keeps restoring)', () => {
    const parked = parkedDraft(composerDraft('milk', []))
    expect(parked?.card ?? null).toBeNull()
  })
})

describe('ComposerDraftOwner — the slot kinds', () => {
  it('distinguishes the per-session slot from the New Task single slot', () => {
    const session: ComposerDraftOwner = { kind: 'session', sessionId: 's-a' }
    const newTask: ComposerDraftOwner = { kind: 'new-task' }
    expect(session).not.toEqual(newTask)
    expect(session.kind === 'session' && session.sessionId === 's-a').toBe(true)
  })
})
