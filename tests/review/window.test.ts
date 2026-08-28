import { describe, expect, it } from 'vitest'
import { DIFF_ROW_HEIGHT_PX, visibleRange } from '../../src/shared/review/window'

describe('visibleRange', () => {
  it('windows the top of a huge row list', () => {
    // Only roughly one viewport (plus overscan) of rows is ever rendered.
    const { start, end } = visibleRange(0, 400, 100_000, DIFF_ROW_HEIGHT_PX)
    expect(start).toBe(0)
    expect(end - start).toBeLessThanOrEqual(400 / DIFF_ROW_HEIGHT_PX + 41)
  })

  it('slides the window with scrollTop', () => {
    const { start, end } = visibleRange(20_000, 400, 100_000, DIFF_ROW_HEIGHT_PX)
    expect(start).toBeGreaterThanOrEqual(20_000 / DIFF_ROW_HEIGHT_PX - 21)
    expect(start).toBeLessThanOrEqual(20_000 / DIFF_ROW_HEIGHT_PX)
    expect(end).toBeGreaterThan(start)
    expect(end - start).toBeLessThanOrEqual(400 / DIFF_ROW_HEIGHT_PX + 41)
  })

  it('clamps to the row count at the bottom', () => {
    const { start, end } = visibleRange(500_000, 400, 50, DIFF_ROW_HEIGHT_PX)
    expect(end).toBe(50)
    expect(start).toBeLessThanOrEqual(50)
  })

  it('covers every row for small lists', () => {
    const { start, end } = visibleRange(0, 400, 10, DIFF_ROW_HEIGHT_PX)
    expect(start).toBe(0)
    expect(end).toBe(10)
  })

  it('stays safe with degenerate inputs', () => {
    expect(visibleRange(0, 0, 100, DIFF_ROW_HEIGHT_PX)).toEqual({ start: 0, end: 20 })
    expect(visibleRange(-50, 400, 100, DIFF_ROW_HEIGHT_PX).start).toBe(0)
    expect(visibleRange(0, 400, 0, DIFF_ROW_HEIGHT_PX)).toEqual({ start: 0, end: 0 })
  })
})
