/**
 * Headless Seam-1 contract smoke (spec testing seam #1): forks the built agent
 * host entry under plain Node, connects it to the REAL Pi SDK, and verifies
 * the contract's exit behavior end to end:
 *
 *   Round A (fresh session)
 *   session_created → composer_state + models_available + slash_commands
 *   → prompt → agent_start → text_delta… → abort → agent_end
 *   → prompt → approval_required (gate) → approve+remember → tool_start
 *   → tool_update? → tool_end → agent_end
 *   → prompt → NO approval_required (remembered) → tool_end → agent_end
 *   → set_access_mode read-only → prompt → NO approval_required (auto-deny)
 *   → agent_end → set_access_mode standard → prompt → approval_required
 *   → deny-with-reason → agent_end (terminate)
 *   → prompt → steer → queue_update×2 → follow-up → queue_update
 *   → clear_queue → queue_update → agent_end
 *   → set_thinking_level → thinking_level_changed; set_model → model_changed
 *   → list_files → file_list → shutdown → exit 0
 *
 *   Round B (ticket 04: resume / rename / tree / fork against the SAME file)
 *   resume → session_created(resumed) → history_loaded → session_tree
 *   → set_session_label → session_renamed → request_tree → session_tree
 *   → navigate_tree → history_loaded + session_tree(leaf moved)
 *   → fork_session → session_created(new file) → history_loaded → exit 0
 *
 * Usage: npm run build && node scripts/smoke/host-contract-smoke.mjs
 * Expects working model auth in ~/.pi/agent (same as the pi TUI). Session
 * files land in an isolated throwaway store (PICODE_SESSION_DIR, ticket 13)
 * — the real session library is never written.
 */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fork } from 'node:child_process'

const HOST_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'out', 'main', 'host.js')
const STEP_TIMEOUT_MS = 90_000
const SMOKE_LABEL = 'PICODE_SMOKE_RENAMED'

// Session isolation (ticket 13): hosts must never write the real
// ~/.pi/agent/sessions. Use the suite-wide store when run through
// scripts/smoke/run-all.sh (which owns its cleanup), otherwise create and
// clean up a throwaway store of our own — standalone runs stay safe too.
if (!process.env.PICODE_SESSION_DIR) {
  process.env.PICODE_SESSION_DIR = await mkdtemp(path.join(tmpdir(), 'picode-smoke-sessions-'))
  process.on('exit', () => rmSync(process.env.PICODE_SESSION_DIR, { recursive: true, force: true }))
  console.log(`SMOKE isolated session store: ${process.env.PICODE_SESSION_DIR}`)
}

const cwd = await mkdtemp(path.join(tmpdir(), 'picode-smoke-'))
// A real file so the @-mention candidate listing has something to return.
const { writeFileSync } = await import('node:fs')
writeFileSync(path.join(cwd, 'alpha.txt'), 'mention me')

let child = null
let step = 'A session_created'
let timeout = armTimeout()
let sessionFile = null
let firstEntryId = null
let navTargetId = null
let providersCache = []
let currentModel = null
let thinkingLevelsCache = []
let currentThinkingLevel = null
const composerPush = { composer_state: false, models_available: false, slash_commands: false }
const seen = {
  agent_start: 0,
  text_delta: 0,
  agent_end: 0,
  user_message: 0,
  tool_start: 0,
  tool_update: 0,
  tool_end: 0,
  thinking_delta: 0,
  approval_required: 0,
  queue_update: 0
}
let toolRoundSucceeded = false

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
    console.log('SMOKE PASS host contract smoke complete (chat loop + tool round + resume/rename/tree/fork)')
    process.exit(0)
  }
  console.error(`SMOKE FAIL host exited during step '${step}' with code ${code}`)
  process.exit(1)
}

function onEvent(event) {
  console.log(`[contract] ${JSON.stringify(event).slice(0, 200)}`)
  const fatal = new Set(['session_error', 'turn_error', 'session_command_error'])
  if (fatal.has(event.type)) fail(`${event.type}: ${event.message}`)
  // Ticket 03 coverage: these arrive around the step transitions, so count
  // them globally (never asserted — model-dependent — only reported).
  if (event.type === 'user_message') seen.user_message++
  if (event.type === 'thinking_delta') seen.thinking_delta++
  if (event.type === 'approval_required') seen.approval_required++
  if (event.type === 'queue_update') seen.queue_update++
  if (event.type === 'models_available') {
    providersCache = event.providers ?? []
    currentModel = event.current
  }
  if (event.type === 'composer_state') {
    thinkingLevelsCache = event.availableLevels ?? []
    currentThinkingLevel = event.thinkingLevel
  }

  switch (step) {
    // ---------- Round A: fresh session, live chat loop ----------
    case 'A session_created': {
      if (event.type !== 'session_created') return
      if (!event.sessionId || !event.sessionFile) fail('session_created missing id/sessionFile')
      sessionFile = event.sessionFile
      console.log('SMOKE session_created ok')
      step = 'A composer push'
      return
    }
    case 'A composer push': {
      // Ticket 05: the composer menus data must arrive with the session.
      if (event.type in composerPush) composerPush[event.type] = true
      if (composerPush.composer_state && composerPush.models_available && composerPush.slash_commands) {
        if (!Array.isArray(providersCache) || providersCache.length === 0) fail('models_available has no provider groups')
        if (!Array.isArray(thinkingLevelsCache) || thinkingLevelsCache.length === 0) fail('composer_state has no thinking levels')
        const totalModels = providersCache.reduce((n, p) => n + (p.models?.length ?? 0), 0)
        if (totalModels === 0) fail('models_available lists no models')
        console.log(`SMOKE composer push ok (${providersCache.length} provider(s), ${thinkingLevelsCache.length} thinking levels)`)
        step = 'A agent_start 1'
        child.send({ type: 'prompt', text: 'Count slowly from one to twenty, one number per sentence.' })
      }
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
      if (seen.approval_required !== 0) fail('text-only round must not trigger the approval gate')
      console.log('SMOKE abort ok — streaming round 2 (tool round through the approval gate)')
      step = 'A agent_start 2'
      child.send({
        type: 'prompt',
        text: 'Use the bash tool to run exactly: echo picode_tool_round. Then report the command\'s output.'
      })
      return
    }
    case 'A agent_start 2': {
      if (event.type === 'agent_start') {
        seen.agent_start++
        step = 'A approval 2'
        console.log('SMOKE agent_start (round 2 — gated tool round)')
      }
      return
    }
    case 'A approval 2': {
      // NOTE: the SDK emits tool_execution_start BEFORE the gate hook runs,
      // so a tool_start here is expected — the pill is what gates execution.
      if (event.type === 'tool_start') {
        seen.tool_start++
        return
      }
      if (event.type !== 'approval_required') return
      if (event.toolName !== 'bash') fail(`gate should ask about bash, asked about ${event.toolName}`)
      if (!event.toolCallId) fail('approval_required missing toolCallId')
      console.log('SMOKE approval_required ok — approving with remember')
      step = 'A tools 2'
      child.send({ type: 'approve_tool', toolCallId: event.toolCallId, remember: true })
      return
    }
    case 'A tools 2': {
      if (event.type === 'approval_required') fail('a second ask after approve (same call)')
      if (event.type === 'tool_start') seen.tool_start++
      else if (event.type === 'tool_update') {
        seen.tool_update++
      } else if (event.type === 'tool_end') {
        seen.tool_end++
        if (!event.isError) toolRoundSucceeded = true
      } else if (event.type === 'text_delta') {
        seen.text_delta++
      } else if (event.type === 'agent_end') {
        seen.agent_end++
        if (seen.approval_required < 1) fail('the gate never asked before the first bash call')
        if (seen.tool_start < 1) fail('no tool_start in the tool round')
        if (!toolRoundSucceeded) fail('no successful tool_end in the tool round')
        console.log(`SMOKE gated tool round ok: ${JSON.stringify({ tool_start: seen.tool_start, tool_update: seen.tool_update, tool_end: seen.tool_end, approval_required: seen.approval_required })}`)
        console.log('SMOKE remember round: same tool should not ask again')
        step = 'A agent_start 3'
        child.send({
          type: 'prompt',
          text: 'Use the bash tool to run exactly: echo picode_remember_round. Then report the output.'
        })
      }
      return
    }
    case 'A agent_start 3': {
      if (event.type === 'agent_start') {
        seen.agent_start++
        step = 'A tools 3'
      }
      return
    }
    case 'A tools 3': {
      // Remembered rule: bash must run WITHOUT a second pill.
      if (event.type === 'approval_required') fail('remember rule did not suppress the ask for bash')
      if (event.type === 'tool_start') seen.tool_start++
      else if (event.type === 'tool_end') {
        seen.tool_end++
        if (event.isError) fail('remembered bash round ended in error')
      } else if (event.type === 'agent_end') {
        seen.agent_end++
        if (seen.tool_start < 2) fail('remember round never ran bash')
        console.log('SMOKE remember ok — bash ran without a second ask')
        console.log('SMOKE read-only tier: switching access mode')
        step = 'A readonly mode'
        child.send({ type: 'set_access_mode', mode: 'read-only' })
      }
      return
    }
    case 'A readonly mode': {
      if (event.type !== 'access_mode_changed') return
      if (event.mode !== 'read-only') fail(`access_mode_changed should carry read-only, got ${event.mode}`)
      console.log('SMOKE access_mode_changed ok — prompting under Read Only')
      step = 'A agent_start 4'
      child.send({
        type: 'prompt',
        text: 'Use the bash tool to run exactly: echo picode_readonly_round. Then report the output.'
      })
      return
    }
    case 'A agent_start 4': {
      if (event.type === 'agent_start') {
        seen.agent_start++
        step = 'A tools 4'
      }
      return
    }
    case 'A tools 4': {
      // Read Only tier denies mutating tools outright — no pill, no execution.
      if (event.type === 'approval_required') fail('read-only tier must auto-deny without asking')
      if (event.type === 'tool_end' && !event.isError) fail('read-only tier let a mutating tool succeed')
      if (event.type === 'agent_end') {
        seen.agent_end++
        console.log('SMOKE read-only ok — mutation blocked by the tier')
        console.log('SMOKE back to standard: deny-with-reason round')
        step = 'A standard mode'
        child.send({ type: 'set_access_mode', mode: 'standard' })
      }
      return
    }
    case 'A standard mode': {
      if (event.type !== 'access_mode_changed') return
      if (event.mode !== 'standard') fail(`access_mode_changed should carry standard, got ${event.mode}`)
      step = 'A agent_start 5'
      // write is NOT remembered (only bash is) — the gate must ask again.
      child.send({
        type: 'prompt',
        text: 'Use the write tool to create a file named picode-deny-probe.txt whose content is exactly: nope. Then confirm.'
      })
      return
    }
    case 'A agent_start 5': {
      if (event.type === 'agent_start') {
        seen.agent_start++
        step = 'A approval 5'
      }
      return
    }
    case 'A approval 5': {
      // tool_execution_start precedes the gate hook (SDK order) — ignore it;
      // only a tool_end would mean the call executed without an ask.
      if (event.type === 'tool_start') return
      if (event.type === 'tool_end') fail('tool executed without approval in the deny round')
      if (event.type !== 'approval_required') return
      console.log(`SMOKE approval_required ok (${event.toolName}) — denying with a reason`)
      step = 'A deny 5'
      child.send({ type: 'deny_tool', toolCallId: event.toolCallId, reason: 'PICODE_DENY_REASON: not today' })
      return
    }
    case 'A deny 5': {
      if (event.type === 'approval_required') fail('a new pill after the denial (terminate hint ignored)')
      if (event.type === 'agent_end') {
        seen.agent_end++
        console.log('SMOKE deny-with-reason ok — turn stopped')
        console.log('SMOKE queue round: steer + follow-up + clear')
        step = 'A agent_start 6'
        child.send({ type: 'prompt', text: 'Count slowly from thirty to fifty, one number per sentence.' })
      }
      return
    }
    case 'A agent_start 6': {
      if (event.type === 'agent_start') {
        seen.agent_start++
        step = 'A queue steer'
        child.send({ type: 'steer_prompt', text: 'Skip ahead — jump straight to fifty.' })
      }
      return
    }
    case 'A queue steer': {
      if (event.type === 'queue_update') {
        if (event.steering.length === 1) {
          console.log('SMOKE queue_update ok (steering=1)')
          step = 'A queue steer delivered'
        } else if (event.steering.length === 0 && event.followUp.length === 0) {
          fail('unexpected empty queue_update before the steer was observed')
        }
      }
      return
    }
    case 'A queue steer delivered': {
      if (event.type === 'queue_update' && event.steering.length === 0) {
        console.log('SMOKE steer delivered ok (steering=0)')
        step = 'A queue followup'
        child.send({ type: 'follow_up_prompt', text: 'After this turn, summarize what you did.' })
      }
      return
    }
    case 'A queue followup': {
      if (event.type === 'queue_update' && event.followUp.length === 1) {
        console.log('SMOKE queue_update ok (followUp=1)')
        step = 'A queue cleared'
        child.send({ type: 'clear_queue' })
      }
      return
    }
    case 'A queue cleared': {
      if (event.type === 'queue_update' && event.steering.length === 0 && event.followUp.length === 0) {
        console.log('SMOKE clear_queue ok (queue empty)')
        step = 'A queue settle'
      }
      return
    }
    case 'A queue settle': {
      // The run settles (steered + follow-up round may still produce text).
      if (event.type === 'agent_end') {
        seen.agent_end++
        console.log('SMOKE queue round ok')
        console.log('SMOKE composer controls: thinking level, model, file list')
        step = 'A thinking set'
        const differentLevel = thinkingLevelsCache.find((l) => l !== currentThinkingLevel)
        child.send({ type: 'set_thinking_level', level: differentLevel ?? currentThinkingLevel ?? 'high' })
      }
      return
    }
    case 'A thinking set': {
      if (event.type !== 'thinking_level_changed') return
      if (!Array.isArray(event.availableLevels) || event.availableLevels.length === 0) {
        fail('thinking_level_changed missing availableLevels')
      }
      console.log(`SMOKE thinking_level_changed ok (level=${event.level})`)
      const candidates = providersCache.flatMap((p) => (p.models ?? []).map((m) => ({ providerId: p.providerId, modelId: m.modelId })))
      const different = candidates.find((m) => m.providerId !== currentModel?.providerId || m.modelId !== currentModel?.modelId)
      if (different) {
        console.log(`SMOKE switching model → ${different.providerId}/${different.modelId}`)
        step = 'A model set'
        child.send({ type: 'set_model', providerId: different.providerId, modelId: different.modelId })
      } else {
        console.log('SMOKE single model available — skipping model switch')
        step = 'A files'
        child.send({ type: 'list_files', requestId: 'smoke-files-1', query: 'alp' })
      }
      return
    }
    case 'A model set': {
      if (event.type !== 'model_changed') return
      if (!event.model || !event.model.providerId || !event.model.modelId) fail('model_changed missing model ref')
      console.log(`SMOKE model_changed ok (${event.model.providerId}/${event.model.modelId})`)
      step = 'A files'
      child.send({ type: 'list_files', requestId: 'smoke-files-1', query: 'alp' })
      return
    }
    case 'A files': {
      if (event.type !== 'file_list') return
      if (event.requestId !== 'smoke-files-1') fail(`file_list for the wrong request: ${event.requestId}`)
      if (!Array.isArray(event.files) || !event.files.includes('alpha.txt')) {
        fail(`file_list should contain alpha.txt, got ${JSON.stringify(event.files)}`)
      }
      console.log('SMOKE file_list ok (alpha.txt listed)')
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
