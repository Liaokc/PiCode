/**
 * Local packaging (ticket 12): builds the app bundles and packs a bootable
 * macOS .app via @electron/packager. Basic local artifact only — no code
 * signing/notarization (spec Out of Scope). asar is intentionally OFF: the
 * agent host is forked as a plain child process, and the forked entry
 * (out/main/host.js) must be readable by plain Node, which cannot read
 * inside an asar archive.
 *
 * Usage:
 *   npm run package              → release/picode-darwin-<arch>/PiCode.app
 *   npm run package -- --verify  → then boot the artifact through
 *                                  LaunchServices (`open`) with PICODE_SMOKE=1
 *                                  and require a real-session smoke round to
 *                                  complete (artifact boots + runs a live
 *                                  chat + takes real window focus).
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packager } from '@electron/packager'
import { openLaunchArgs, verdictFromSmokeLogs } from './package-verify-launch.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'release')
const verify = process.argv.includes('--verify')

function sh(command, opts = {}) {
  execSync(command, { stdio: 'inherit', cwd: root, ...opts })
}

console.log('→ building bundles (electron-vite build)')
sh('npx electron-vite build')

console.log('→ packing darwin app')
rmSync(outDir, { recursive: true, force: true })
const paths = await packager({
  dir: root,
  out: outDir,
  name: 'PiCode',
  appBundleId: 'app.picode.desktop',
  appCategoryType: 'public.app-category.developer-tools',
  overwrite: true,
  asar: false,
  prune: true,
  ignore: [
    /^\/release($|\/)/,
    /^\/(\.worktrees|\.scratch|\.git|\.github|src|tests|scripts|docs|coverage)($|\/)/,
    /^\/(electron\.vite\.config\.ts|eslint\.config\.mjs|tsconfig.*\.json|vitest\.config\.ts|AGENTS\.md|CONTEXT\.md|README\.md)$/
  ]
})
const appDir = paths[0]
if (!appDir || !existsSync(path.join(appDir, 'PiCode.app'))) {
  console.error('PACKAGING FAILED: expected PiCode.app inside', appDir)
  process.exit(1)
}
console.log(`→ packaged ${appDir}/PiCode.app`)

if (!verify) {
  console.log('→ done. Launch: open "' + appDir + '/PiCode.app"')
  process.exit(0)
}

// Artifact launch verification: boot the PACKAGED app through LaunchServices
// (`open`) and let the in-app smoke drive a real session round through main →
// host → Pi SDK → renderer DOM (create → stream → abort → live-follow →
// crash isolation → real-clipboard copy). Requires working model auth in
// ~/.pi/agent, same as the pi TUI.
//
// WHY `open` and not a direct binary spawn (ticket 47): the smoke's ticket-44
// stage needs the window to take REAL OS focus (navigator.clipboard rejects
// while unfocused). A binary spawned straight from a terminal stays
// background on this macOS — win.show() + win.focus() + app.focus({ steal:
// true }) never win focus — while a LaunchServices launch activates the app
// like a normal user launch and the focus poll succeeds. See
// scripts/package-verify-launch.ts for the two `open` quirks this harness
// handles: `open -W` does not propagate the app's exit status (the verdict
// reads the smoke's own log markers), and a stale running instance would be
// activated instead of this build (guarded below).
console.log('→ verifying artifact: launching packaged app via `open` (LaunchServices) with PICODE_SMOKE=1')
const appPath = path.join(appDir, 'PiCode.app')
const binary = path.join(appPath, 'Contents', 'MacOS', 'PiCode')
// LaunchServices keys apps by bundle id (app.picode.desktop): any running
// PiCode copy — this artifact, another worktree's, or /Applications — would
// be ACTIVATED by `open` instead of this fresh build, dropping the --env
// payload so no smoke would run. Bail out up front instead of hanging on
// `open -W` or passing vacuously.
let runningPids = ''
try {
  runningPids = execFileSync('pgrep', ['-f', 'PiCode\\.app/Contents/MacOS/PiCode'], { encoding: 'utf8' })
} catch {
  // pgrep exits 1 when nothing matches — the good case.
}
if (runningPids.trim()) {
  console.error(
    'PACKAGED ARTIFACT VERIFY FAILED: a packaged PiCode instance is already running (pids: ' +
      runningPids.trim().split('\n').join(', ') +
      '). Quit it first — LaunchServices would activate it instead of this fresh build and the smoke env would be dropped.'
  )
  process.exit(1)
}
// Session isolation (ticket 13): the smoke writes sessions into a throwaway
// store, never into the real ~/.pi/agent/sessions. The dir name carries the
// picode-smoke- prefix so cleanup-smoke-sessions can sweep any leftovers.
const verifyTmp = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-verify-'))
const sessionDir = path.join(verifyTmp, 'sessions')
mkdirSync(sessionDir)
const stdoutLog = path.join(verifyTmp, 'smoke-stdout.log')
const stderrLog = path.join(verifyTmp, 'smoke-stderr.log')
writeFileSync(stdoutLog, '')
writeFileSync(stderrLog, '')

let failure = null
try {
  execFileSync('open', openLaunchArgs({ appPath, sessionDir, stdoutLog, stderrLog }), {
    stdio: 'inherit',
    timeout: 5 * 60_000
  })
  const stdout = readFileSync(stdoutLog, 'utf8')
  const stderr = readFileSync(stderrLog, 'utf8')
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  const verdict = verdictFromSmokeLogs(stdout, stderr)
  if (!verdict.ok) failure = verdict.reason
  else console.log('PACKAGED ARTIFACT VERIFIED: launched and completed the real-session smoke (SMOKE done)')
} catch (err) {
  // `open` timed out (smoke hung) or failed to launch: dump whatever the
  // smoke logged so far and stop OUR app instance (the pkill pattern is this
  // build's binary path only).
  for (const [label, file] of [['stdout', stdoutLog], ['stderr', stderrLog]]) {
    try {
      const text = readFileSync(file, 'utf8')
      if (text) process.stderr.write(`— smoke ${label} —\n${text}\n`)
    } catch {
      // stream file never created
    }
  }
  try {
    execFileSync('pkill', ['-f', binary])
  } catch {
    // nothing left to kill
  }
  failure = err instanceof Error ? err.message : String(err)
} finally {
  rmSync(verifyTmp, { recursive: true, force: true })
}
if (failure) {
  console.error('PACKAGED ARTIFACT VERIFY FAILED:', failure)
  process.exit(1)
}
