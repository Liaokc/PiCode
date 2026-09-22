/**
 * Ticket 134: the sanitized-env electron smoke launcher — the automated
 * equivalent of the operator's `env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`
 * direct launch. Boots the REAL app with a GUI-equivalent bare environment
 * (exactly HOME + the four system dirs + the smoke selectors/isolation
 * vars), selects the in-app t134 sanitized spawn stage, and requires it to
 * pass: composed spawn PATH resolves `node`, the bundled SDK alignment
 * holds, and a REAL in-app session spawn (`/run scout … --bg`) succeeds —
 * the two root factors of the Finder/Dock spawn failure, proven fixed in
 * the environment that exposed them.
 *
 * The electron binary path is resolved BEFORE the environment is replaced
 * (the bare PATH cannot find it), and the app itself is spawned by absolute
 * path. The stage makes real model calls through the scout child (same
 * class as smoke stages 2/5/6 — dev-app serialization applies: run the ps
 * check first).
 *
 * Usage: npm run build && node scripts/smoke/sanitized-spawn-smoke.mjs
 * (run-all.sh runs it as the suite's last stage, after the build.)
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(import.meta.url)

// Resolve the electron binary while the full environment still exists.
const electronBin = require('electron')
if (typeof electronBin !== 'string' || electronBin === '') {
  console.error('SANITIZED SMOKE FAILED: could not resolve the electron binary')
  process.exit(1)
}

const store = mkdtempSync(path.join(os.tmpdir(), 'picode-t134-sessions-'))
const artifacts = mkdtempSync(path.join(os.tmpdir(), 'picode-t134-artifacts-'))
console.log(`SANITIZED SMOKE isolated session store: ${store}`)
console.log(`SANITIZED SMOKE isolated subagent artifacts: ${artifacts}`)

const result = spawnSync(electronBin, ['.'], {
  cwd: root,
  stdio: 'inherit',
  // The GUI-equivalent environment: HOME and the bare system PATH only —
  // exactly what a Finder/Dock launch hands the app on this machine. The
  // smoke vars ride along (the stage selector + isolation stores).
  env: {
    HOME: process.env.HOME,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    PICODE_SMOKE: '1',
    PICODE_SMOKE_STAGE: 't134-sanitized',
    PICODE_SESSION_DIR: store,
    PI_SUBAGENTS_TEMP_ROOT: artifacts
  }
})

rmSync(store, { recursive: true, force: true })
rmSync(artifacts, { recursive: true, force: true })
process.exit(result.status ?? 1)
