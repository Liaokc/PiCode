/**
 * Turn-navigator rail model (ticket 46): the Seam-1 pure model behind the
 * transcript's left-edge tick rail (ZCode turn navigator, same type). The
 * renderer component (`NavigatorRail`) renders exactly what this module
 * derives; every decision lives here so it stays table-testable.
 *
 * ZCode-calibrated behavior (read-only forensics, intake-grilling.md R9):
 *   - one tick per real user message (steer / follow-up included);
 *   - the tick bar is equal-width and expresses focus/activity decay via
 *     `scaleX` — the viewport-anchored tick reads full width, its neighbors
 *     thin out by distance with a floor (the constant length DIFFERENCE is
 *     the ZCode look, not per-message widths);
 *   - coloring: focus = foreground, muted = secondary; the viewport-anchored
 *     tick is highlighted at opacity 0.9; a running turn's tick never drops
 *     below 0.72;
 *   - hover opens a two-segment preview bubble (user input clamp 2 + assistant
 *     reply clamp 3, right-popping) after a short open delay, closing after a
 *     shorter one;
 *   - click smooth-scrolls to the user message (DOM lookup first, rAF
 *     fallback until mounted);
 *   - the whole rail stays hidden under 2 ticks, and hidden (with a
 *     fade/translate transition) while the window is narrower than 864px.
 */

import type { TurnGroup } from './turn-collapse'

// ---- ZCode-calibrated constants (behavior parameters, not invented design) ----
// (The rail's static geometry — 48px hit zone, 36px tick column, 12×2px tick
// bars, 320px bubble — lives in app.css next to the rules that use it.)

/** Under this many ticks the rail renders nothing at all (CONTEXT.md: 导航轨). */
export const RAIL_MIN_TICKS = 2
/** Below this window width the rail hides (ZCode calibration). */
export const RAIL_MIN_WINDOW_PX = 864
/** The rail's show/hide fade+translate transition (ms). */
export const RAIL_FADE_MS = 150
/** Preview bubble: right-pop delay before it opens / after leave before it closes. */
export const BUBBLE_OPEN_DELAY_MS = 120
export const BUBBLE_CLOSE_DELAY_MS = 80

/** Opacity of the viewport-anchored (highlighted) tick. */
export const ANCHORED_OPACITY = 0.9
/** Opacity of a live (running) turn's tick — the ≥0.72 running guarantee. */
export const LIVE_MIN_OPACITY = 0.72
export const LIVE_OPACITY = 0.8
/** Opacity of every other tick. */
export const MUTED_OPACITY = 0.45

/** scaleX decay per tick of distance from the anchored one, with a floor. */
export const TICK_SCALE_DECAY = 0.12
export const TICK_SCALE_FLOOR = 0.4

/** Click-to-jump choreography: land the message this far below the top edge,
 * and retry the DOM lookup at most this many animation frames when the
 * target is not mounted yet (rAF fallback). */
export const SCROLL_TARGET_MARGIN_PX = 16
export const SCROLL_RETRY_FRAMES = 12

/** The viewport probe sits this fraction down the scroll container: the last
 * user message at or above it anchors the viewport (its tick reads focus). */
export const VIEWPORT_PROBE_FRACTION = 0.35

// ---- Anchor derivation ----

/** One user-message anchor: a rail tick's identity + preview content. */
export interface RailAnchor {
  /** The boundary user entry's id — React key, DOM `[data-turn-id]` and
   * scroll target. */
  readonly turnId: string
  /** The user's input as displayed (skill prologue already stripped). */
  readonly userText: string
  /** The turn's assistant answer text, joined — the bubble's second segment. */
  readonly replyText: string
  /** True while this turn is the one currently streaming. */
  readonly live: boolean
}

/**
 * Derive the rail anchors from the grouped transcript: exactly one per turn
 * that has a real user message (the defensive head segment — entries before
 * any user message — carries none). Pure.
 */
export function railAnchors(turns: readonly TurnGroup[]): RailAnchor[] {
  const anchors: RailAnchor[] = []
  for (const turn of turns) {
    if (turn.user === null) continue
    anchors.push({
      turnId: turn.id,
      userText: turn.userText,
      // Ticket 53: the reply preview mirrors the transcript — the turn's
      // answer is its last text block, not the narration wall.
      replyText: turn.answer?.text ?? '',
      live: turn.live
    })
  }
  return anchors
}

// ---- Tick scoring (焦点/活跃衰减) ----

export type TickTone = 'focus' | 'muted'

/** One rendered tick: its anchor plus the scored visual state. */
export interface RailTick {
  readonly anchor: RailAnchor
  readonly tone: TickTone
  readonly scaleX: number
  readonly opacity: number
}

/**
 * Score every anchor against the viewport-anchored turn id (null when the
 * viewport sits above every message): the anchored tick reads focus at full
 * width; the rest read muted with distance-decayed width. A live turn's tick
 * keeps the running-prominence opacity unless it is the anchored one.
 * Pure — the decision table the component renders.
 */
export function railTicks(anchors: readonly RailAnchor[], anchored: string | null): RailTick[] {
  const focusedIndex = anchored === null ? -1 : anchors.findIndex((a) => a.turnId === anchored)
  return anchors.map((anchor, index) => {
    const focused = index === focusedIndex
    const distance = focusedIndex < 0 ? Number.POSITIVE_INFINITY : Math.abs(index - focusedIndex)
    const tone: TickTone = focused ? 'focus' : 'muted'
    const scaleX = focused ? 1 : Math.max(TICK_SCALE_FLOOR, 1 - distance * TICK_SCALE_DECAY)
    const opacity = focused ? ANCHORED_OPACITY : anchor.live ? LIVE_OPACITY : MUTED_OPACITY
    return { anchor, tone, scaleX, opacity }
  })
}

// ---- Visibility rules (tick 显隐) ----

/** The rail renders at all only from RAIL_MIN_TICKS anchors up. */
export function railRenders(tickCount: number): boolean {
  return tickCount >= RAIL_MIN_TICKS
}

/** The rail shows only when the window is at least RAIL_MIN_WINDOW_PX wide;
 * below it the component stays mounted but fades/slides out (transition). */
export function railShown(windowWidth: number): boolean {
  return windowWidth >= RAIL_MIN_WINDOW_PX
}

// ---- Viewport anchoring ----

/** Measured position of one user message, expressed in the probe's own
 * coordinate space (element top minus the container's visible top — i.e.
 * content top − scrollTop; the probe then is clientHeight × fraction). */
export interface AnchorGeometry {
  readonly turnId: string
  readonly top: number
}

/**
 * Which turn anchors the viewport: the last user message whose top sits at
 * or above the probe line (the content-space probe = scrollTop +
 * VIEWPORT_PROBE_FRACTION × clientHeight). Inclusive at the boundary; null
 * when the probe is above the first message or the transcript is empty.
 * Pure.
 */
export function anchoredTurnId(geometry: readonly AnchorGeometry[], probeY: number): string | null {
  let found: string | null = null
  for (const g of geometry) {
    if (g.top <= probeY) found = g.turnId
  }
  return found
}
