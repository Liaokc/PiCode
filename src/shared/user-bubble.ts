/**
 * The composite user bubble (ticket 97, spec R19): one pure model decides
 * which segments a user bubble renders, in order — the skill rendering
 * (wand icon + "Skill" + name, the retired container marker's story, now
 * fold-proof and live/settled-constant), the user's own text (the injected
 * skill prologue stripped), and the message's image thumbnails. Segments
 * combine by PRESENCE: a skill-only bubble renders the skill alone (the
 * pre-97 empty gray box is gone), a skill+text bubble renders both, images
 * append after the text. Absent/empty images never produce a segment.
 *
 * The renderer draws exactly what this function returns — every
 * presence/absence combination is table-tested here (testing seam #1).
 */

import type { UserEntry } from './chat-reducer'
import type { TranscriptImagePart } from './sessions/types'
import { stripSkillPrologue } from './turn-collapse'

/** One renderable segment of the user bubble, in composition order. */
export type UserBubbleSegment =
  | { kind: 'skill'; name: string }
  | { kind: 'text'; text: string }
  | { kind: 'images'; images: TranscriptImagePart[] }

/**
 * The bubble segments for one user entry, in order: skill → text → images.
 * Pure — derives everything from the entry (the same shape the live stream
 * and the replay both build), so the composition is isomorphic across both.
 */
export function userBubbleSegments(entry: UserEntry): UserBubbleSegment[] {
  const segments: UserBubbleSegment[] = []
  if (entry.skillName !== null) segments.push({ kind: 'skill', name: entry.skillName })
  const text = stripSkillPrologue(entry.text, entry.skillName)
  if (text !== '') segments.push({ kind: 'text', text })
  if (entry.images !== undefined && entry.images.length > 0) {
    segments.push({ kind: 'images', images: entry.images })
  }
  return segments
}
