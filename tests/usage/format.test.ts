import { describe, expect, it } from 'vitest'
import {
  estimatedCostText,
  formatCostUsd,
  formatDurationMs,
  formatLongDate,
  formatMonthLabel,
  formatShortDate,
  formatStreakDays,
  formatTokenCount
} from '../../src/shared/usage/format.ts'

describe('formatTokenCount', () => {
  it('formats billions, millions, thousands with at most two decimals', () => {
    expect(formatTokenCount(21_300_000_000)).toBe('21.3B')
    expect(formatTokenCount(2_130_000_000)).toBe('2.13B')
    expect(formatTokenCount(10_200_000_000)).toBe('10.2B')
    expect(formatTokenCount(230_000_000)).toBe('230M')
    expect(formatTokenCount(1_234_567)).toBe('1.23M')
    expect(formatTokenCount(4_200)).toBe('4.2K')
  })

  it('bumps to the next unit when rounding reaches 1000', () => {
    expect(formatTokenCount(999_999)).toBe('1M')
    expect(formatTokenCount(999_999_999_999)).toBe('1000B')
  })

  it('passes small counts through', () => {
    expect(formatTokenCount(0)).toBe('0')
    expect(formatTokenCount(999)).toBe('999')
    expect(formatTokenCount(1000)).toBe('1K')
  })
})

describe('formatDurationMs', () => {
  it('formats hours and minutes', () => {
    expect(formatDurationMs(6 * 3_600_000 + 40 * 60_000)).toBe('6h 40m')
    expect(formatDurationMs(2 * 3_600_000)).toBe('2h 0m')
  })

  it('formats sub-hour spans as minutes', () => {
    expect(formatDurationMs(14 * 60_000 + 58_000)).toBe('14m')
  })

  it('formats sub-minute spans as seconds and handles zero', () => {
    expect(formatDurationMs(45_000)).toBe('45s')
    expect(formatDurationMs(0)).toBe('0s')
  })
})

describe('formatStreakDays', () => {
  it('pluralizes', () => {
    expect(formatStreakDays(4)).toBe('4 days')
    expect(formatStreakDays(1)).toBe('1 day')
    expect(formatStreakDays(0)).toBe('0 days')
  })
})

describe('formatCostUsd + estimatedCostText', () => {
  it('keeps four decimals under one dollar and two above', () => {
    expect(formatCostUsd(0.0499)).toBe('$0.0499')
    expect(formatCostUsd(0.5)).toBe('$0.5000')
    expect(formatCostUsd(12.3456)).toBe('$12.35')
  })

  it('labels every cost as estimated', () => {
    expect(estimatedCostText({ amountUsd: 0.0499, estimated: true })).toBe('$0.0499 estimated')
  })
})

describe('date labels', () => {
  it('renders UTC-pinned English dates', () => {
    expect(formatShortDate('2026-08-26')).toBe('Aug 26')
    expect(formatLongDate('2026-08-26')).toBe('Aug 26, 2026')
    expect(formatMonthLabel('2026-09-01')).toBe('Sep')
  })
})
