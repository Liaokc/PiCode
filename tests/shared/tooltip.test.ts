import { describe, expect, it } from 'vitest'
import {
  TOOLTIP_GAP_PX,
  TOOLTIP_VIEWPORT_MARGIN_PX,
  placeTooltip,
  resolveTooltipContent,
  splitShortcutKeys,
  type TooltipRect,
  type TooltipSize
} from '../../src/shared/tooltip.ts'

describe('resolveTooltipContent — the two ZCode states', () => {
  it('shows only the shortcut when a control has one (keycap state)', () => {
    expect(resolveTooltipContent({ label: 'New task', shortcut: '⌘N' })).toEqual({
      kind: 'shortcut',
      keys: ['⌘', 'N']
    })
  })

  it('shows the short description when there is no shortcut (description state)', () => {
    expect(resolveTooltipContent({ label: 'Copy' })).toEqual({ kind: 'label', text: 'Copy' })
  })

  it('returns null when there is nothing to show', () => {
    expect(resolveTooltipContent({})).toBeNull()
    expect(resolveTooltipContent({ label: '' })).toBeNull()
    expect(resolveTooltipContent({ label: '   ' })).toBeNull()
    expect(resolveTooltipContent({ shortcut: '' })).toBeNull()
  })

  it('trims the description text', () => {
    expect(resolveTooltipContent({ label: '  Restart terminal  ' })).toEqual({
      kind: 'label',
      text: 'Restart terminal'
    })
  })
})

describe('splitShortcutKeys — one keycap per token', () => {
  it('splits modifier and key', () => {
    expect(splitShortcutKeys('⌘N')).toEqual(['⌘', 'N'])
    expect(splitShortcutKeys('⌘K')).toEqual(['⌘', 'K'])
    expect(splitShortcutKeys('⌘J')).toEqual(['⌘', 'J'])
  })

  it('splits multi-modifier chords', () => {
    expect(splitShortcutKeys('⇧⌘P')).toEqual(['⇧', '⌘', 'P'])
  })

  it('keeps a bare key as one keycap and tolerates spaces between tokens', () => {
    expect(splitShortcutKeys('⏎')).toEqual(['⏎'])
    expect(splitShortcutKeys('⌘ K')).toEqual(['⌘', 'K'])
    expect(splitShortcutKeys('')).toEqual([])
  })
})

const anchor: TooltipRect = { x: 100, y: 100, width: 28, height: 28 }
const bubble: TooltipSize = { width: 80, height: 26 }
const viewport: TooltipSize = { width: 1280, height: 800 }

describe('placeTooltip — below by default, flipped and clamped inside the viewport', () => {
  it('centers below the anchor with the standard gap when there is room', () => {
    expect(placeTooltip(anchor, bubble, viewport)).toEqual({
      x: 100 + anchor.width / 2 - bubble.width / 2,
      y: anchor.y + anchor.height + TOOLTIP_GAP_PX,
      placement: 'below'
    })
  })

  it('flips above when the bubble would overflow the bottom edge', () => {
    const nearBottom: TooltipRect = { x: 100, y: 780, width: 28, height: 28 }
    const placed = placeTooltip(nearBottom, bubble, viewport)
    expect(placed.placement).toBe('above')
    expect(placed.y).toBe(nearBottom.y - TOOLTIP_GAP_PX - bubble.height)
  })

  it('clamps horizontally at the viewport edges', () => {
    const nearRight: TooltipRect = { x: 1260, y: 100, width: 28, height: 28 }
    const placed = placeTooltip(nearRight, bubble, viewport)
    expect(placed.x).toBe(viewport.width - TOOLTIP_VIEWPORT_MARGIN_PX - bubble.width)
    expect(placed.placement).toBe('below')

    const nearLeft: TooltipRect = { x: 2, y: 100, width: 28, height: 28 }
    expect(placeTooltip(nearLeft, bubble, viewport).x).toBe(TOOLTIP_VIEWPORT_MARGIN_PX)
  })

  it('falls back to the clamped below position when neither side fully fits', () => {
    // Anchor such that below overflows the bottom and above would poke past
    // the top: neither side fits, so stay below and clamp into the viewport.
    const tight: TooltipRect = { x: 100, y: 20, width: 28, height: 380 }
    const placed = placeTooltip(tight, bubble, { width: 1280, height: 420 })
    expect(placed.placement).toBe('below')
    expect(placed.y).toBe(420 - TOOLTIP_VIEWPORT_MARGIN_PX - bubble.height)
  })

  it('clamps vertically to the top margin when the bubble is taller than the viewport', () => {
    const tallBubble: TooltipSize = { width: 80, height: 600 }
    const placed = placeTooltip(anchor, tallBubble, { width: 1280, height: 400 })
    expect(placed.y).toBe(TOOLTIP_VIEWPORT_MARGIN_PX)
  })
})
