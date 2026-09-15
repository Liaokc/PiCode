import { describe, expect, it } from 'vitest'
import {
  composerDraft,
  draftIsEmpty,
  parkedDraft,
  type ComposerDraft,
  type ComposerDraftOwner
} from '../../src/shared/composer/drafts'
import type { ImageAttachment } from '../../src/shared/contract'

const IMG: ImageAttachment = { mimeType: 'image/png', data: 'aGk=' }

describe('composerDraft (record shape)', () => {
  it('builds a draft from text + images and defensively copies the image list', () => {
    const source: ImageAttachment[] = [IMG]
    const draft = composerDraft('hello', source)
    expect(draft).toEqual({ text: 'hello', images: [IMG] })
    source.push({ mimeType: 'image/jpeg', data: 'eA==' })
    expect(draft.images).toHaveLength(1)
  })

  it('defaults to no images', () => {
    expect(composerDraft('hello')).toEqual({ text: 'hello', images: [] })
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
    [composerDraft('   ', [IMG]), false, 'images count even with whitespace-only text']
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
    expect(parked).toEqual({ text: 'milk', images: [IMG] })
    expect(parked).not.toBe(draft)
    draft.images.push(IMG)
    expect(parked?.images).toHaveLength(1)
  })

  it('parks image-only drafts (images are content even without text)', () => {
    const parked = parkedDraft(composerDraft('  ', [IMG]))
    expect(parked).toEqual({ text: '  ', images: [IMG] })
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
