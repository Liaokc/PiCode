import { describe, expect, it } from 'vitest'
import { shouldCloseOnOutsideMousedown, type ContainsTarget } from '../../src/shared/composer/outside-close'

/**
 * Ticket 70 (spec R4): the ONE outside-close decision for every
 * ComposerPopover. Before this ticket the popover's document-level
 * mousedown handler closed on anything outside the popover — including the
 * chip that OWNS the popover. Clicking the owning chip then raced itself:
 * mousedown closed the menu, React re-rendered, and the click landed on the
 * chip's `menu === x ? null : x` toggle with menu already null — the menu
 * bounced right back open ("再点必不收"). All three chip menus (access,
 * model, thinking) hit it.
 *
 * After it, the decision is three ordered rules:
 *   1. inside the popover            → never close (its own clicks)
 *   2. inside the OWNING chip anchor → never close on mousedown — the
 *      chip's click toggle owns the close (mousedown-close + click-toggle
 *      is the race itself)
 *   3. anything else                 → close (a real outside click)
 *
 * The chip menus always pass an anchor (their owning chip); the text menus
 * (slash/files) pass none — anchor null falls through to the plain
 * outside-close they always had.
 */

/** A fake DOM region: a set of "members" plays the Node.contains role. */
function region(members: unknown[]): ContainsTarget {
  const set = new Set(members)
  return { contains: (target) => set.has(target) }
}

interface Row {
  via: string
  popover: ContainsTarget | null
  anchor: ContainsTarget | null
  target: unknown
  close: boolean
}

const CHIP = { members: ['chip', 'chip-icon', 'chip-label'], strangers: ['popover', 'row', 'body', null, undefined] }
const POPOVER = { members: ['popover', 'row'], strangers: ['chip', 'body', null] }

const TABLE: Row[] = [
  // ---- rule 3: a real outside click closes (the pre-existing contract)
  { via: 'a genuine outside target closes', popover: region(POPOVER.members), anchor: region(CHIP.members), target: 'body', close: true },
  { via: 'a real click with NO anchor (text menus) closes', popover: region(POPOVER.members), anchor: null, target: 'body', close: true },
  // nullish targets are never inside anything — outside
  { via: 'a null target closes', popover: region(POPOVER.members), anchor: region(CHIP.members), target: null, close: true },
  { via: 'a non-node target closes', popover: region(POPOVER.members), anchor: region(CHIP.members), target: 42, close: true },
  // ---- rule 2: the owning chip is EXEMPT (the fix itself)
  { via: 'mousedown on the owning chip does not close', popover: region(POPOVER.members), anchor: region(CHIP.members), target: 'chip', close: false },
  { via: 'mousedown INSIDE the owning chip (icon span) does not close', popover: region(POPOVER.members), anchor: region(CHIP.members), target: 'chip-icon', close: false },
  // the exemption is anchor-scoped: a DIFFERENT chip is still outside
  { via: 'mousedown on another chip is a real outside click', popover: region(POPOVER.members), anchor: region(CHIP.members), target: 'other-chip', close: true },
  // ---- rule 1: clicks inside the popover are its own (never close)
  { via: 'mousedown on a popover row does not close', popover: region(POPOVER.members), anchor: region(CHIP.members), target: 'row', close: false },
  { via: 'mousedown inside the popover with no anchor does not close', popover: region(POPOVER.members), anchor: null, target: 'row', close: false },
  // ---- degenerate shapes (defensive, mirrors the old ref guards)
  { via: 'no mounted popover never closes', popover: null, anchor: region(CHIP.members), target: 'body', close: false },
  { via: 'popover null wins even for an anchor member', popover: null, anchor: region(CHIP.members), target: 'chip', close: false }
]

describe('shouldCloseOnOutsideMousedown — the one popover outside-close rule (ticket 70)', () => {
  it('resolves every row of the decision table', () => {
    for (const row of TABLE) {
      const close = shouldCloseOnOutsideMousedown({ popover: row.popover, anchor: row.anchor, target: row.target })
      expect(close, row.via).toBe(row.close)
    }
  })

  it('never closes for a popover member, whatever the anchor', () => {
    // The decisive ordering probe: popover-containment is checked FIRST, so
    // even a target the (hypothetical, overlapping) anchor also contains
    // stays governed by rule 1 — a popover member can never be "outside".
    const popover = region(POPOVER.members)
    const anchor = region([...CHIP.members, 'row']) // anchor also claims the row
    expect(shouldCloseOnOutsideMousedown({ popover, anchor, target: 'row' })).toBe(false)
  })

  it('the chip menus race, replayed as a sequence', () => {
    // The exact defect, replayed event-by-event: menu open, mousedown on
    // the owning chip must NOT close it (pre-70 it did — then the chip's
    // click toggle re-opened the menu it had just closed). The close the
    // user asked for belongs to the chip's click.
    const popover = region(POPOVER.members)
    const anchor = region(CHIP.members)
    expect(shouldCloseOnOutsideMousedown({ popover, anchor, target: 'chip' })).toBe(false)
    // And a genuine outside mousedown still closes on the FIRST event — no
    // reliance on the click ever arriving.
    expect(shouldCloseOnOutsideMousedown({ popover, anchor, target: 'transcript' })).toBe(true)
  })
})
