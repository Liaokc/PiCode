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
 *   npm run package -- --verify  → then launch the artifact with PICODE_SMOKE=1
 *                                  and require a real-session smoke round to
 *                                  exit 0 (artifact boots + runs a live chat).
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packager } from '@electron/packager'

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

// Artifact launch verification: boot the PACKAGED binary and let the in-app
// smoke drive a real session round through main → host → Pi SDK → renderer
// DOM (create → stream → abort → live-follow → crash isolation). Requires
// working model auth in ~/.pi/agent, same as the pi TUI.
console.log('→ verifying artifact: launching packaged app with PICODE_SMOKE=1')
const binary = path.join(appDir, 'PiCode.app', 'Contents', 'MacOS', 'PiCode')
// Session isolation (ticket 13): the smoke writes sessions into a throwaway
// store, never into the real ~/.pi/agent/sessions.
const smokeSessionsStore = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-sessions-'))
try {
  sh(`"${binary}"`, {
    env: { ...process.env, PICODE_SMOKE: '1', PICODE_SESSION_DIR: smokeSessionsStore },
    timeout: 5 * 60_000
  })
  console.log('PACKAGED ARTIFACT VERIFIED: launched and completed the real-session smoke (exit 0)')
} catch (err) {
  console.error('PACKAGED ARTIFACT VERIFY FAILED:', err.message)
  process.exit(1)
} finally {
  rmSync(smokeSessionsStore, { recursive: true, force: true })
}
