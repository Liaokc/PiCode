/**
 * Edit & Resend (ticket 79, CONTEXT.md: 编辑重发): the ONE pure model for
 * the edit entry on settled user messages. Clicking Edit issues the existing
 * `navigate_tree` command with the USER entry id — Pi's native
 * edit-and-resubmit semantics: the SDK moves the leaf to that message's
 * PARENT entry (first messages → resetLeaf), same file, lossless, naturally
 * no branch summary — and prefills the composer for the in-place branch the
 * next send creates. No confirmation dialog (the old branch stays reachable
 * in the tree panel). This module owns the prefill derivation and the light
 * resend toast's wording; the flow's wiring lives in App/Composer/ChatView.
 */

import type { UserEntry } from './chat-reducer'
import type { TranscriptImagePart } from './sessions/types'
import { stripSkillPrologue } from './turn-collapse'

/** The light toast fired after the edited message is sent (fork-toast
 * precedent — ticket 51/66; all-English UI copy). */
export const EDIT_RESEND_TOAST = 'Resent as a new branch — the old branch stays in History.'

/** What the composer receives on Edit: the prefill text plus the attachment
 * state restored from the message's image parts (operator decision: images
 * ride back; imageless messages leave them empty). */
export interface EditResendPrefill {
  text: string
  images: TranscriptImagePart[]
}

/**
 * The composer prefill for one settled user message: 原文 = the user's own
 * words (the sniffed skill-injection prologue is machinery the user never
 * typed, so the display text is the resend text — the strip is defensive and
 * passes raw text through on any shape mismatch), and the replayed image
 * parts ride back into the attachment state.
 */
export function editResendPrefill(entry: UserEntry): EditResendPrefill {
  return { text: stripSkillPrologue(entry.text, entry.skillName), images: entry.images ?? [] }
}
