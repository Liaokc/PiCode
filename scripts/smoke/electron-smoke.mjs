/**
 * Electron app smoke launcher (ticket 13): boots the real app with
 * PICODE_SMOKE=1 and an ISOLATED session store (PICODE_SESSION_DIR), so the
 * smoke's sessions never land in ~/.pi/agent/sessions. `npm run smoke`
 * exports its own suite-wide store; this wrapper keeps standalone
 * `npm run smoke:electron` runs equally clean.
 *
 * Ticket 63: also points PICODE_PI_AGENT_DIR at a throwaway agent dir so
 * the skills-management stage enumerates and mutates a SANDBOX — the
 * operator's real ~/.pi/agent/settings.json and skills links are never
 * touched by a smoke run (the stage seeds and cleans the sandbox itself;
 * this wrapper deletes the whole directory on exit).
 *
 * Usage: npm run build && node scripts/smoke/electron-smoke.mjs
 * Requires working model auth in ~/.pi/agent (same as the pi TUI).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const store = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-sessions-'))
const piAgent = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-piagent-'))
console.log(`SMOKE isolated session store: ${store}`)
console.log(`SMOKE isolated pi agent dir: ${piAgent}`)
const result = spawnSync('electron', ['.'], {
  stdio: 'inherit',
  // PICODE_FAKE_USAGE: the ticket-65 usage stage hovers the fixture-driven
  // charts (the isolated smoke store has no usage history to render).
  // PICODE_PI_AGENT_DIR (ticket 63): a throwaway agent dir so the
  // skills-management stage enumerates and mutates a SANDBOX — the
  // operator's real ~/.pi/agent/settings.json and skills links are never
  // touched by a smoke run (the stage seeds and cleans the sandbox itself;
  // this wrapper deletes the whole directory on exit).
  env: {
    ...process.env,
    PICODE_SMOKE: '1',
    PICODE_FAKE_USAGE: '1',
    PICODE_SESSION_DIR: store,
    PICODE_PI_AGENT_DIR: piAgent
  }
})
rmSync(store, { recursive: true, force: true })
rmSync(piAgent, { recursive: true, force: true })
process.exit(result.status ?? 1)
