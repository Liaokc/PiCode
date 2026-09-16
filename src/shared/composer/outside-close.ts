/**
 * Ticket 70 (spec R4): the ONE outside-close decision for every
 * ComposerPopover's document-level mousedown listener — pure data in, one
 * boolean out, zero DOM dependency (the Node.contains role is an injected
 * method, so the table-driven suite needs no jsdom).
 *
 * The defect it decides away: clicking the chip that OWNS an open popover
 * used to race itself — the popover's outside-close fired on mousedown and
 * closed the menu, React re-rendered with `menu === null`, and the chip's
 * own click toggle (`menu === x ? null : x`) then RE-OPENED it. Closed and
 * instantly reopened = "the chip never closes" (all three chip menus:
 * access, model, thinking). The fix: the owning chip is EXEMPT from the
 * mousedown close — the chip's click toggle alone closes it (one close,
 * from the click the user actually completed).
 */

/** The one method the decision needs — DOM Nodes already implement it. */
export interface ContainsTarget {
  contains(target: unknown): boolean
}

/** Decide whether one document-level mousedown closes the open popover. */
export function shouldCloseOnOutsideMousedown(input: {
  /** The mounted popover root (null = not mounted — nothing to close). */
  popover: ContainsTarget | null
  /** The element that opened this popover (the owning chip); null for
   * menus with no chip trigger (the slash/file text menus) — they keep
   * the plain outside-close they always had. */
  anchor: ContainsTarget | null
  /** The raw event target (unknown — every DOM node and junk must route). */
  target: unknown
}): boolean {
  const { popover, anchor, target } = input
  // Not mounted: parity with the old `ref.current && …` guard — the
  // listener only exists while a popover is mounted anyway.
  if (popover === null) return false
  // Clicks inside the popover are its own — rows pick on click; closing on
  // their mousedown would kill the pick (and the pre-70 code agreed).
  if (popover.contains(target)) return false
  // The owning chip is NOT an outside click: its mousedown is the first
  // half of the press that the chip's click toggle completes. Closing here
  // is exactly the race — hand the event over untouched.
  if (anchor !== null && anchor.contains(target)) return false
  return true
}
