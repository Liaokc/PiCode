/**
 * Tooltip domain logic (ticket 22): the two ZCode tooltip states — a control
 * with a keyboard shortcut shows only its shortcut as keycaps, an icon-only
 * control without one shows a short description — plus the bubble placement
 * geometry. Pure data so it is testable at Seam-1 and shared by the renderer
 * component; future buttons (tickets 16/18/19) consume the same rules.
 */

/** One bubble state, resolved from what a control offers. */
export type TooltipContent =
  | { kind: 'shortcut'; keys: string[] }
  | { kind: 'label'; text: string }

/**
 * Resolve the bubble content for a control. Per ZCode: a control with a
 * shortcut shows ONLY the shortcut (keycaps), never the description; a
 * control with only a description shows that; blank input shows nothing.
 */
export function resolveTooltipContent(spec: { label?: string; shortcut?: string }): TooltipContent | null {
  const shortcut = spec.shortcut?.trim() ?? ''
  if (shortcut !== '') return { kind: 'shortcut', keys: splitShortcutKeys(shortcut) }
  const label = spec.label?.trim() ?? ''
  if (label !== '') return { kind: 'label', text: label }
  return null
}

/**
 * Split a shortcut string into one keycap token per character, dropping the
 * spaces operators type for legibility ("⌘ K"). A bare key stays a single
 * keycap; multi-modifier chords split into per-modifier keycaps.
 */
export function splitShortcutKeys(shortcut: string): string[] {
  return [...shortcut.replace(/\s+/g, '')]
}

/** Axis-aligned rectangle of the tooltip trigger, in viewport coordinates. */
export interface TooltipRect {
  x: number
  y: number
  width: number
  height: number
}

/** Measured size of the rendered bubble. */
export interface TooltipSize {
  width: number
  height: number
}

export type TooltipPlacement = 'below' | 'above'

/** Distance between the trigger and the bubble. */
export const TOOLTIP_GAP_PX = 6

/** Keep the bubble this far inside the viewport on every edge. */
export const TOOLTIP_VIEWPORT_MARGIN_PX = 8

export interface PlacedTooltip {
  x: number
  y: number
  placement: TooltipPlacement
}

/**
 * Place the bubble relative to a trigger inside the viewport. Prefer below
 * (sidebar and topbar controls sit near the window top); flip above when the
 * bubble would overflow the bottom (composer-area controls); fall back to a
 * below placement clamped into the viewport when neither side fully fits.
 */
export function placeTooltip(anchor: TooltipRect, bubble: TooltipSize, viewport: TooltipSize): PlacedTooltip {
  const centerX = anchor.x + anchor.width / 2
  const x = Math.min(
    Math.max(centerX - bubble.width / 2, TOOLTIP_VIEWPORT_MARGIN_PX),
    Math.max(viewport.width - TOOLTIP_VIEWPORT_MARGIN_PX - bubble.width, TOOLTIP_VIEWPORT_MARGIN_PX)
  )

  const belowY = anchor.y + anchor.height + TOOLTIP_GAP_PX
  const belowFits = belowY + bubble.height <= viewport.height - TOOLTIP_VIEWPORT_MARGIN_PX
  if (belowFits) return { x, y: belowY, placement: 'below' }

  const aboveY = anchor.y - TOOLTIP_GAP_PX - bubble.height
  const aboveFits = aboveY >= TOOLTIP_VIEWPORT_MARGIN_PX
  if (aboveFits) return { x, y: aboveY, placement: 'above' }

  const maxY = Math.max(viewport.height - TOOLTIP_VIEWPORT_MARGIN_PX - bubble.height, TOOLTIP_VIEWPORT_MARGIN_PX)
  return { x, y: Math.min(Math.max(belowY, TOOLTIP_VIEWPORT_MARGIN_PX), maxY), placement: 'below' }
}
