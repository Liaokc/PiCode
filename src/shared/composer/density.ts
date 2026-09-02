/**
 * Composer density (ZCode parity, ticket-29 feedback): when the panes crowd
 * the main zone, the composer footer degrades its labels in stages instead
 * of overflowing the card —
 *
 *   full     icon + label + caret everywhere
 *   compact  access = icon, model = name only, thinking = icon + strength bar
 *   minimal  model = icon, thinking = icon (no bar)
 *
 * The stage is a pure function of the composer's measured width; the
 * component only renders. Pure + table-driven so the thresholds stay
 * testable without Electron.
 */

import type { ThinkingLevel } from '../contract'

export type ComposerDensity = 'full' | 'compact' | 'minimal'

/** Below this the model chip drops to its icon (icon-only footer). */
export const COMPOSER_MINIMAL_BELOW_PX = 330
/** Below this the footer sheds its text labels (compact stage). */
export const COMPOSER_COMPACT_BELOW_PX = 520

export function composerDensity(width: number): ComposerDensity {
  if (Number.isNaN(width) || width < COMPOSER_MINIMAL_BELOW_PX) return 'minimal'
  if (width < COMPOSER_COMPACT_BELOW_PX) return 'compact'
  return 'full'
}

/**
 * Fill fraction of the green thinking-strength bar over Pi's canonical
 * seven levels (operator-approved design): off = empty, then fifths —
 * minimal 1/5 … xhigh 5/5 — and 'max' fills the bar too (its extra strength
 * reads as the shimmer, see thinkingBarShimmers). Fixed table, NOT
 * normalized against a model's subset: a low-only model still shows 2/5.
 */
const THINKING_BAR_FRACTIONS: Readonly<Record<ThinkingLevel, number>> = {
  off: 0,
  minimal: 0.2,
  low: 0.4,
  medium: 0.6,
  high: 0.8,
  xhigh: 1,
  max: 1
}

export function thinkingBarFraction(level: ThinkingLevel | null): number {
  if (level === null) return 0
  return THINKING_BAR_FRACTIONS[level] ?? 0
}

/** 'max' is visually beyond full: its bar carries the sweeping gloss. */
export function thinkingBarShimmers(level: ThinkingLevel | null): boolean {
  return level === 'max'
}
