/**
 * Composer draft preservation (ticket 74, spec R13): the ONE pure model for
 * unsent composer content — text + attached images — that must survive view
 * switches. The ADR-0006 registry keeps every session's view state while the
 * view is elsewhere; the composer's typed-but-unsent content used to be the
 * one piece that did not survive (component-local state, lost on unmount —
 * and leaked across a direct focus switch, where the same Composer instance
 * simply stayed mounted). Storage is split by slot kind — per-session slots
 * live in the session view registry (RegistrySession.draft), the New Task
 * single slot lives at the App layer (the boot empty state and ⌘N share it)
 * — but the record shape, the emptiness rule and the park rule are shared:
 *
 * - 草稿 = 文本 + 已贴图片. Nothing else: caret, menus and the expand state
 *   stay composer-local UI state (ticket 49 semantics — each view starts
 *   from the resting composer shape).
 * - 空槽不存: an EMPTY draft (blank text AND no images) never occupies a
 *   slot — parking one clears it. This unifies set and clear: a send
 *   empties the composer, so the next park (or an explicit clear) leaves
 *   no slot behind.
 * - 内存级: every slot is renderer state — a restart (even a renderer
 *   reload) loses all drafts. Operator decision: no cross-restart
 *   persistence.
 */

import type { ImageAttachment } from '../contract'
import type { ComposerCommandCard } from './commands'

/** Unsent composer content preserved across view switches (ticket 74; the
 * command card joined at ticket 72). */
export interface ComposerDraft {
  text: string
  images: ImageAttachment[]
  /** Ticket 72: the command card occupying the composer's single slot —
   * the args text rides `text`; the invocation is reconstituted on send
   * (composeCommandText). null = no card staged. */
  card?: ComposerCommandCard | null
}

/** Which slot a mounted composer's live draft belongs to. The composer tags
 * its bridge write with its owner, so a switch can park the draft into the
 * right slot no matter which surface is leaving — a focused session's
 * ChatView (per-session registry slot) or the New Task/boot empty state
 * (the shared single slot at the App layer). */
export type ComposerDraftOwner = { kind: 'session'; sessionId: string } | { kind: 'new-task' }

/** One live-draft bridge entry: the mounted composer's owner plus its
 * current draft. The App parks the last entry into the matching slot at
 * every view switch (idempotent — see parkMountedComposerDraft there). */
export interface ComposerDraftEntry {
  owner: ComposerDraftOwner
  draft: ComposerDraft
}

/** Build a draft; the image list is copied so later composer edits never
 * mutate a parked slot. The card is copied too (the single slot is part of
 * the draft — ticket 72). */
export function composerDraft(
  text: string,
  images: readonly ImageAttachment[] = [],
  card: ComposerCommandCard | null = null
): ComposerDraft {
  return { text, images: [...images], card: card === null ? null : { ...card } }
}

/** 空槽不存: a draft occupies a slot only when it has content — non-blank
 * text OR at least one attached image OR a staged command card (the card's
 * invocation is content even with no args typed yet — ticket 72). Whitespace-
 * only text without images or a card is empty (the composer's own send gate
 * uses the same trim rule). */
export function draftIsEmpty(draft: ComposerDraft | null | undefined): boolean {
  if (draft === null || draft === undefined) return true
  return (draft.card ?? null) === null && draft.text.trim() === '' && draft.images.length === 0
}

/** The park rule — set and clear in one: parking a draft with content
 * stores a defensive copy; parking an EMPTY draft clears the slot (null).
 * Both slot kinds run every write through this rule. */
export function parkedDraft(draft: ComposerDraft | null | undefined): ComposerDraft | null {
  if (draft === null || draft === undefined || draftIsEmpty(draft)) return null
  return composerDraft(draft.text, draft.images, draft.card ?? null)
}
