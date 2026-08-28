/**
 * Fixed-row-height windowing math for the Review tab's diff view. A
 * thousand-line diff scrolls smoothly because only the visible slice (plus a
 * small overscan) is ever mounted; the math here is pure and unit-tested.
 */

/** Line height of a diff row in px — must match `--diff-row-h` in app.css. */
export const DIFF_ROW_HEIGHT_PX = 20

export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  totalRows: number,
  rowHeight: number = DIFF_ROW_HEIGHT_PX,
  overscan = 20
): { start: number; end: number } {
  if (totalRows <= 0) return { start: 0, end: 0 }
  const top = Math.max(0, scrollTop)
  // A scrollTop past the end (stale scroll position after a refresh) clamps
  // to the last row instead of windowing beyond the list.
  const first = Math.min(Math.floor(top / rowHeight), Math.max(0, totalRows - 1))
  const start = Math.max(0, first - overscan)
  const end = Math.min(totalRows, first + Math.ceil(viewportHeight / rowHeight) + overscan)
  return { start, end: Math.max(start, end) }
}
