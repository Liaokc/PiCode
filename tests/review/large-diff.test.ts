import { describe, expect, it } from 'vitest'
import { parseGitDiff, rowStat, unifiedRenderRows } from '../../src/shared/review/parse'
import { splitRenderRows } from '../../src/shared/review/split'
import { DIFF_ROW_HEIGHT_PX, visibleRange } from '../../src/shared/review/window'

/**
 * Ticket 06 acceptance: a thousand-line (here: 20k-line) diff must scroll
 * smoothly. The guarantee is structural — the rendered row slice is bounded
 * by the viewport no matter the scroll position — plus a generous parse-time
 * ceiling that catches pathological parser behavior.
 */

function generateLargePatch(lines: number): string {
  const header = ['diff --git a/big.ts b/big.ts', 'index 1111111..2222222 100644', '--- a/big.ts', '+++ b/big.ts']
  const body: string[] = []
  for (let i = 0; i < lines; i++) {
    if (i % 5 === 0) body.push(`-const old${i} = ${i}`)
    else if (i % 5 === 1) body.push(`+const new${i} = ${i}`)
    else body.push(` context${i}`)
  }
  // Old side = dels + contexts; new side = adds + contexts.
  const dels = Math.ceil(lines / 5)
  const sideLines = dels + (lines - 2 * dels)
  return [...header, `@@ -1,${sideLines} +1,${sideLines} @@`, ...body].join('\n')
}

const LINES = 20_000

describe('large diff pipeline', () => {
  const patch = generateLargePatch(LINES)

  it('parses a 20k-line patch quickly and completely', () => {
    const started = performance.now()
    const files = parseGitDiff(patch)
    const elapsed = performance.now() - started
    expect(files).toHaveLength(1)
    // i % 5 == 0 → del, i % 5 == 1 → add, rest context.
    expect(rowStat(files[0])).toEqual({ additions: 4_000, deletions: 4_000 })
    // Generous ceiling; the parser is a linear scan and finishes in tens of ms.
    expect(elapsed).toBeLessThan(3_000)
  })

  it('renders a bounded row window at every scroll position', () => {
    const [file] = parseGitDiff(patch)
    const rows = unifiedRenderRows(file)
    expect(rows.length).toBeGreaterThan(15_000)

    const viewportHeight = 400
    const maxRows = viewportHeight / DIFF_ROW_HEIGHT_PX + 41 // overscan both sides
    for (const scrollTop of [0, 100_000, 500_000, rows.length * DIFF_ROW_HEIGHT_PX]) {
      const { start, end } = visibleRange(scrollTop, viewportHeight, rows.length)
      expect(end - start).toBeLessThanOrEqual(maxRows)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeLessThanOrEqual(rows.length)
    }
  })

  it('keeps the split view equally windowed', () => {
    const [file] = parseGitDiff(patch)
    const rows = splitRenderRows(file)
    const { start, end } = visibleRange(250_000, 400, rows.length)
    expect(end - start).toBeLessThanOrEqual(61)
    expect(rows.slice(start, end).every((r) => r.kind === 'hunk-header' || r.kind === 'split')).toBe(true)
  })
})
