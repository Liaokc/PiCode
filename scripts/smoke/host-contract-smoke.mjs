/**
 * Headless Seam-1 contract smoke (spec testing seam #1): forks the built agent
 * host entry under plain Node, connects it to the REAL Pi SDK, and verifies
 * the contract's exit behavior end to end:
 *
 *   session_created → prompt → agent_start → text_delta… → abort → agent_end
 *   → prompt → agent_start → text_delta… → agent_end → shutdown → exit 0
 *
 * Usage: npm run build && node scripts/smoke/host-contract-smoke.mjs
 * Expects working model auth in ~/.pi/agent (same as the pi TUI).
 */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fork } from 'node:child_process'

const HOST_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'out', 'main', 'host.js')
const STEP_TIMEOUT_MS = 90_000

const child = fork(HOST_ENTRY, [await mkdtemp(path.join(tmpdir(), 'picode-smoke-'))], {
  stdio: ['ignore', 'inherit', 'inherit', 'ipc']
})

let step = 'session_created'
const seen = { agent_start: 0, text_delta: 0, agent_end: 0, user_message: 0 }

const timeout = setTimeout(() => {
  console.error(`SMOKE FAIL step ${step} timed out after ${STEP_TIMEOUT_MS}ms`)
  child.kill('SIGKILL')
  process.exit(1)
}, STEP_TIMEOUT_MS)

child.on('message', (event) => {
  if (typeof event !== 'object' || event === null || typeof event.type !== 'string') return
  console.log(`[contract] ${JSON.stringify(event).slice(0, 160)}`)
  switch (event.type) {
    case 'session_created':
      if (!event.sessionId || event.cwd === undefined) fail('session_created missing fields')
      console.log('SMOKE session_created ok')
      step = 'agent_start (round 1)'
      child.send({ type: 'prompt', text: 'Count slowly from one to twenty, one number per sentence.' })
      break
    case 'user_message':
      seen.user_message++
      break
    case 'agent_start':
      seen.agent_start++
      break
    case 'text_delta':
      seen.text_delta++
      if (seen.agent_start === 1 && seen.text_delta === 3) {
        console.log('SMOKE aborting mid-stream')
        step = 'agent_end (after abort)'
        child.send({ type: 'abort_turn' })
      }
      break
    case 'agent_end':
      seen.agent_end++
      if (seen.agent_end === 1) {
        if (seen.text_delta < 3) fail('fewer than 3 text deltas before abort')
        console.log('SMOKE abort ok — streaming resumed for round 2')
        step = 'agent_start (round 2)'
        child.send({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
      } else if (seen.agent_end === 2) {
        console.log(`SMOKE contract events ok: ${JSON.stringify(seen)}`)
        step = 'clean exit'
        child.send({ type: 'shutdown' })
      }
      break
    case 'session_error':
    case 'turn_error':
      fail(`${event.type}: ${event.message}`)
      break
    default:
      break
  }
})

child.on('exit', (code) => {
  clearTimeout(timeout)
  if (step !== 'clean exit') {
    console.error(`SMOKE FAIL host exited during step '${step}' with code ${code}`)
    process.exit(1)
  }
  if (code !== 0) {
    console.error(`SMOKE FAIL expected clean exit 0, got ${code}`)
    process.exit(1)
  }
  console.log('SMOKE PASS host contract smoke complete')
  process.exit(0)
})

function fail(message) {
  console.error(`SMOKE FAIL ${message}`)
  child.kill('SIGKILL')
  process.exit(1)
}
