import { describe, expect, it } from 'vitest'
import {
  emptyQueueMirror,
  enqueueQueueEntry,
  planQueueRefeed,
  queueReorderTarget,
  reconcileQueueMirror,
  removeQueueEntryAt,
  reorderQueueEntry,
  type QueueMirror,
  type QueueMirrorEntry
} from '../../src/shared/queue-mirror'
import type { TranscriptImagePart } from '../../src/shared/sessions/types'

const IMG_A: TranscriptImagePart = { kind: 'image', mimeType: 'image/png', data: 'AAAA' }
const IMG_B: TranscriptImagePart = { kind: 'image', mimeType: 'image/jpeg', data: 'BBBB' }

function entry(text: string, images: TranscriptImagePart[] = [], rawText = text, fresh = false): QueueMirrorEntry {
  return { text, rawText, images, fresh }
}

function mirror(steering: QueueMirrorEntry[], followUp: QueueMirrorEntry[] = []): QueueMirror {
  return { steering, followUp }
}

describe('queue mirror (ticket 100 Seam-1)', () => {
  describe('enqueue → reconcile binding', () => {
    it('binds a freshly enqueued plain text by exact match and keeps its images', () => {
      const enqueued = enqueueQueueEntry(emptyQueueMirror(), 'steering', 'alpha', [IMG_A])
      expect(enqueued.steering).toEqual([{ text: 'alpha', rawText: 'alpha', images: [IMG_A], fresh: true }])
      // The enqueue's own queue_update sighting binds the entry.
      const bound = reconcileQueueMirror(enqueued, { steering: ['alpha'], followUp: [] })
      expect(bound.steering).toEqual([{ text: 'alpha', rawText: 'alpha', images: [IMG_A], fresh: false }])
      expect(bound.followUp).toEqual([])
    })

    it('adopts the SDK-expanded text for a fresh entry (skill command) and preserves the raw prefill text', () => {
      const enqueued = enqueueQueueEntry(emptyQueueMirror(), 'steering', '/skill:do-it args', [])
      // The SDK expands the raw command before queueing — the sighting never
      // equals the raw text, so the fresh entry adopts the expanded form.
      const bound = reconcileQueueMirror(enqueued, { steering: ['<skill>expanded</skill>args'], followUp: [] })
      expect(bound.steering).toEqual([
        { text: '<skill>expanded</skill>args', rawText: '/skill:do-it args', images: [], fresh: false }
      ])
    })

    it('reconciling an unknown SDK text (never enqueued through the host) creates no entry', () => {
      const result = reconcileQueueMirror(emptyQueueMirror(), { steering: ['ghost'], followUp: [] })
      expect(result.steering).toEqual([])
      expect(result.followUp).toEqual([])
    })
  })

  describe('delivery reconcile (order + images preserved)', () => {
    it('drops exactly the delivered occurrence when duplicate texts exist', () => {
      const state = mirror([
        entry('hi', [IMG_A], 'hi-one'),
        entry('mid'),
        entry('hi', [IMG_B], 'hi-two')
      ])
      // The FIRST 'hi' delivered (the SDK matches delivery order) — the
      // second occurrence must survive with ITS OWN images.
      const after = reconcileQueueMirror(state, { steering: ['mid', 'hi'], followUp: [] })
      expect(after.steering).toEqual([entry('mid'), entry('hi', [IMG_B], 'hi-two')])
    })

    it('keeps the surviving order when the middle entry delivers', () => {
      const state = mirror([entry('a'), entry('b', [IMG_A]), entry('c')])
      const after = reconcileQueueMirror(state, { steering: ['a', 'c'], followUp: [] })
      expect(after.steering.map((e) => e.text)).toEqual(['a', 'c'])
      expect(after.steering[1]?.images).toEqual([])
    })

    it('empties the mirror when every entry delivered', () => {
      const state = mirror([entry('a')], [entry('b', [IMG_A])])
      const after = reconcileQueueMirror(state, { steering: [], followUp: [] })
      expect(after.steering).toEqual([])
      expect(after.followUp).toEqual([])
    })

    it('reconciles each queue kind independently', () => {
      const state = mirror([entry('s1')], [entry('f1'), entry('f2')])
      const after = reconcileQueueMirror(state, { steering: ['s1'], followUp: ['f2'] })
      expect(after.steering.map((e) => e.text)).toEqual(['s1'])
      expect(after.followUp.map((e) => e.text)).toEqual(['f2'])
    })
  })

  describe('clearQueue return reconciliation (the dance, race included)', () => {
    it('keeps only entries the cleared return still names — a race-delivered entry is never re-fed', () => {
      // Last known queue: [alpha(+img), beta]. Alpha DELIVERED inside the
      // millisecond window before clearQueue() ran, so the return value only
      // names beta — alpha must drop (no double delivery), beta keeps its image.
      const state = mirror([entry('alpha', [IMG_A]), entry('beta', [IMG_B])])
      const survivors = reconcileQueueMirror(state, { steering: ['beta'], followUp: [] })
      expect(survivors.steering).toEqual([entry('beta', [IMG_B])])
      expect(planQueueRefeed(survivors)).toEqual([{ kind: 'steering', text: 'beta', images: [IMG_B] }])
    })

    it('binds a fresh (not yet sighted) entry through the cleared return — exact and adopted', () => {
      // Dance raced ahead of the enqueue's queue_update sighting: the fresh
      // entry binds at clear time.
      const exact = enqueueQueueEntry(emptyQueueMirror(), 'followUp', 'plain', [IMG_A])
      const boundExact = reconcileQueueMirror(exact, { steering: [], followUp: ['plain'] })
      expect(boundExact.followUp).toEqual([{ text: 'plain', rawText: 'plain', images: [IMG_A], fresh: false }])
      const expanded = enqueueQueueEntry(emptyQueueMirror(), 'steering', '/skill:x', [])
      const boundAdopted = reconcileQueueMirror(expanded, { steering: ['EXPANDED'], followUp: [] })
      expect(boundAdopted.steering).toEqual([{ text: 'EXPANDED', rawText: '/skill:x', images: [], fresh: false }])
    })
  })

  describe('removeQueueEntryAt', () => {
    it('removes the middle entry and returns its text + images, keeping the rest in order', () => {
      const state = mirror([entry('a'), entry('b', [IMG_A], 'raw-b'), entry('c')])
      const { mirror: after, removed } = removeQueueEntryAt(state, 'steering', 1)
      expect(removed).toEqual(entry('b', [IMG_A], 'raw-b'))
      expect(after.steering.map((e) => e.text)).toEqual(['a', 'c'])
      expect(after.followUp).toEqual([])
    })

    it('removes from the followUp queue independently', () => {
      const state = mirror([entry('s')], [entry('f1'), entry('f2', [IMG_A])])
      const { mirror: after, removed } = removeQueueEntryAt(state, 'followUp', 0)
      expect(removed?.text).toBe('f1')
      expect(after.followUp.map((e) => e.text)).toEqual(['f2'])
      expect(after.steering.map((e) => e.text)).toEqual(['s'])
    })

    it('returns removed=null and leaves the mirror alone for an out-of-range index', () => {
      const state = mirror([entry('a')])
      const { mirror: after, removed } = removeQueueEntryAt(state, 'steering', 3)
      expect(removed).toBeNull()
      expect(after).toBe(state)
      const negative = removeQueueEntryAt(state, 'steering', -1)
      expect(negative.removed).toBeNull()
    })
  })

  describe('planQueueRefeed (保序 + 图片不丢)', () => {
    it('feeds steering survivors first, then followUp survivors, each in queue order, images attached', () => {
      const state = mirror(
        [entry('s1', [IMG_A]), entry('s2'), entry('s3', [IMG_B])],
        [entry('f1', [IMG_A], 'raw-f1'), entry('f2')]
      )
      expect(planQueueRefeed(state)).toEqual([
        { kind: 'steering', text: 's1', images: [IMG_A] },
        { kind: 'steering', text: 's2', images: [] },
        { kind: 'steering', text: 's3', images: [IMG_B] },
        { kind: 'followUp', text: 'f1', images: [IMG_A] },
        { kind: 'followUp', text: 'f2', images: [] }
      ])
    })

    it('plans nothing for an empty mirror', () => {
      expect(planQueueRefeed(emptyQueueMirror())).toEqual([])
    })
  })

  describe('reorderQueueEntry (ticket 128: the segment-internal drag, splice move)', () => {
    it('moves the head below the tail: [s1, s2] → [s2, s1], images and rawText ride their entries', () => {
      const state = mirror([entry('s1', [IMG_A], 'raw-s1'), entry('s2', [], 'raw-s2')])
      const after = reorderQueueEntry(state, 'steering', 0, 1)
      expect(after.steering.map((e) => e.rawText)).toEqual(['raw-s2', 'raw-s1'])
      expect(after.steering[0]?.images).toEqual([])
      expect(after.steering[1]?.images).toEqual([IMG_A])
      // The input mirror is untouched (pure model — every function returns
      // new state).
      expect(state.steering.map((e) => e.rawText)).toEqual(['raw-s1', 'raw-s2'])
    })

    it('moves the tail above the head: the same swap from the other drag direction', () => {
      const state = mirror([entry('s1'), entry('s2')])
      const after = reorderQueueEntry(state, 'steering', 1, 0)
      expect(after.steering.map((e) => e.text)).toEqual(['s2', 's1'])
    })

    it('shifts the entries between by exactly one (middle move, not a swap)', () => {
      const state = mirror([entry('a'), entry('b'), entry('c')])
      expect(reorderQueueEntry(state, 'steering', 0, 2).steering.map((e) => e.text)).toEqual(['b', 'c', 'a'])
      expect(reorderQueueEntry(state, 'steering', 2, 0).steering.map((e) => e.text)).toEqual(['c', 'a', 'b'])
      expect(reorderQueueEntry(state, 'steering', 1, 0).steering.map((e) => e.text)).toEqual(['b', 'a', 'c'])
    })

    it('reorders the followUp queue independently — steering untouched', () => {
      const state = mirror([entry('s1'), entry('s2')], [entry('f1', [IMG_A]), entry('f2')])
      const after = reorderQueueEntry(state, 'followUp', 0, 1)
      expect(after.followUp.map((e) => e.text)).toEqual(['f2', 'f1'])
      expect(after.followUp[1]?.images).toEqual([IMG_A])
      expect(after.steering.map((e) => e.text)).toEqual(['s1', 's2'])
    })

    it('re-feeds the reordered queue in the new order (越上越先注入)', () => {
      const state = reorderQueueEntry(mirror([entry('s1'), entry('s2', [IMG_A])]), 'steering', 0, 1)
      expect(planQueueRefeed(state)).toEqual([
        { kind: 'steering', text: 's2', images: [IMG_A] },
        { kind: 'steering', text: 's1', images: [] }
      ])
    })

    const noOps: Array<{ name: string; from: number; to: number }> = [
      { name: 'from === to (the drop landed on the dragged row)', from: 1, to: 1 },
      { name: 'from out of range (a race delivery emptied the slot)', from: 2, to: 0 },
      { name: 'to out of range', from: 0, to: 5 },
      { name: 'negative from', from: -1, to: 0 },
      { name: 'negative to', from: 0, to: -1 }
    ]
    for (const t of noOps) {
      it(`is the honest no-op: ${t.name}`, () => {
        const state = mirror([entry('a'), entry('b')])
        expect(reorderQueueEntry(state, 'steering', t.from, t.to)).toBe(state)
      })
    }
  })

  describe('queueReorderTarget (ticket 128: the half-row drop geometry → the post-move ordinal)', () => {
    const table: Array<{ name: string; from: number; rowIndex: number; above: boolean; to: number | null }> = [
      { name: 'head dragged, drop below row 1 (the swap): to = 1', from: 0, rowIndex: 1, above: false, to: 1 },
      { name: 'tail dragged, drop above row 0 (the same swap): to = 0', from: 1, rowIndex: 0, above: true, to: 0 },
      { name: 'head dragged, drop above row 1: rows shift up, to = 0', from: 0, rowIndex: 1, above: true, to: 0 },
      { name: 'head dragged, drop above row 0 (the dragged row itself, top half): no-op', from: 0, rowIndex: 0, above: true, to: null },
      { name: 'head dragged, drop below row 2: between, to = 2', from: 0, rowIndex: 2, above: false, to: 2 },
      { name: 'middle dragged, drop above a later row: shift by one, to = 1', from: 1, rowIndex: 2, above: true, to: 1 },
      { name: 'last dragged, drop below row 0: to = 1', from: 2, rowIndex: 0, above: false, to: 1 },
      { name: 'dropped on the dragged row itself (either half): no-op', from: 1, rowIndex: 1, above: false, to: null }
    ]
    for (const t of table) {
      it(t.name, () => {
        expect(queueReorderTarget(t.from, t.rowIndex, t.above)).toBe(t.to)
      })
    }
    it('composes with reorderQueueEntry: the target lands the entry exactly at the drop edge', () => {
      const state = mirror([entry('a'), entry('b'), entry('c')])
      // Drag 'a' (0) below 'c' (2): target 2 → [b, c, a].
      const to = queueReorderTarget(0, 2, false)
      expect(reorderQueueEntry(state, 'steering', 0, to!).steering.map((e) => e.text)).toEqual(['b', 'c', 'a'])
    })
  })

  describe('the edit dance, table-driven (clear → reconcile → drop target → refeed)', () => {
    const table: Array<{
      name: string
      mirror: QueueMirror
      cleared: { steering: string[]; followUp: string[] }
      kind: 'steering' | 'followUp'
      index: number
      /** The entry the dance dropped: edit ops answer with its rawText +
       * images (null = the slot was emptied by the race — no prefill);
       * remove ops drop the same entry but never reply. */
      dropped: { text: string; images: TranscriptImagePart[] } | null
      plan: Array<{ kind: 'steering' | 'followUp'; text: string; images: TranscriptImagePart[] }>
    }> = [
      {
        name: 'edit the MIDDLE of three steering entries: before/after order holds, images survive, target out',
        mirror: mirror([entry('a'), entry('b', [IMG_A], 'raw-b'), entry('c', [IMG_B])]),
        cleared: { steering: ['a', 'b', 'c'], followUp: [] },
        kind: 'steering',
        index: 1,
        dropped: { text: 'raw-b', images: [IMG_A] },
        plan: [
          { kind: 'steering', text: 'a', images: [] },
          { kind: 'steering', text: 'c', images: [IMG_B] }
        ]
      },
      {
        name: 'edit with a race delivery: the delivered head drops, the indexed survivor shifts, prefill still exact',
        mirror: mirror([entry('head', [IMG_A]), entry('mid'), entry('tail')]),
        cleared: { steering: ['mid', 'tail'], followUp: [] },
        kind: 'steering',
        index: 1,
        // The stale index pointed at 'tail' in the pre-race ordering; after
        // the reconciliation it names the same ordinal slot — the honest
        // millisecond-window semantics: the slot, not the row identity.
        dropped: { text: 'tail', images: [] },
        plan: [{ kind: 'steering', text: 'mid', images: [] }]
      },
      {
        name: 'edit an index the race emptied: found=false, every survivor re-fed in order',
        mirror: mirror([entry('a'), entry('b')]),
        cleared: { steering: ['a'], followUp: [] },
        kind: 'steering',
        index: 1,
        dropped: null,
        plan: [{ kind: 'steering', text: 'a', images: [] }]
      },
      {
        name: 'edit a followUp entry: the steering queue re-feeds untouched',
        mirror: mirror([entry('s1', [IMG_A])], [entry('f1'), entry('f2', [IMG_B], 'raw-f2')]),
        cleared: { steering: ['s1'], followUp: ['f1', 'f2'] },
        kind: 'followUp',
        index: 1,
        dropped: { text: 'raw-f2', images: [IMG_B] },
        plan: [{ kind: 'steering', text: 's1', images: [IMG_A] }, { kind: 'followUp', text: 'f1', images: [] }]
      },
      {
        name: 'remove (no prefill) is the same dance minus the target',
        mirror: mirror([], [entry('f1', [IMG_A]), entry('f2')]),
        cleared: { steering: [], followUp: ['f1', 'f2'] },
        kind: 'followUp',
        index: 0,
        // Remove: the same dance, the dropped entry simply discarded.
        dropped: { text: 'f1', images: [IMG_A] },
        plan: [{ kind: 'followUp', text: 'f2', images: [] }]
      }
    ]
    for (const t of table) {
      it(t.name, () => {
        // ① clearQueue() returned — reconcile the mirror against the return.
        const survivors = reconcileQueueMirror(t.mirror, t.cleared)
        // ② drop the target (the edit's removal).
        const { mirror: remaining, removed } = removeQueueEntryAt(survivors, t.kind, t.index)
        // ③ the dropped entry carries the edit prefill (raw text + mirror
        // images); remove ops discard it.
        expect(
          removed !== null ? { text: removed.rawText, images: removed.images } : null
        ).toEqual(t.dropped)
        // ④ the re-feed plan preserves order and images.
        expect(planQueueRefeed(remaining)).toEqual(t.plan)
      })
    }
  })
})
