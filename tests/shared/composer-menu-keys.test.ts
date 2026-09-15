import { describe, expect, it } from 'vitest'
import { clampIndex, flatMenuKey, type MenuKeyEvent } from '../../src/shared/composer/menu-keys'

/**
 * Ticket 69 (spec R3): ONE keyboard rule for every composer menu. Before
 * this ticket two implementations coexisted and disagreed — the composer's
 * textarea intercept (ArrowDown UNBOUNDED — the actually-effective one,
 * walking the selection past the last row; ArrowUp clamped at 0) and the
 * popover's own flatMenuKey (wrap-around both ways). After it, one shared
 * function owns ↑↓/Enter/Escape for all of them: slash, files, access,
 * model, thinking — and the settings pickers.
 *
 * Boundary rule: CLAMP — the selection stops at both ends. With
 * scrollIntoView following the selection (MenuRow), a wrap would yank a
 * fully-scrolled list back to the top; clamping keeps the view anchored
 * and gives ↑↓ one predictable end-of-list rule across every menu.
 *
 * Shift+Enter is never a pick (unhandled → falls through): the composer
 * inserts a newline in EVERY menu state (ticket 68's invariant, now
 * universal — chip menus simply ignore the modified key).
 */

/** A fake key event in the MenuKeyEvent shape; records preventDefault. */
function key(name: string, shift = false): MenuKeyEvent & { prevented: boolean } {
  return { key: name, shiftKey: shift, prevented: false, preventDefault(): void { this.prevented = true } }
}

/** A recording harness: captures what the handler did to the menu. */
interface Moves {
  indexes: number[]
  picks: number[]
  closed: boolean
}

function drive(event: MenuKeyEvent, count: number, index: number): Moves & { handled: boolean } {
  const moves: Moves = { indexes: [], picks: [], closed: false }
  const handled = flatMenuKey(
    event,
    count,
    index,
    (i) => moves.indexes.push(i),
    (i) => moves.picks.push(i),
    () => {
      moves.closed = true
    }
  )
  return { ...moves, handled }
}

interface Row {
  via: string
  key: string
  shift?: boolean
  count: number
  index: number
  handled: boolean
  /** Expected index transitions (empty = none). */
  to?: number[]
  picks?: number[]
  closed?: boolean
  prevented?: boolean
}

const TABLE: Row[] = [
  // ---- ArrowDown / ArrowUp move by one, clamped — never wrapped
  { via: 'ArrowDown inside the list', key: 'ArrowDown', count: 5, index: 2, handled: true, to: [3], prevented: true },
  { via: 'ArrowDown on the LAST row clamps (no wrap)', key: 'ArrowDown', count: 5, index: 4, handled: true, to: [4], prevented: true },
  { via: 'ArrowUp inside the list', key: 'ArrowUp', count: 5, index: 3, handled: true, to: [2], prevented: true },
  { via: 'ArrowUp on the FIRST row clamps (no wrap)', key: 'ArrowUp', count: 5, index: 0, handled: true, to: [0], prevented: true },
  // single-row menus can't move at all
  { via: 'ArrowDown on a one-row menu', key: 'ArrowDown', count: 1, index: 0, handled: true, to: [0], prevented: true },
  { via: 'ArrowUp on a one-row menu', key: 'ArrowUp', count: 1, index: 0, handled: true, to: [0], prevented: true },
  // defensive: an empty menu (no rows mounted) absorbs the arrows
  { via: 'ArrowDown on an empty menu', key: 'ArrowDown', count: 0, index: 0, handled: true, to: [0], prevented: true },
  // ---- Enter picks the selection; Shift+Enter NEVER picks
  { via: 'Enter picks the selected row', key: 'Enter', count: 5, index: 2, handled: true, picks: [2], prevented: true },
  { via: 'Enter on the last row picks it', key: 'Enter', count: 5, index: 4, handled: true, picks: [4], prevented: true },
  { via: 'Shift+Enter is unhandled (newline owns it)', key: 'Enter', shift: true, count: 5, index: 2, handled: false },
  { via: 'Enter on an empty menu is a no-op', key: 'Enter', count: 0, index: 0, handled: true, prevented: true },
  // ---- Escape closes
  { via: 'Escape closes the menu', key: 'Escape', count: 5, index: 1, handled: true, closed: true, prevented: true },
  // ---- everything else belongs to the caller (typing, Tab, caret moves)
  { via: 'plain typing is unhandled', key: 'a', count: 5, index: 1, handled: false },
  { via: 'Tab is unhandled (focus navigation)', key: 'Tab', count: 5, index: 1, handled: false },
  { via: 'Backspace is unhandled', key: 'Backspace', count: 5, index: 1, handled: false },
  { via: 'Home is unhandled', key: 'Home', count: 5, index: 1, handled: false }
]

describe('flatMenuKey — the one menu keyboard rule (ticket 69)', () => {
  it('resolves every row of the decision table', () => {
    for (const row of TABLE) {
      const event = key(row.key, row.shift ?? false)
      const out = drive(event, row.count, row.index)
      expect(out.handled, row.via).toBe(row.handled)
      expect(out.indexes, row.via).toEqual(row.to ?? [])
      expect(out.picks, row.via).toEqual(row.picks ?? [])
      expect(out.closed, row.via).toBe(row.closed ?? false)
      expect(event.prevented, row.via).toBe(row.prevented ?? false)
    }
  })

  it('never wraps in either direction, at any list length', () => {
    // The decisive anti-wrap probes: one more ArrowDown past the end (and
    // ArrowUp before the start) leaves the selection where it was — the
    // pre-69 wrap rule would cycle it to the opposite end, and the old
    // unbounded ArrowDown would walk the index past the last row.
    for (const count of [2, 3, 5, 8, 12]) {
      const down = drive(key('ArrowDown'), count, count - 1)
      expect(down.indexes, `ArrowDown at the end of ${count}`).toEqual([count - 1])
      const up = drive(key('ArrowUp'), count, 0)
      expect(up.indexes, `ArrowUp at the top of ${count}`).toEqual([0])
    }
  })

  it('a full walk down stops at the last row and back at the first', () => {
    // Keyboard navigation end to end: ArrowDown × (count + 2) must rest on
    // the last row (the old unbounded version would be at count + 2, and a
    // wrap at (count + 2) % count), then ArrowUp × (count + 2) walks back
    // to the first row and stays there.
    const count = 6
    let index = 0
    for (let step = 0; step < count + 2; step++) {
      const out = drive(key('ArrowDown'), count, index)
      expect(out.handled).toBe(true)
      index = out.indexes[0]!
    }
    expect(index).toBe(count - 1)
    for (let step = 0; step < count + 2; step++) {
      const out = drive(key('ArrowUp'), count, index)
      index = out.indexes[0]!
    }
    expect(index).toBe(0)
  })
})

describe('clampIndex — the one clamp every menu index goes through', () => {
  it('clamps into [0, count-1] and normalizes degenerate counts', () => {
    const rows: Array<[number, number, number]> = [
      [2, 5, 2], // interior unchanged
      [-1, 5, 0], // negative → first
      [4, 5, 4], // last stays
      [5, 5, 4], // past the end → last
      [99, 5, 4], // far past → last
      [0, 1, 0], // single row
      [3, 0, 0], // empty menu → 0
      [3, -2, 0] // degenerate count → 0
    ]
    for (const [index, count, want] of rows) {
      expect(clampIndex(index, count), `clampIndex(${index}, ${count})`).toBe(want)
    }
  })
})
