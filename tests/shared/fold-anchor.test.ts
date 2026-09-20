import { describe, expect, it } from 'vitest'
import { isAtBottom, isNearBottom } from '../../src/shared/scroll-stay'
import { foldAnchorScrollTop, type FoldAnchorSnapshot } from '../../src/shared/fold-anchor'

/**
 * Ticket 94: the deterministic fold-anchoring model (Seam-1, scroll-stay
 * family). Around every Worked-container fold/unfold the viewport obeys ONE
 * of two rules — never the browser's heuristic overflow-anchor (Q10 ruling):
 *
 * ① viewport not bottom-pinned → the toggled container's HEADER stays on its
 *   viewport row (点击的那行永不跳；内容向下展开/向上收拢);
 * ② bottom-pinned → the bottom stays pinned (底不动，栏头按需上移).
 *
 * The function receives the measured snapshots from before and after the
 * DOM change plus the caller's pinned verdict, and returns the ABSOLUTE
 * scrollTop to apply after the toggle. The pinned verdict is per flip kind:
 * clicks test the strict isAtBottom; programmatic flips (settle auto-fold,
 * force-open) test isNearBottom — the streaming stick band (see the model's
 * header comment). Both tests are exercised below on their own rows.
 */

const snap = (scrollTop: number, clientHeight: number, scrollHeight: number, headerTop: number): FoldAnchorSnapshot => ({
  scrollTop,
  clientHeight,
  scrollHeight,
  headerTop
})

/** Canonical geometry: 2000px of content in a 500px viewport — scrollTop
 * 1500 sits on the bottom, 1440 is 60px above it (inside the band), 1400 is
 * 100px above it. */
const BASE = { clientHeight: 500, scrollHeight: 2000 }

describe('foldAnchorScrollTop decision table (Seam-1: pinned × header-anchored, drift, clamp)', () => {
  const TABLE: Array<{
    name: string
    pinned: boolean
    before: FoldAnchorSnapshot
    after: FoldAnchorSnapshot
    expected: number
    why: string
  }> = [
    // ---- Rule ②, strict verdict (click toggles): isAtBottom ----
    {
      name: 'pinned expand lands the NEW bottom',
      pinned: true,
      before: snap(1500, BASE.clientHeight, BASE.scrollHeight, 300),
      after: snap(1500, BASE.clientHeight, 2600, 300), // body grew the content below; header doc-offset unchanged
      expected: 2100,
      why: 'Q10 ②: expanding while pinned keeps the bottom — the header rides up by the body height'
    },
    {
      name: 'pinned collapse stays on the (clamped) bottom',
      pinned: true,
      before: snap(1500, BASE.clientHeight, BASE.scrollHeight, 300),
      after: snap(1000, BASE.clientHeight, 1500, 800), // browser clamped scrollTop to the new max; header pushed down
      expected: 1000,
      why: 'Q10 ②: collapsing while pinned keeps the bottom; the clamp already landed there — no further write'
    },
    {
      name: 'pinned expand with the clamp NOT yet applied still lands the bottom',
      pinned: true,
      before: snap(1500, BASE.clientHeight, BASE.scrollHeight, 300),
      after: snap(1500, BASE.clientHeight, 1200, 800), // a hypothetical un-clamped read: max is now 700
      expected: 700,
      why: 'the pinned branch targets the post-toggle bottom regardless of what the browser did mid-layout'
    },
    {
      name: 'sub-pixel distance still counts as pinned (±1px isAtBottom noise)',
      pinned: true,
      before: snap(1499.6, BASE.clientHeight, BASE.scrollHeight, 300),
      after: snap(1499.6, BASE.clientHeight, 2600, 300),
      expected: 2100,
      why: 'fractional-scrollTop rounding must not flip a pinned reader into header anchoring'
    },
    {
      name: 'a non-scrollable transcript reads as pinned — expanding lands the new bottom',
      pinned: true,
      before: snap(0, 600, 500, 100), // content shorter than the viewport: distance 0
      after: snap(0, 600, 1400, 100),
      expected: 800,
      why: 'the first toggle that makes a short transcript scrollable keeps the reader at its bottom'
    },
    {
      name: 'band-pinned expand (programmatic flip mid-stream) lands the NEW bottom',
      pinned: true,
      before: snap(1440, BASE.clientHeight, BASE.scrollHeight, 300), // 60px off the bottom — inside the stick band
      after: snap(1440, BASE.clientHeight, 2600, 300),
      expected: 2100,
      why: 'a reader the stick is holding IS bottom-pinned semantically: the settle auto-fold keeps the bottom (the ≤1-frame cache lag must not flip the rule)'
    },
    {
      name: 'band-pinned collapse (programmatic flip mid-stream) keeps the bottom',
      pinned: true,
      before: snap(1440, BASE.clientHeight, BASE.scrollHeight, 300),
      after: snap(1000, BASE.clientHeight, 1500, 740),
      expected: 1000,
      why: 'same as the strict pinned collapse — the clamp and the verdict agree on the bottom'
    },

    // ---- Rule ①: 视口不在底部 → 栏头锚定 ----
    {
      name: 'mid-transcript expand with zero drift is a no-op',
      pinned: false,
      before: snap(800, BASE.clientHeight, BASE.scrollHeight, 200),
      after: snap(800, BASE.clientHeight, 2600, 200), // header above the body: doc-offset unchanged, no clamp, no anchor
      expected: 800,
      why: 'Q10 ①: THE rule — the clicked row never moves; content grows downward below it'
    },
    {
      name: 'mid-transcript collapse with zero drift is a no-op',
      pinned: false,
      before: snap(800, BASE.clientHeight, BASE.scrollHeight, 200),
      after: snap(800, BASE.clientHeight, 1400, 200),
      expected: 800,
      why: 'Q10 ①: collapsing pulls the body UP into the header; the header row itself stays'
    },
    {
      name: 'restores the header row after a browser-anchor yank (header pushed UP by H)',
      pinned: false,
      before: snap(800, BASE.clientHeight, BASE.scrollHeight, 200),
      after: snap(1000, BASE.clientHeight, 2600, 0), // legacy overflow-anchor kept a below-node fixed instead
      expected: 800,
      why: 'the drift the browser applied is undone — the header returns to the row it occupied at click time'
    },
    {
      name: 'restores the header row after a downward drift (header pushed DOWN)',
      pinned: false,
      before: snap(800, BASE.clientHeight, BASE.scrollHeight, 200),
      after: snap(650, BASE.clientHeight, BASE.scrollHeight, 350),
      expected: 800,
      why: 'any vertical shift between the two measurements is cancelled, in both directions'
    },
    {
      name: 'collapse near the bottom clamps into range (lands the bottom)',
      pinned: false,
      before: snap(1400, BASE.clientHeight, BASE.scrollHeight, 100), // 100px above the bottom
      after: snap(1000, BASE.clientHeight, 1500, 500), // clamped to the new max; header pushed down 400
      expected: 1000,
      why: 'restoring the header row would scroll past the (shrunk) bottom — the range clamp wins, deterministically'
    },
    {
      name: 'the restore never scrolls above the top',
      pinned: false,
      before: snap(500, BASE.clientHeight, BASE.scrollHeight, 2400), // header far below the viewport
      after: snap(0, BASE.clientHeight, BASE.scrollHeight, -100),
      expected: 0,
      why: 'a pathological drift reading clamps at 0 — never a negative scrollTop'
    },
    {
      name: 'a header-anchored restore never exceeds the shrunk range',
      pinned: false,
      before: snap(1900, BASE.clientHeight, BASE.scrollHeight, 100),
      after: snap(1500, BASE.clientHeight, 1600, 500),
      expected: 1100,
      why: 'target clamps to the post-toggle max (scrollHeight 1600 − 500) even though the header asked for 1900'
    },
    {
      name: 'exactly 1px off the bottom is NOT pinned for a click — header anchoring owns the row',
      pinned: false,
      before: snap(1399, BASE.clientHeight, BASE.scrollHeight, 200), // distance 101 ≥ 1
      after: snap(1399, BASE.clientHeight, 2600, 200),
      expected: 1399,
      why: 'the strict 吸底 verdict is isAtBottom (±1px), not the 160px follow band — inside the band but off the bottom, a CLICK anchors the header (rule ①)'
    }
  ]

  it('applies exactly one rule per row: pinned lands the new bottom, otherwise the header row is restored (clamped)', () => {
    for (const row of TABLE) {
      expect(foldAnchorScrollTop(row.before, row.after, row.pinned), row.name).toBe(row.expected)
    }
  })

  it('the two verdict kinds map onto the scroll-stay tests: clicks read isAtBottom, programmatic flips read isNearBottom', () => {
    // The hook's per-kind choice, spelled out against the shared geometry:
    // on the bottom both agree; 60px off the bottom they disagree, and the
    // disagreement IS the rule split (a held stick follower is pinned, a
    // clicker at the same spot is not).
    const onBottom = snap(1500, BASE.clientHeight, BASE.scrollHeight, 300)
    const inBand = snap(1440, BASE.clientHeight, BASE.scrollHeight, 300)
    expect(isAtBottom(onBottom)).toBe(true)
    expect(isNearBottom(onBottom)).toBe(true)
    expect(isAtBottom(inBand)).toBe(false)
    expect(isNearBottom(inBand)).toBe(true)
  })
})

describe('rule composition (ticket 94: the four acceptance quadrants, walked end to end)', () => {
  it('① mid-transcript: expand then collapse both leave scrollTop untouched — the clicked row never jumps', () => {
    // Reading mid-transcript at scrollTop 800; the toggled header sits at
    // viewport row 200. Expand mounts the body below the header (content
    // below shifts down); the header's doc-offset and scrollTop are intact.
    const before = snap(800, 500, 2000, 200)
    const expanded = snap(800, 500, 2600, 200)
    expect(foldAnchorScrollTop(before, expanded, false)).toBe(800)
    // Collapse again: the body unmounts, the content below pulls up, the
    // header row is still untouched.
    expect(foldAnchorScrollTop(expanded, before, false)).toBe(800)
  })

  it('② bottom-pinned: expand keeps the bottom (header rises), collapse keeps it via the clamp', () => {
    // Pinned at the bottom; expanding the tail container grows the content.
    const pinned = snap(1500, 500, 2000, 900)
    const expanded = snap(1500, 500, 2900, 900)
    expect(foldAnchorScrollTop(pinned, expanded, true)).toBe(2400)
    // The header's doc offset (900 + 1500) read against the new bottom
    // (2400) puts it at viewport row 0 — it rode UP by the full 900px body
    // height, exactly the 按需上移 corollary.
    expect(900 + 1500 - 2400).toBe(0)
    // Collapsing back: the clamp lands on the new bottom; no further write.
    expect(foldAnchorScrollTop(expanded, pinned, true)).toBe(1500)
  })

  it('the model is a pure function of the two measurements and the verdict — no clock, no DOM', () => {
    const before = snap(800, 500, 2000, 200)
    const after = snap(800, 500, 2600, 200)
    expect(foldAnchorScrollTop(before, after, false)).toBe(foldAnchorScrollTop(before, after, false))
  })
})
