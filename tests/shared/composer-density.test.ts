import { describe, expect, it } from 'vitest'
import {
  COMPOSER_COMPACT_BELOW_PX,
  COMPOSER_MINIMAL_BELOW_PX,
  composerDensity,
  thinkingBarFraction,
  thinkingBarShimmers
} from '../../src/shared/composer/density'

describe('composerDensity (ZCode staged label degradation)', () => {
  const cases: Array<[number, string, string]> = [
    [Number.NaN, 'minimal', 'NaN is junk → the tightest stage (never overflow)'],
    [0, 'minimal', 'a zero-width composer is minimal'],
    [200, 'minimal', 'icon-only territory'],
    [329, 'minimal', 'just below the compact floor'],
    [330, 'compact', 'the compact floor exactly'],
    [356, 'compact', 'sidebar 400 + panel 620 on a 1440 window (smoke case)'],
    [436, 'compact', 'sidebar 520 + panel 420 on a 1440 window'],
    [519, 'compact', 'just below the full floor'],
    [520, 'full', 'the full floor exactly'],
    [660, 'full', 'the composer width cap'],
    [1_000, 'full', 'roomy composer']
  ]
  for (const [width, expected, label] of cases) {
    it(`${label} (${width} → ${expected})`, () => {
      expect(composerDensity(width)).toBe(expected)
    })
  }

  it('orders its floors: minimal < compact < full', () => {
    expect(COMPOSER_MINIMAL_BELOW_PX).toBeLessThan(COMPOSER_COMPACT_BELOW_PX)
  })
})

describe('thinkingBarFraction (the green strength bar, canonical fifths)', () => {
  const cases: Array<[Parameters<typeof thinkingBarFraction>[0], number, string]> = [
    [null, 0, 'unset thinking = the empty bar'],
    ['off', 0, 'off = the empty bar'],
    ['minimal', 0.2, 'minimal = 1/5'],
    ['low', 0.4, 'low = 2/5'],
    ['medium', 0.6, 'medium = 3/5'],
    ['high', 0.8, 'high = 4/5'],
    ['xhigh', 1, 'xhigh = the full bar'],
    ['max', 1, 'max = the full bar (its extra strength is the shimmer)']
  ]
  for (const [level, expected, label] of cases) {
    it(`${label} (${String(level)} → ${expected})`, () => {
      expect(thinkingBarFraction(level)).toBe(expected)
    })
  }

  it('never exceeds the full bar', () => {
    for (const level of ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const) {
      const fraction = thinkingBarFraction(level)
      expect(fraction).toBeGreaterThanOrEqual(0)
      expect(fraction).toBeLessThanOrEqual(1)
    }
  })
})

describe('thinkingBarShimmers (max reads as a sweeping gloss)', () => {
  it('shimmers only on max', () => {
    expect(thinkingBarShimmers('max')).toBe(true)
    expect(thinkingBarShimmers('xhigh')).toBe(false)
    expect(thinkingBarShimmers('off')).toBe(false)
    expect(thinkingBarShimmers(null)).toBe(false)
  })
})
