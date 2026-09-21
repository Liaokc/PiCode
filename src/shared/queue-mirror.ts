/**
 * Queue mirror (ticket 100, CONTEXT.md: 队列面板修缮): the host-side pure
 * model behind the queue panel's inline Edit / per-row × removal.
 *
 * WHY A MIRROR EXISTS: the SDK 0.85.1 queue face is text-only —
 * `queue_update` carries `steering`/`followUp` string arrays (no ids, no
 * images), `clearQueue()` returns text arrays and empties both queues, and
 * there is no single-entry removal. Yet a queued Steer/Follow-up message
 * DOES carry its images inside the SDK's internal queue (they ride the
 * content at enqueue time). The host therefore mirrors every entry it
 * enqueues — raw text (the Edit prefill's 原文) + images (their only
 * reliable source) — and keeps the mirror aligned with the SDK's
 * text arrays by occurrence matching on every sighting.
 *
 * THE DANCE (edit or remove one entry): `clearQueue()` → reconcile the
 * mirror against the RETURN value → drop the target → re-feed the
 * survivors in queue order via the SDK's own steer/followUp, images from
 * the mirror. The clear-returns reconciliation IS the delivery-race
 * strategy: an entry the return value no longer names was delivered inside
 * the millisecond window between the renderer's click and the dance — it
 * drops instead of re-feeding (no double delivery).
 *
 * HONEST LIMITS (recorded, not engineered away): the SDK face is
 * text-only, so two queued entries with byte-identical texts are
 * indistinguishable — occurrence matching binds them in queue order, which
 * can mis-attach mirror images across a race delivery of one of the
 * duplicates. The renderer's row index is likewise an ordinal into the
 * post-reconciliation survivor list, not a row identity. Both windows are
 * millisecond-scale user-race territory; behavior is pinned by the smokes.
 *
 * Pure and SDK-free (Seam-1): every function returns new state, no I/O.
 */

import type { TranscriptImagePart } from './sessions/types'

/** The two SDK queues, named exactly as the contract's queue_update fields. */
export type QueueKind = 'steering' | 'followUp'

export interface QueueMirrorEntry {
  /** The SDK-facing text: what the SDK queue holds for this entry — the raw
   * text unless the SDK's skill/template expansion rewrote it, in which case
   * the expanded form is adopted at first sighting. Re-feed uses this. */
  text: string
  /** What the user actually typed — the inline-Edit prefill's 原文. */
  rawText: string
  /** The enqueue-time attachments; the SDK's text-only queue face cannot
   * return them, so the mirror is their only source across the dance. */
  images: TranscriptImagePart[]
  /** Not yet sighted in any SDK queue array — eligible to adopt its
   * expansion-rewritten text at the next reconcile. */
  fresh: boolean
}

export interface QueueMirror {
  steering: QueueMirrorEntry[]
  followUp: QueueMirrorEntry[]
}

const QUEUE_KINDS: readonly QueueKind[] = ['steering', 'followUp']

export function isQueueKind(value: unknown): value is QueueKind {
  return value === 'steering' || value === 'followUp'
}

export function emptyQueueMirror(): QueueMirror {
  return { steering: [], followUp: [] }
}

/** Record one entry the host just enqueued through the SDK. Fresh until the
 * next sighting binds it (exactly, or adopted onto its expanded text). */
export function enqueueQueueEntry(
  mirror: QueueMirror,
  kind: QueueKind,
  rawText: string,
  images: readonly TranscriptImagePart[]
): QueueMirror {
  const entry: QueueMirrorEntry = { text: rawText, rawText, images: [...images], fresh: true }
  return { ...mirror, [kind]: [...mirror[kind], entry] }
}

/**
 * Align the mirror with one sighting of the SDK's text arrays (a
 * `queue_update` payload — or a `clearQueue()` return value; both are the
 * same {steering, followUp} shape).
 *
 * Per kind the SDK queue is FIFO — deliveries remove the oldest entry,
 * enqueues append — so the sighted array is always the mirror's enqueue
 * order with some entries removed. The alignment is therefore an ordered
 * subsequence walk (pointer per kind), not a free-for-all set match:
 *
 * ① the pointer entry whose `text` equals the sighted text binds it
 *    (images + rawText survive);
 * ② a fresh (never sighted) pointer entry whose text differs ADOPTS the
 *    sighted text — the skill/template expansion case, where the SDK
 *    queued a rewritten form the mirror could not predict — but only when
 *    no later unused entry matches the sighted text exactly (a fresh entry
 *    can also be race-delivered before its own sighting; the exact match
 *    then belongs to the later entry, and the fresh one drops);
 * ③ a pointer entry the walk skips over was delivered (or cleared) — it
 *    drops, exactly the race semantics the dance relies on;
 * ④ a sighted text that binds nothing is skipped (the mirror only tracks
 *    what the host enqueued).
 */
export function reconcileQueueMirror(
  mirror: QueueMirror,
  sdk: { steering: readonly string[]; followUp: readonly string[] }
): QueueMirror {
  const result: QueueMirror = { ...mirror }
  for (const kind of QUEUE_KINDS) {
    const entries = mirror[kind]
    const bound: QueueMirrorEntry[] = []
    let pointer = 0
    for (const text of sdk[kind]) {
      // ②-guard: a later unused exact match wins over adoption.
      const laterExact = entries.findIndex((entry, i) => i > pointer && entry.text === text)
      while (pointer < entries.length) {
        const entry = entries[pointer]!
        if (entry.text === text) {
          bound.push({ ...entry, text, fresh: false })
          pointer++
          break
        }
        if (entry.fresh && laterExact === -1) {
          // ② adoption: the SDK rewrote the raw text before queueing it.
          bound.push({ ...entry, text, fresh: false })
          pointer++
          break
        }
        // ③ delivered (or cleared) before this sighting — drop it.
        pointer++
      }
    }
    result[kind] = bound
  }
  return result
}

/** Remove one entry by kind + ordinal position (the renderer's row index).
 * Out-of-range indexes return the same mirror untouched with `removed`
 * null — the honest no-op when a race delivery shifted the rows. */
export function removeQueueEntryAt(
  mirror: QueueMirror,
  kind: QueueKind,
  index: number
): { mirror: QueueMirror; removed: QueueMirrorEntry | null } {
  if (!Number.isInteger(index) || index < 0 || index >= mirror[kind].length) {
    return { mirror, removed: null }
  }
  const removed = mirror[kind][index]!
  return { mirror: { ...mirror, [kind]: mirror[kind].filter((_, i) => i !== index) }, removed }
}

/** Move one entry WITHIN its own queue (ticket 128, the segment-internal
 * drag): `from` → `to` are ordinals into that queue; the moved entry takes
 * the `to` slot and the entries between shift by one (a standard splice
 * move). The queue is FIFO by injection — the top row injects first — so
 * the drag's 越上越先注入 is exactly this ordering. Out-of-range or
 * non-integer indexes, or from === to, return the mirror untouched — the
 * honest no-op when a race delivery shifted the rows or the drop landed on
 * the dragged row itself. Images and raw texts ride their entries. */
export function reorderQueueEntry(mirror: QueueMirror, kind: QueueKind, from: number, to: number): QueueMirror {
  const entries = mirror[kind]
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return mirror
  if (from < 0 || from >= entries.length || to < 0 || to >= entries.length) return mirror
  const moved = [...entries]
  const [entry] = moved.splice(from, 1)
  moved.splice(to, 0, entry!)
  return { ...mirror, [kind]: moved }
}

/** The final index a queue drop produces (ticket 128): the renderer's
 * half-row geometry (drop above/below the hovered row `rowIndex`) resolved
 * to a post-move ordinal for `reorderQueueEntry`'s splice move — above a
 * row that sits before the dragged one keeps its index, the entries between
 * the dragged row and the drop shift by one. `null` = the drop landed on
 * the dragged row itself (either half): the honest no-op. */
export function queueReorderTarget(from: number, rowIndex: number, above: boolean): number | null {
  if (!Number.isInteger(from) || !Number.isInteger(rowIndex) || rowIndex === from) return null
  if (above) return rowIndex < from ? rowIndex : rowIndex - 1
  return rowIndex < from ? rowIndex + 1 : rowIndex
}

/** The re-feed plan for the dance's survivors: steering entries first, then
 * followUp entries, each in its own queue order, images from the mirror.
 * The host executes the plan through the SDK's own steer/followUp — the
 * identical primitives the entries originally queued through, so the SDK's
 * queue faces never see a shape they didn't already handle. */
export function planQueueRefeed(mirror: QueueMirror): Array<{ kind: QueueKind; text: string; images: TranscriptImagePart[] }> {
  return QUEUE_KINDS.flatMap((kind) =>
    mirror[kind].map((entry) => ({ kind, text: entry.text, images: entry.images }))
  )
}
