/**
 * Headless Seam-1 contract smoke (spec testing seam #1): forks the built agent
 * host entry under plain Node, connects it to the REAL Pi SDK, and verifies
 * the contract's exit behavior end to end:
 *
 *   Round A (fresh session)
 *   session_created → prompt → agent_start → text_delta… → abort → agent_end
 *   → prompt → agent_start → text_delta… → agent_end → shutdown → exit 0
 *
 *   Round B (ticket 04: resume / rename / tree / fork against the SAME file)
 *   resume → session_created(resumed) → history_loaded → session_tree
 *   → set_session_label → session_renamed → request_tree → session_tree
 *   → navigate_tree → history_loaded + session_tree(leaf moved)
 *   → fork_session → session_created(new file) → history_loaded → exit 0
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
const SMOKE_LABEL = 'PICODE_SMOKE_RENAMED'

const cwd = await mkdtemp(path.join(tmpdir(), 'picode-smoke-'))

let child = null
let step = 'A session_created'
let timeout = armTimeout()
let sessionFile = null
let firstEntryId = null
let navTargetId = null
const seen = { agent_start: 0, text_delta: 0, agent_end: 0 }

function armTimeout() {
  return setTimeout(() => {
    console.error(`SMOKE FAIL step '${step}' timed out after ${STEP_TIMEOUT_MS}ms`)
    child?.kill('SIGKILL')
    process.exit(1)
  }, STEP_TIMEOUT_MS)
}

function bumpTimeout() {
  clearTimeout(timeout)
  timeout = armTimeout()
}

function forkHost(args, handler) {
  const c = fork(HOST_ENTRY, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  c.on('message', (event) => {
    if (typeof event === 'object' && event !== null && typeof event.type === 'string') handler(event)
  })
  c.on('exit', (code) => onHostExit(c, code))
  return c
}

function fail(message) {
  console.error(`SMOKE FAIL ${message}`)
  child?.kill('SIGKILL')
  process.exit(1)
}

function onHostExit(exited, code) {
  if (exited !== child) return // stale exit from a replaced host
  clearTimeout(timeout)
  if (step === 'A shutdown') {
    if (code !== 0) fail(`round A exit should be clean 0, got ${code}`)
    console.log('SMOKE round A shutdown ok — starting round B (resume same file)')
    step = 'B session_created'
    bumpTimeout()
    child = forkHost([cwd, sessionFile], onEvent)
    return
  }
  if (step === 'clean exit') {
    if (code !== 0) fail(`expected clean exit 0, got ${code}`)
    console.log('SMOKE PASS host contract smoke complete (chat loop + resume/rename/tree/fork)')
    process.exit(0)
  }
  console.error(`SMOKE FAIL host exited during step '${step}' with code ${code}`)
  process.exit(1)
}

function onEvent(event) {
  console.log(`[contract] ${JSON.stringify(event).slice(0, 200)}`)
  const fatal = new Set(['session_error', 'turn_error', 'session_command_error'])
  if (fatal.has(event.type)) fail(`${event.type}: ${event.message}`)

  switch (step) {
    // ---------- Round A: fresh session, live chat loop ----------
    case 'A session_created': {
      if (event.type !== 'session_created') return
      if (!event.sessionId || !event.sessionFile) fail('session_created missing id/sessionFile')
      sessionFile = event.sessionFile
      console.log('SMOKE session_created ok')
      step = 'A agent_start 1'
      child.send({ type: 'prompt', text: 'Count slowly from one to twenty, one number per sentence.' })
      return
    }
    case 'A agent_start 1': {
      if (event.type === 'agent_start') {
        seen.agent_start++
        step = 'A deltas 1'
        console.log('SMOKE agent_start (round 1)')
      }
      return
    }
    case 'A deltas 1': {
      if (event.type === 'text_delta') {
        seen.text_delta++
        if (seen.text_delta === 3) {
          console.log('SMOKE aborting mid-stream')
          step = 'A agent_end 1'
          child.send({ type: 'abort_turn' })
        }
      }
      return
    }
    case 'A agent_end 1': {
      if (event.type !== 'agent_end') return
      seen.agent_end++
      if (seen.text_delta < 3) fail('fewer than 3 text deltas before abort')
      console.log('SMOKE abort ok — streaming round 2')
      step = 'A agent_start 2'
      child.send({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
      return
    }
    case 'A agent_start 2': {
      if (event.type === 'agent_start') {
        seen.agent_start++
        step = 'A agent_end 2'
      }
      return
    }
    case 'A agent_end 2': {
      if (event.type !== 'agent_end') return
      seen.agent_end++
      console.log(`SMOKE contract events ok: ${JSON.stringify(seen)}`)
      step = 'A shutdown'
      child.send({ type: 'shutdown' })
      return
    }

    // ---------- Round B: resume / rename / tree / fork ----------
    case 'B session_created': {
      if (event.type !== 'session_created') return
      if (!event.resumed) fail('round B must open as a resume')
      console.log('SMOKE resume ok — same file reopened')
      step = 'B history'
      return
    }
    case 'B history': {
      if (event.type !== 'history_loaded') return
      if (!Array.isArray(event.items) || event.items.length < 3) {
        fail(`resume should replay the round-A exchange, got ${event.items?.length} items`)
      }
      if (event.items[0]?.role !== 'user') fail('first history item should be the first user message')
      firstEntryId = event.items[0].id
      // Navigate to the second item (an assistant entry): Pi moves the leaf
      // exactly onto non-user-message targets (user-message targets instead
      // move the leaf to the entry's parent for re-editing).
      navTargetId = event.items[1]?.id ?? null
      if (!navTargetId) fail('history should contain at least two items')
      console.log(`SMOKE history_loaded ok (${event.items.length} items)`)
      step = 'B renamed ack' // resume's session_tree may arrive meanwhile — ignored
      child.send({ type: 'set_session_label', name: SMOKE_LABEL })
      return
    }
    case 'B renamed ack': {
      if (event.type !== 'session_renamed') return
      if (event.name !== SMOKE_LABEL) fail(`rename write-back should carry the label, got ${event.name}`)
      console.log('SMOKE rename write-back ok')
      step = 'B tree named'
      child.send({ type: 'request_tree' })
      return
    }
    case 'B tree named': {
      if (event.type !== 'session_tree') return
      if (event.tree?.name !== SMOKE_LABEL) fail(`tree name should be the label, got ${event.tree?.name}`)
      console.log('SMOKE session_tree ok (label visible)')
      step = 'B nav history'
      child.send({ type: 'navigate_tree', entryId: navTargetId })
      return
    }
    case 'B nav history': {
      if (event.type !== 'history_loaded') return
      console.log('SMOKE tree navigation: leaf path replayed')
      step = 'B nav tree'
      return
    }
    case 'B nav tree': {
      if (event.type !== 'session_tree') return
      if (event.tree?.leafId !== navTargetId) {
        fail(`leaf should be the navigated entry, got ${event.tree?.leafId} (want ${navTargetId})`)
      }
      console.log('SMOKE tree navigation ok — leaf moved in place, branches kept')
      step = 'B fork'
      child.send({ type: 'fork_session', entryId: firstEntryId })
      return
    }
    case 'B fork': {
      if (event.type !== 'session_created') return
      if (!event.resumed) fail('the forked session should open as a resume')
      if (!event.sessionFile || event.sessionFile === sessionFile) fail('fork must target a NEW session file')
      console.log('SMOKE fork ok — continuing in-host on the forked session')
      step = 'C history'
      return
    }

    // ---------- The fork continues in the SAME host (Pi runtime semantics) ----------
    case 'C history': {
      if (event.type !== 'history_loaded') return
      if (!Array.isArray(event.items) || event.items.length === 0) fail('forked history should not be empty')
      console.log(`SMOKE fork history ok (${event.items.length} item(s))`)
      step = 'clean exit'
      child.send({ type: 'shutdown' })
      return
    }
    default:
      return
  }
}

child = forkHost([cwd], onEvent)
