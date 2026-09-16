/**
 * The ONE keyboard rule for every composer menu (ticket 69). Before this
 * ticket two implementations coexisted and disagreed — the composer's
 * textarea intercept (ArrowDown unbounded — the actually-effective one for
 * the text menus — with ArrowUp clamped at 0) and the popover's own
 * flatMenuKey (wrap-around both ways). Now one shared function owns
 * ↑↓/Enter/Escape for all of them: slash, files, access, model, thinking,
 * and the settings pickers.
 *
 * Boundary rule: CLAMP — the selection stops at both ends. With
 * scrollIntoView following the selection (MenuRow), a wrap would yank a
 * fully-scrolled list back to the top mid-navigation; clamping keeps the
 * view anchored and gives ↑↓ one predictable end-of-list rule.
 *
 * Shift+Enter is never a pick (unhandled → falls through): the composer
 * inserts a newline in EVERY menu state (ticket 68's invariant, now
 * universal — chip menus simply ignore the modified key).
 */

/** The key-event shape flatMenuKey needs. React's and the DOM's
 * KeyboardEvent both satisfy it structurally; shared code imports neither. */
export interface MenuKeyEvent {
  key: string
  shiftKey: boolean
  preventDefault(): void
}

/** The one clamp every menu index transition goes through: 0 ≤ index ≤
 * count-1 (degenerate counts normalize to 0). No other menu boundary
 * arithmetic is allowed — renderer and tests both route through here. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, Math.min(index, count - 1))
}

/** Handle one keydown for a flat menu. Returns true when the key belonged
 * to the menu (the caller stops processing it); false falls through to the
 * caller's own handling (typing, caret moves, newline, send). */
export function flatMenuKey(
  event: MenuKeyEvent,
  count: number,
  index: number,
  onIndex: (i: number) => void,
  onPick: (i: number) => void,
  onClose: () => void
): boolean {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    onIndex(clampIndex(index + 1, count))
    return true
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    onIndex(clampIndex(index - 1, count))
    return true
  }
  if (event.key === 'Enter') {
    // Shift+Enter never picks: the composer inserts a newline in every
    // menu state (ticket 68); chip menus just ignore the modified key.
    if (event.shiftKey) return false
    event.preventDefault()
    if (count > 0) onPick(index)
    return true
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
    return true
  }
  return false
}
