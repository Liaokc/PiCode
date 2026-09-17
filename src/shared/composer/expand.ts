/**
 * Composer adaptive height (ticket 49, spec R2): two pure projections and
 * the expand state machine. The component measures and renders; every
 * decision lives here so the calibrated numbers stay testable without
 * Electron (composer-density precedent).
 *
 *   自动增高 (auto-grow)  — the input's height follows its content, clamped
 *     [74px, 160px] (ZCode calibration min-h-10/max-h-40 同型; 74 is
 *     PiCode's measured one-line floor). Past the cap the textarea scrolls
 *     internally.
 *
 *   输入展开 (Composer Expand) — an operator-approved deviation from ZCode
 *     (ZCode has no expand button): the persistent top-right button opens
 *     the input IN PLACE at about half the main area's height, clamped
 *     [280px, 560px], pushing the transcript down (no overlay). Ways back:
 *     re-click, Esc, the global ⌘E chord again (ticket 57), and a
 *     successful send.
 */

/** The auto-grow floor: the composer's resting one-line height. */
export const COMPOSER_INPUT_MIN_PX = 74
/** The auto-grow cap (ZCode-calibrated): growth stops, content scrolls inside. */
export const COMPOSER_INPUT_MAX_PX = 160
/** The expanded floor — a usable writing surface on the smallest windows. */
export const COMPOSER_EXPAND_MIN_PX = 280
/** The expanded cap — never swallows the main zone, however tall it is. */
export const COMPOSER_EXPAND_MAX_PX = 560

/** The expand/collapse glide's settle budget: strictly longer than the panes'
 * calibrated --pane-motion-duration (200ms), so the animation-marker cleanup
 * runs only after transitionend could have fired (reduced motion never fires
 * it — the timeout is the only cleanup there). */
export const COMPOSER_EXPAND_ANIM_SETTLE_MS = 300

/**
 * Content measurement → rendered input height, clamped [74, 160]. NaN —
 * the one junk measurement — collapses to the floor so a broken reading
 * can never blow up the composer; Infinity clamps honestly to the cap.
 * Returns whole pixels: scrollHeight is integral, and subpixel heights
 * render as fuzzy borders.
 */
export function composerAutoGrowHeight(contentPx: number): number {
  if (Number.isNaN(contentPx)) return COMPOSER_INPUT_MIN_PX
  return Math.round(Math.min(Math.max(contentPx, COMPOSER_INPUT_MIN_PX), COMPOSER_INPUT_MAX_PX))
}

/**
 * Main-area measurement → expanded input height: about half the main zone,
 * clamped [280, 560]. NaN collapses to the floor; Infinity clamps to the
 * cap.
 */
export function composerExpandHeight(mainAreaPx: number): number {
  if (Number.isNaN(mainAreaPx)) return COMPOSER_EXPAND_MIN_PX
  return Math.round(Math.min(Math.max(mainAreaPx / 2, COMPOSER_EXPAND_MIN_PX), COMPOSER_EXPAND_MAX_PX))
}

/** The expand widget's two states (component-local, never persisted). */
export type ComposerExpandState = 'collapsed' | 'expanded'

/**
 * What drives it: the button's toggle, the global ⌘E chord (ticket 57 —
 * resolved by shared/keymap.ts and routed by the App shell to whichever
 * composer is mounted; toggle semantics, distinct event for provenance),
 * Escape in the textarea (only when no menu owns the key first), and a
 * successful send (dispatch actually handed the text to the session).
 */
export type ComposerExpandEvent = 'toggle' | 'escape' | 'sent' | 'key'

/** The full decision table: expanded only via the button or the ⌘E chord
 * (both self-inverting); every other pairing collapses. The machine is
 * total — no transition is undefined. */
const EXPAND_TRANSITIONS: Readonly<Record<ComposerExpandState, Readonly<Record<ComposerExpandEvent, ComposerExpandState>>>> = {
  collapsed: { toggle: 'expanded', escape: 'collapsed', sent: 'collapsed', key: 'expanded' },
  expanded: { toggle: 'collapsed', escape: 'collapsed', sent: 'collapsed', key: 'collapsed' }
}

export function reduceComposerExpand(state: ComposerExpandState, event: ComposerExpandEvent): ComposerExpandState {
  return EXPAND_TRANSITIONS[state][event]
}

/**
 * The scroll position that keeps the caret's line fully visible inside the
 * scrolled input, or null when it already is (no write). Ticket 81 R7: the
 * auto-grow re-measure resets height to auto, which clamps the scrolled
 * view back to the top at the 160px cap — after re-pinning, the caret's
 * line must be scrolled back into view or the newest typed line stays below
 * the fold (with attachments docked right beneath the input that reads as
 * "the strip covers my new lines").
 *
 * Coordinates: `lineTopPx` is the caret line's flow position from the scroll
 * origin (padding top + line index × line height); visibility is exact
 * containment in [scrollTop, scrollTop + clientHeight]. Junk (NaN/∞) or a
 * non-positive line height/viewport yields null — a broken reading never
 * moves the view. Whole pixels out (scrollTop takes fractional values, but
 * pixel-aligned positions render crisp).
 */
export function composerCaretReveal(input: {
  lineTopPx: number
  lineHeightPx: number
  scrollTopPx: number
  clientHeightPx: number
}): number | null {
  const { lineTopPx, lineHeightPx, scrollTopPx, clientHeightPx } = input
  if (![lineTopPx, lineHeightPx, scrollTopPx, clientHeightPx].every((n) => Number.isFinite(n))) return null
  if (lineHeightPx <= 0 || clientHeightPx <= 0) return null
  const lineBottomPx = lineTopPx + lineHeightPx
  if (lineTopPx >= scrollTopPx && lineBottomPx <= scrollTopPx + clientHeightPx) return null
  // One line is smaller than any real viewport, so at most one edge can
  // violate: below the fold → align the line's bottom to the viewport
  // bottom; above the fold → align its top to the viewport top.
  if (lineTopPx < scrollTopPx) return Math.round(lineTopPx)
  return Math.round(lineBottomPx - clientHeightPx)
}
