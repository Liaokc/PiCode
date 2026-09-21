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
 *
 *   typing-commit (ticket 116, spec R11) — a value change (input and
 *     delete are one path) pins its height through composerTypingHeight:
 *     expanded re-projects the expanded height (content never shrinks the
 *     surface), collapsed keeps the auto-grow regression. The machine's
 *     events (toggle / Esc / ⌘E / sent) stay the ONLY shrink triggers.
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
 * Ticket 116 (spec R11): the typing-commit height decision. Input and
 * delete are ONE path — a value change — and which projection the commit
 * pins branches on expandState, table-driven like the machine above so
 * the split stays testable without Electron:
 *
 *   expanded  → composerExpandHeight(mainAreaPx): the main zone sizes the
 *     box, so typing or deleting can never shrink the writing surface —
 *     contentPx is not consulted (the operator's ~half-zone surface is
 *     the point of the expanded state). The only shrink triggers stay
 *     the machine's: toggle / Esc / ⌘E / sent.
 *
 *   collapsed → composerAutoGrowHeight(contentPx): the ticket-49/81
 *     auto-grow regression — content-driven, clamped [74, 160], past the
 *     cap the textarea scrolls internally.
 *
 * Each row consults only its own measurement; the other arrives as NaN
 * (not gathered on that path — the component measures content only when
 * collapsed, the main zone only when expanded). A collapsed row receiving
 * junk still collapses to the floor through composerAutoGrowHeight's own
 * defense.
 */
export interface ComposerTypingMeasure {
  /** The content height after the honest auto reset — gathered only on the
   * collapsed path; NaN (not gathered) on the expanded path. */
  contentPx: number
  /** The main zone's client height — gathered only on the expanded path;
   * NaN (not gathered) on the collapsed path. */
  mainAreaPx: number
}

const TYPING_HEIGHT_ROWS: Readonly<Record<ComposerExpandState, (measure: ComposerTypingMeasure) => number>> = {
  expanded: (measure) => composerExpandHeight(measure.mainAreaPx),
  collapsed: (measure) => composerAutoGrowHeight(measure.contentPx)
}

export function composerTypingHeight(expandState: ComposerExpandState, measure: ComposerTypingMeasure): number {
  return TYPING_HEIGHT_ROWS[expandState](measure)
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

/** Ticket 117 (spec R12): the measurement feeding composerCaretLineTop —
 * the caret line's top as the component measured it (flow coordinates),
 * plus the two computed metrics that define the visual-line grid. */
export interface ComposerCaretLineMeasure {
  /** The caret line's top in flow coordinates (scroll origin), as measured
   * on the input's mirror — may carry sub-line noise; the grid snaps it. */
  caretTopPx: number
  /** Computed padding-top — the flow coordinate of visual line 0's top. */
  padTopPx: number
  /** Computed line-height — the uniform visual-line grid. */
  lineHeightPx: number
}

/**
 * Ticket 117 (spec R12): the caret's VISUAL line top from measured caret
 * geometry. The ticket-81 reveal derived its line from the hard-line count
 * (`value.split('\n')`), which cannot see soft wrap — every soft-wrapped
 * draft (each CJK draft) computed a line the caret had long left, and the
 * reveal scrolled the view to that ghost line: typing at the bottom jumped
 * the view to the top, and on IME composition updates that write fought
 * the browser's own caret scroll on every keystroke (the operator's 舞步
 * 抖动). The component now MEASURES the caret's line top (a hidden clone
 * of the input holds the text up to the caret and its scrollHeight gives
 * the prefix's line count — the caret sits on its last line); this
 * projection turns that reading into the exact flow-coordinate lineTop
 * that composerCaretReveal consumes.
 *
 * The reading lands inside the line box, so it is snapped to the uniform
 * grid (`padTopPx + k × lineHeightPx`): sub-line noise (measurement
 * offsets, fractional line heights) cannot survive, and the line the caret
 * actually sits on is what comes out.
 *
 * Junk defense (the ticket-81 semantics, unchanged): any non-finite input
 * or a non-positive line height yields null — a broken reading never moves
 * the view. A caret measured above line 0 clamps to line 0.
 */
export function composerCaretLineTop(measure: ComposerCaretLineMeasure): number | null {
  const { caretTopPx, padTopPx, lineHeightPx } = measure
  if (![caretTopPx, padTopPx, lineHeightPx].every((n) => Number.isFinite(n))) return null
  if (lineHeightPx <= 0) return null
  const lineIndex = Math.max(Math.round((caretTopPx - padTopPx) / lineHeightPx), 0)
  return padTopPx + lineIndex * lineHeightPx
}
