import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Seam-1 guardrail (spec, testing seam #1): the renderer must never import the
 * Pi SDK directly — chat state flows exclusively through the IPC contract.
 * This test is the guardrail that keeps that rule from eroding.
 */

const RENDERER_ROOT = path.resolve(__dirname, '../../src/renderer')

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc)
    } else if (/\.(tsx?|jsx?|css|html)$/.test(name)) {
      acc.push(full)
    }
  }
  return acc
}

describe('Seam-1 guardrail', () => {
  it('renderer sources never reference the Pi SDK packages', () => {
    const offenders = collectSourceFiles(RENDERER_ROOT).filter((file) =>
      /@earendil-works\/(pi-coding-agent|pi-ai|pi-agent-core)/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})
