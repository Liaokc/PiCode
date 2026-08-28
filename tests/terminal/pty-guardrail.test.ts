/**
 * Seam-3 guardrail (spec: “真 PTY 仅出现在一个冒烟脚本中”): a REAL pty may
 * only be imported by the main-process factory adapter and the dedicated
 * smoke script. Every other module — shared seam, renderer, host, preload —
 * must depend on the minimal PtyHandle abstraction instead. Tests, like the
 * products, run against fakes only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(process.cwd())
const ALLOWED_REAL_PTY_FILES = new Set([
  'src/main/terminal/node-pty-factory.ts',
  'scripts/smoke/pty-smoke.mjs'
])
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', '.git', '.worktrees', 'coverage'])

const NODE_PTY_IMPORT = /(from\s+|require\(\s*|import\s*)['"]node-pty['"]/

function walk(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) found.push(...walk(full))
    } else if (CODE_EXTENSIONS.has(path.extname(entry))) {
      found.push(full)
    }
  }
  return found
}

describe('seam-3 guardrail — real pty confinement', () => {
  it('node-pty is imported by exactly the allowed adapter + smoke script', () => {
    const offenders: string[] = []
    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))]) {
      const rel = path.relative(ROOT, file)
      if (ALLOWED_REAL_PTY_FILES.has(rel.split(path.sep).join('/'))) continue
      if (NODE_PTY_IMPORT.test(readFileSync(file, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('the renderer never imports node-pty (terminal data flows over IPC only)', () => {
    const offenders = walk(path.join(ROOT, 'src', 'renderer')).filter(
      (file) => path.basename(file) !== 'env.d.ts' && NODE_PTY_IMPORT.test(readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})
