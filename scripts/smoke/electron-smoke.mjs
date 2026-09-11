/**
 * Electron app smoke launcher (ticket 13): boots the real app with
 * PICODE_SMOKE=1 and an ISOLATED session store (PICODE_SESSION_DIR), so the
 * smoke's sessions never land in ~/.pi/agent/sessions. `npm run smoke`
 * exports its own suite-wide store; this wrapper keeps standalone
 * `npm run smoke:electron` runs equally clean.
 *
 * Usage: npm run build && node scripts/smoke/electron-smoke.mjs
 * Requires working model auth in ~/.pi/agent (same as the pi TUI).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const store = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-sessions-'))
console.log(`SMOKE isolated session store: ${store}`)
const result = spawnSync('electron', ['.'], {
  stdio: 'inherit',
  // PICODE_FAKE_USAGE: the ticket-65 usage stage hovers the fixture-driven
  // charts (the isolated smoke store has no usage history to render).
  env: { ...process.env, PICODE_SMOKE: '1', PICODE_FAKE_USAGE: '1', PICODE_SESSION_DIR: store }
})
rmSync(store, { recursive: true, force: true })
process.exit(result.status ?? 1)
