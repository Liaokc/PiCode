import { describe, expect, it } from 'vitest'
import { EDIT_RESEND_TOAST, editResendPrefill } from '../../src/shared/edit-resend'
import type { UserEntry } from '../../src/shared/chat-reducer'

/**
 * Edit & Resend prefill (ticket 79, CONTEXT.md: 编辑重发): clicking Edit on
 * a settled user message prefills the composer with the user's OWN words
 * (the skill-injection prologue is machinery, never user content) plus the
 * replayed message's inline image parts restored as attachments.
 */

function userEntry(overrides: Partial<UserEntry> = {}): UserEntry {
  return { id: 'e1', role: 'user', text: 'fix the login bug', skillName: null, ...overrides }
}

describe('editResendPrefill', () => {
  it('prefills the raw message text for a plain message', () => {
    expect(editResendPrefill(userEntry())).toEqual({ text: 'fix the login bug', images: [] })
  })

  it('strips the injected skill prologue — 原文 is what the user typed', () => {
    const injected =
      '<skill name="tdd" location="/x/SKILL.md">\nbody\n</skill>\n\nfix the login bug'
    expect(editResendPrefill(userEntry({ text: injected, skillName: 'tdd' }))).toEqual({
      text: 'fix the login bug',
      images: []
    })
  })

  it('defensively passes the raw text through when the prologue shape mismatches', () => {
    const raw = '<skill name="tdd">mid-shape'
    expect(editResendPrefill(userEntry({ text: raw, skillName: 'tdd' })).text).toBe(raw)
  })

  it('restores the replayed image parts as attachment state (operator decision: images ride back)', () => {
    const images = [
      { kind: 'image' as const, mimeType: 'image/png', data: 'aGk=' },
      { kind: 'image' as const, mimeType: 'image/jpeg', data: 'amVwZw==' }
    ]
    expect(editResendPrefill(userEntry({ images }))).toEqual({ text: 'fix the login bug', images })
  })

  it('a live-path entry without the images field degrades to no attachments', () => {
    const live: UserEntry = { id: 'm0', role: 'user', text: 'hello', skillName: null }
    expect(editResendPrefill(live).images).toEqual([])
  })

  it('pins the light resend toast wording (fork-toast precedent, all English)', () => {
    expect(EDIT_RESEND_TOAST).toBe('Resent as a new branch — the old branch stays in History.')
  })
})
