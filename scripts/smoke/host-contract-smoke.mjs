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
 *   → prompt → edit round: approval_required → approve → tool_end WITH the
 *   result diff text (ticket 78 additive projection) → agent_end
 *   → set_access_mode read-only → prompt → NO approval_required (auto-deny)
 *   → agent_end → set_access_mode standard → prompt → approval_required
 *   → deny-with-reason → agent_end (terminate)
 *   → prompt → steer → queue_update×2 → follow-up → queue_update
 *   → clear_queue → queue_update → agent_end
 *   → set_thinking_level → thinking_level_changed; set_model → model_changed
 *   → list_files → file_list (ticket 71 repo state: git ls-files candidates,
 *   pi16-at-no-match hit, gitignored excluded, zero-write proven)
 *   → get_branch → branch_info → shutdown → exit 0
 *
 *   Round B (ticket 04: resume / rename / tree / fork against the SAME file)
 *   resume → session_created(resumed) → history_loaded → session_tree
 *   → set_session_label → session_renamed → request_tree → session_tree
 *   → navigate_tree → history_loaded + session_tree(leaf moved)
 *   → fork_session → session_created(new file) → history_loaded → exit 0
 *
 *   Round D (ticket 71: the NON-repo candidate state) — a fresh cwd that is
 *   never git-initialized, so the host falls back to the capped walk:
 *   session_created → list_files → file_list (cap cut zzz/late.txt,
 *   FILE_LIST_TRUNCATED at the tail) → shutdown → exit 0
 *
 *   Round E (ticket 80报备: the additive SessionDefaults.accessMode on the
 *   spawn sentinel) — two fresh forks, no model calls:
 *   legacy-shape sentinel (no accessMode) → composer_state.accessMode stays
 *   the gate's own 'standard' (old payloads validate, fallback intact);
 *   sentinel with accessMode:'read-only' → composer_state.accessMode is
 *   'read-only' with no set_access_mode command ever sent.
 *
 *   Round F (ticket 79报备: user-message image projection + edit-resend
 *   navigation) — a SEEDED session file, zero model calls:
 *   resume → session_created(resumed) → history_loaded (image message
 *   carries parts; imageless keeps the old shape) → navigate_tree(u2)
 *   → history_loaded([u1,a1]) + session_tree(leaf=a1, the parent)
 *   → navigate_tree(u1, root) → history_loaded([]) + leafId null (resetLeaf)
 *   → shutdown → exit 0 (file lossless, no branch_summary)
 *
 *   Round G (ticket 89报备: the MCP OAuth bridge contract) — no model calls:
 *   mcp_auth_start(ghost server) → mcp_auth_notice(the adapter's own
 *   not-found error) → mcp_auth_completed(ok=false, notices relayed)
 *   → shutdown → exit 0. Credentials never enter the contract stream.
 *
 * Usage: npm run build && node scripts/smoke/host-contract-smoke.mjs
 * Expects working model auth in ~/.pi/agent (same as the pi TUI). Session
 * files land in an isolated throwaway store (PICODE_SESSION_DIR, ticket 13)
 * — the real session library is never written.
 */

import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rmSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fork } from 'node:child_process'

const HOST_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'out', 'main', 'host.js')
const STEP_TIMEOUT_MS = 90_000
const SMOKE_LABEL = 'PICODE_SMOKE_RENAMED'

// Ticket 79 round F: the seeded edit-resend fixture (written in onHostExit
// once the isolated store is settled below).
const STAMP_79 = '2026-09-14T10:00:00.000Z'
const EDIT79_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
let edit79File = ''

// Session isolation (ticket 13): hosts must never write the real
// ~/.pi/agent/sessions. Use the suite-wide store when run through
// scripts/smoke/run-all.sh (which owns its cleanup), otherwise create and
// clean up a throwaway store of our own — standalone runs stay safe too.
if (!process.env.PICODE_SESSION_DIR) {
  process.env.PICODE_SESSION_DIR = await mkdtemp(path.join(tmpdir(), 'picode-smoke-sessions-'))
  process.on('exit', () => rmSync(process.env.PICODE_SESSION_DIR, { recursive: true, force: true }))
  console.log(`SMOKE isolated session store: ${process.env.PICODE_SESSION_DIR}`)
}
edit79File = path.join(process.env.PICODE_SESSION_DIR, 'edit79-seeded.jsonl')

const cwd = await mkdtemp(path.join(tmpdir(), 'picode-smoke-'))
// A real file so the @-mention candidate listing has something to return.
const { mkdirSync, writeFileSync, readFileSync } = await import('node:fs')
writeFileSync(path.join(cwd, 'alpha.txt'), 'mention me')

// Ticket 21: the branch readout roundtrip. With git available the workspace
// becomes a repo on a KNOWN branch and branch_info must report exactly that;
// without git the same roundtrip must degrade to branch_info(null).
const SMOKE_BRANCH = 'picode-smoke-branch'
let expectedBranch = SMOKE_BRANCH
const { execFileSync } = await import('node:child_process')
try {
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'ignore' })
  git('init', '-b', SMOKE_BRANCH)
  git('config', 'user.email', 'smoke@picode.local')
  git('config', 'user.name', 'Picode Smoke')
  // HEAD must resolve for `rev-parse --abbrev-ref HEAD` — unborn HEAD fails.
  git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'smoke root')
  console.log(`SMOKE git repo initialized on branch ${SMOKE_BRANCH}`)
} catch {
  expectedBranch = null
  console.log('SMOKE git unavailable — branch readout must degrade to null')
}

// Ticket 71: the @-mention candidate fixtures, in BOTH smoke states.
//
// Repo state (when git is available): the candidates must come from
// read-only `git ls-files` — tracked (cached) + untracked-unignored (others)
// — and the pi16-at-no-match reconstruction must HIT: 1500 alphabetical-early
// files exhaust the walk's entry cap before `zzz/` is ever reached, so only
// a git-backed candidate set can offer `zzz/target.ts`.
writeFileSync(path.join(cwd, 'beta.txt'), 'tracked candidate')
writeFileSync(path.join(cwd, '.gitignore'), 'ignored-dir/\n')
mkdirSync(path.join(cwd, 'ignored-dir'), { recursive: true })
writeFileSync(path.join(cwd, 'ignored-dir', 'buried.txt'), 'gitignored')
mkdirSync(path.join(cwd, 'aaa'), { recursive: true })
for (let i = 0; i < 1500; i++) writeFileSync(path.join(cwd, 'aaa', `file-${String(i).padStart(4, '0')}.txt`), 'bulk')
mkdirSync(path.join(cwd, 'zzz'), { recursive: true })
writeFileSync(path.join(cwd, 'zzz', 'target.ts'), 'the pi16 hit')
if (expectedBranch !== null) {
  execFileSync('git', ['add', 'beta.txt', '.gitignore'], { cwd, stdio: 'ignore' })
}
// Zero-write proof baseline (ticket 71 red line): captured AFTER all setup
// git commands, BEFORE any list_files roundtrip. `git ls-files` is pure
// plumbing — unlike `git status` it must never refresh the index.
const repoIndexPath = path.join(cwd, '.git', 'index')
let repoIndexBytes = expectedBranch !== null ? readFileSync(repoIndexPath) : null

// Ticket 71 round D workspace: a NON-repo cwd (never git-initialized) where
// the walk fallback runs — and the entry cap must cut `zzz/late.txt` while
// the truncation marker rides at the candidate list's tail.
const walkCwd = await mkdtemp(path.join(tmpdir(), 'picode-smoke-'))
mkdirSync(path.join(walkCwd, 'aaa'), { recursive: true })
for (let i = 0; i < 1500; i++) writeFileSync(path.join(walkCwd, 'aaa', `file-${String(i).padStart(4, '0')}.txt`), 'bulk')
mkdirSync(path.join(walkCwd, 'zzz'), { recursive: true })
writeFileSync(path.join(walkCwd, 'zzz', 'late.txt'), 'beyond the cap')

// Ticket 71: the zero-contract truncation marker — imported from the
// contract so the smoke and the host cannot drift apart.
const { FILE_LIST_TRUNCATED } = await import('../../src/shared/contract.ts')

let child = null
let step = 'A session_created'
let timeout = armTimeout()
let sessionFile = null
let firstEntryId = null
let navTargetId = null
let providersCache = []
const gNotices = []
let currentModel = null
let thinkingLevelsCache = []
let currentThinkingLevel = null
// Ticket 78: the edit round's diff-bearing tool_end (Round B re-asserts the
// replayed projection) and the tool-name map for tool_end correlation (the
// tool_end event names only its call id).
let editDiffSeen = null
const toolNames = new Map()
const composerPush = { composer_state: false, models_available: false, slash_commands: false }
// Ticket 77: the additive context-ring increments, reported at implementation
// time — ModelRef.contextWindow? on the model catalog, message_end.usage? on
// the live path, history_loaded.usage? on the replay path. Old payloads
// missing the fields stay valid; the smoke pins the shapes and the presence
// against the real SDK.
const ring = { modelRefs: 0, withWindow: 0, messageEnds: 0, withUsage: 0, lastLiveUsage: null, historyUsage: undefined }
function assertUsageShape(usage, where) {
  if (typeof usage !== 'object' || usage === null) fail(`${where}: usage must be an object`)
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'total']) {
    if (typeof usage[key] !== 'number' || !Number.isFinite(usage[key]) || usage[key] < 0) {
      fail(`${where}: usage.${key} must be a non-negative finite number, got ${JSON.stringify(usage[key])}`)
    }
  }
  const quad = usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  if (usage.total <= 0) fail(`${where}: usage.total must be positive (the validity rule drops empty records)`)
  if (Math.abs(usage.total - quad) > Math.max(quad, usage.total) * 0.05) {
    fail(`${where}: usage.total ${usage.total} diverges from the quadruple sum ${quad} beyond tolerance`)
  }
}
function assertModelRefShape(ref, where) {
  if (typeof ref !== 'object' || ref === null) fail(`${where}: model ref must be an object`)
  // Purely additive: the field may stay ABSENT (legacy shape) — but when it
  // rides along it must be a positive finite number.
  if (ref.contextWindow === undefined) return
  if (typeof ref.contextWindow !== 'number' || !Number.isFinite(ref.contextWindow) || ref.contextWindow <= 0) {
    fail(`${where}: contextWindow must be a positive finite number, got ${JSON.stringify(ref.contextWindow)}`)
  }
}
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
  denyAck: false,
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

async function onHostExit(exited, code) {
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
  if (step === 'C shutdown') {
    if (code !== 0) fail(`round C exit should be clean 0, got ${code}`)
    // Ticket 71: round D — the NON-repo candidate state. The walk fallback
    // runs here and the entry cap must cut the zzz/ files with the
    // truncation marker riding at the list's tail.
    console.log('SMOKE round C shutdown ok — starting round D (non-repo walk+cap state)')
    step = 'D session_created'
    bumpTimeout()
    child = forkHost([walkCwd], onEvent)
    return
  }
  if (step === 'D shutdown') {
    if (code !== 0) fail(`round D exit should be clean 0, got ${code}`)
    // Ticket 80报备: round E — the additive SessionDefaults.accessMode rides
    // the spawn sentinel. First a LEGACY-shape sentinel (ticket-11 fields
    // only, no accessMode) — it must validate as-is and leave the gate at
    // its own 'standard' fallback.
    console.log('SMOKE round D shutdown ok — starting round E (legacy sentinel, no accessMode)')
    step = 'E composer push'
    bumpTimeout()
    child = forkHost(
      [cwd, 'picode:defaults=' + JSON.stringify({ providerId: 'no-such-provider', modelId: 'no-such-model', thinkingLevel: 'minimal' })],
      onEvent
    )
    return
  }
  // Then the ticket-80 increment itself: an accessMode-only sentinel must
  // boot the gate straight into that tier.
  if (step === 'E shutdown') {
    if (code !== 0) fail(`round E exit should be clean 0, got ${code}`)
    console.log('SMOKE round E shutdown ok — starting round E2 (sentinel with accessMode: read-only)')
    step = 'E2 composer push'
    bumpTimeout()
    child = forkHost([cwd, 'picode:defaults=' + JSON.stringify({ accessMode: 'read-only' })], onEvent)
    return
  }
  // Ticket 79报备: round F — the user-message image projection (additive)
  // and the edit-resend tree semantics, against a SEEDED session file, so
  // the whole round needs zero model calls. Runs after the ticket-80 E2
  // sentinel round completes its composer_state assertions.
  if (step === 'E2 shutdown') {
    if (code !== 0) fail(`round E2 exit should be clean 0, got ${code}`)
    console.log('SMOKE round E2 shutdown ok — starting round F (ticket-79 image projection + edit-resend navigation)')
    writeFileSync(
      edit79File,
      [
        JSON.stringify({ type: 'session', version: 3, id: 'edit79-fixed-id', timestamp: STAMP_79, cwd }),
        // Root user message WITH an inline image (the projection's raw shape).
        JSON.stringify({
          type: 'message', id: 'e79-u1', parentId: null, timestamp: STAMP_79,
          message: { role: 'user', content: [
            { type: 'text', text: 'PICODE_EDIT79 what is in this shot?' },
            { type: 'image', data: EDIT79_PNG, mimeType: 'image/png' }
          ] }
        }),
        JSON.stringify({
          type: 'message', id: 'e79-a1', parentId: 'e79-u1', timestamp: STAMP_79,
          message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_EDIT79 first reply' }], stopReason: 'stop' }
        }),
        // Imageless user message (the old-payload compat shape).
        JSON.stringify({
          type: 'message', id: 'e79-u2', parentId: 'e79-a1', timestamp: STAMP_79,
          message: { role: 'user', content: [{ type: 'text', text: 'PICODE_EDIT79 second message' }] }
        }),
        JSON.stringify({
          type: 'message', id: 'e79-a2', parentId: 'e79-u2', timestamp: STAMP_79,
          message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_EDIT79 second reply' }], stopReason: 'stop' }
        })
      ].join('\n') + '\n'
    )
    step = 'F session_created'
    bumpTimeout()
    child = forkHost([cwd, edit79File], onEvent)
    return
  }
  if (step === 'F shutdown') {
    if (code !== 0) fail(`round F exit should be clean 0, got ${code}`)
    // 分支无损 + 天然 No summary: after the edit-resend navigations the file
    // still carries EVERY seeded message (append-only), NO message entry was
    // appended by the navigations themselves (the resume's own SDK
    // bookkeeping — e.g. thinking_level_change — is the only legal tail),
    // and no branch_summary exists.
    const after = readFileSync(edit79File, 'utf8').split('\n').filter((l) => l.trim() !== '')
    const messageLines = after.filter((l) => l.includes('"type":"message"'))
    if (messageLines.length !== 4) {
      fail(`edit-resend must not append message entries (expected 4, got ${messageLines.length})`)
    }
    if (after.some((l) => l.includes('"branch_summary"'))) fail('edit-resend navigation must be naturally No summary')
    for (const id of ['e79-u1', 'e79-a1', 'e79-u2', 'e79-a2']) {
      if (!after.some((l) => l.includes(`"${id}"`))) fail(`edit-resend lost entry ${id} — the move must be lossless`)
    }
    console.log('SMOKE round F shutdown ok — messages lossless, no appended branch entries, no branch_summary (天然 No summary)')
    // Ticket 89报备: round G — the MCP OAuth bridge contract (additive
    // host messages): `mcp_auth_start` must terminate in exactly one
    // `mcp_auth_completed` whose `ok` mirrors the adapter's error notices,
    // relaying through the session host's new extension-UI bridge. The
    // ghost server name never exists in the adapter's config, so the
    // adapter's own "not found" error notice rides `mcp_auth_notice`
    // first — the honest-failure path of the real command chain.
    console.log('SMOKE round F shutdown ok — starting round G (ticket-89 MCP OAuth bridge contract)')
    step = 'G session_created'
    bumpTimeout()
    child = forkHost([cwd], onEvent)
    return
  }
  if (step === 'G shutdown') {
    if (code !== 0) fail(`round G exit should be clean 0, got ${code}`)
    await finishClean(code)
    return
  }
  if (step === 'clean exit') {
    await finishClean(code)
    return
  }
  console.error(`SMOKE FAIL host exited during step '${step}' with code ${code}`)
  process.exit(1)
}

async function finishClean(code) {
  if (code !== 0) fail(`expected clean exit 0, got ${code}`)
  // Ticket 33: the SessionSummary contract against a REAL SDK-written file
  // — birthtime-derived createdAt rides along as a PURE ADDITION (every
  // legacy field keeps its shape and meaning), and degrades to null when
  // the platform reports no birthtime.
  await verifySessionSummaryContract()
  // Ticket 36: the call-trace payload contract against the SAME real file
  // — the pure builder turns the jsonl the SDK actually wrote into
  // per-call payloads (entry = one model call, usage columns per ADR-0002).
  await verifySessionTraceContract()
  console.log('SMOKE PASS host contract smoke complete (chat loop + tool round + resume/rename/tree/fork + candidate states + ticket-80 access sentinel)')
  process.exit(0)
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
    // Ticket 77报备: every catalog model ref — shape-validate contextWindow
    // (absent stays legal) and count how many carry it.
    for (const provider of providersCache) {
      for (const ref of provider.models ?? []) {
        assertModelRefShape(ref, 'models_available')
        ring.modelRefs++
        if (ref.contextWindow !== undefined) ring.withWindow++
      }
    }
    if (event.current !== null) assertModelRefShape(event.current, 'models_available.current')
  }
  if (event.type === 'composer_state') {
    thinkingLevelsCache = event.availableLevels ?? []
    currentThinkingLevel = event.thinkingLevel
    if (event.model !== null) assertModelRefShape(event.model, 'composer_state.model')
  }
  // Ticket 77报备: every live message_end — shape-validate the additive
  // usage when it rides along, and remember the last one for the run-end
  // presence assertion.
  if (event.type === 'message_end') {
    ring.messageEnds++
    if (event.usage !== undefined) {
      assertUsageShape(event.usage, 'message_end.usage')
      ring.withUsage++
      ring.lastLiveUsage = event.usage
    }
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
      step = 'A approve ack 2'
      child.send({ type: 'approve_tool', toolCallId: event.toolCallId, remember: true })
      return
    }
    case 'A approve ack 2': {
      // Ticket 25: the host acks the human decision (approval_resolved)
      // before the tool runs — the transcript story must not rely on the
      // pill converting in place.
      if (event.type === 'approval_resolved') {
        if (event.approved !== true) fail('approval_resolved should carry approved=true after approve_tool')
        console.log('SMOKE approval_resolved ok (approved)')
        step = 'A tools 2'
        return
      }
      if (event.type === 'tool_start') fail('tool ran before the approval_resolved ack')
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
        // Ticket 78 additive discipline: a non-edit tool result carries NO
        // diff field — the projection increment stays edit-only, and old
        // payloads (field absent) keep validating byte-for-byte.
        if (event.diff !== undefined) fail('bash tool_end must not carry a diff field (additive discipline)')
      } else if (event.type === 'agent_end') {
        seen.agent_end++
        if (seen.tool_start < 2) fail('remember round never ran bash')
        console.log('SMOKE remember ok — bash ran without a second ask')
        console.log('SMOKE diff projection: prompting an edit round (ticket 78)')
        step = 'A agent_start 4d'
        child.send({
          type: 'prompt',
          text: 'Use the edit tool to change alpha.txt: replace the text "mention me" with "mention me edited". Then report the result.'
        })
      }
      return
    }
    case 'A agent_start 4d': {
      if (event.type === 'agent_start') {
        step = 'A edit tools 4d'
        console.log('SMOKE agent_start (edit round — diff projection)')
      }
      return
    }
    case 'A edit tools 4d': {
      // The SDK emits tool_execution_start BEFORE the gate hook runs, so the
      // edit's tool_start arrives first; the pill gates the execution itself.
      if (event.type === 'tool_start') {
        seen.tool_start++
        // tool_start carries `name` (toolName is the approval_required field).
        toolNames.set(event.toolCallId, event.name)
        return
      }
      if (event.type === 'approval_required') {
        if (event.toolName !== 'edit') fail(`the edit round should ask about edit, asked about ${event.toolName}`)
        console.log('SMOKE approval_required ok for edit — approving')
        child.send({ type: 'approve_tool', toolCallId: event.toolCallId, remember: false })
        return
      }
      if (event.type === 'tool_end') {
        seen.tool_end++
        if (toolNames.get(event.toolCallId) !== 'edit') return
        if (event.isError) fail('the smoke edit round ended in error')
        // THE contract assertion (ticket 78): the edit tool_end carries the
        // display diff text from the SDK result's details.diff — a real
        // replacement has at least one + row and one − row.
        if (typeof event.diff !== 'string' || event.diff === '') {
          fail('edit tool_end must carry the result diff text (ticket 78 additive projection)')
        }
        if (!event.diff.includes('+') || !event.diff.includes('-')) {
          fail(`edit diff text should contain +/- rows, got: ${JSON.stringify(event.diff.slice(0, 120))}`)
        }
        editDiffSeen = event.diff
        console.log(`SMOKE edit tool_end diff ok (${event.diff.split('\n').length} diff lines)`)
        return
      }
      if (event.type === 'agent_end') {
        seen.agent_end++
        if (editDiffSeen === null) fail('the edit round never produced a diff-bearing tool_end')
        console.log('SMOKE diff projection ok — edit diff rode the live event')
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
      if (event.type === 'approval_resolved') {
        if (event.approved !== false) fail('approval_resolved should carry approved=false after deny_tool')
        if (event.reason !== 'PICODE_DENY_REASON: not today') fail(`deny reason did not round-trip: ${event.reason}`)
        seen.denyAck = true
        console.log('SMOKE approval_resolved ok (denied, reason round-tripped)')
        return
      }
      if (event.type === 'agent_end') {
        seen.agent_end++
        if (!seen.denyAck) fail('deny round ended without an approval_resolved ack')
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
      // Ticket 71: the two candidate states, asserted against the REAL host.
      if (expectedBranch !== null) {
        // Repo state: candidates come from read-only `git ls-files`.
        if (!event.files.includes('beta.txt')) fail('ticket-71: the tracked (cached) candidate beta.txt is missing — git ls-files path dead?')
        if (!event.files.includes('zzz/target.ts')) {
          fail('ticket-71: pi16-at-no-match reconstruction failed — the file beyond the walk cap must surface from git ls-files')
        }
        if (event.files.includes('ignored-dir/buried.txt')) fail('ticket-71: a gitignored entry must never be a candidate')
        if (event.files.includes(FILE_LIST_TRUNCATED)) fail('ticket-71: the git answer is full — no truncation marker may ride it')
        console.log(`SMOKE ticket-71 repo candidates ok (git ls-files: ${event.files.length} paths, tracked+untracked, ignored excluded, pi16 hit)`)
        // The zero-write red line, proven: ls-files must not touch the index.
        const indexAfter = readFileSync(repoIndexPath)
        if (!indexAfter.equals(repoIndexBytes)) fail('ticket-71: the candidate listing WROTE the git index — the read-only red line is broken')
        console.log('SMOKE ticket-71 git zero-write ok (index bytes unchanged)')
      } else {
        // git unavailable: the init failed, so this cwd is a plain walk
        // state — the cap must cut zzz/ and the marker must ride the tail.
        if (!event.files.includes(FILE_LIST_TRUNCATED)) fail('ticket-71: a 1500-entry walk must append the truncation marker')
        if (event.files.includes('zzz/target.ts')) fail('ticket-71: the walk cap must cut zzz/target.ts')
        console.log(`SMOKE ticket-71 walk-state candidates ok (${event.files.length} paths, cap cut, marker at tail)`)
      }
      console.log('SMOKE file_list ok (alpha.txt listed)')
      step = 'A branch'
      child.send({ type: 'get_branch' })
      return
    }
    case 'A branch': {
      if (event.type !== 'branch_info') return
      if (event.branch !== expectedBranch) {
        fail(`branch_info should report ${JSON.stringify(expectedBranch)}, got ${JSON.stringify(event.branch)}`)
      }
      console.log(`SMOKE branch_info ok (branch=${JSON.stringify(event.branch)})`)
      // Ticket 77报备 (context-ring increments): the runtime catalog must
      // carry the additive contextWindow (the pi-ai Model always has one —
      // the model-config default fills omitted values), and the real model
      // calls above must have surfaced at least one valid message_end.usage.
      if (ring.withWindow === 0) {
        fail(`ticket-77: none of the ${ring.modelRefs} catalog model refs carried contextWindow — the host must read it from the pi-ai Model`)
      }
      if (ring.withUsage === 0) {
        fail('ticket-77: no message_end ever carried usage — the live ring path is dead')
      }
      console.log(
        `SMOKE ticket-77 additive increments ok — ${ring.withWindow}/${ring.modelRefs} model refs carry contextWindow, ${ring.withUsage}/${ring.messageEnds} message_ends carry usage (last total ${ring.lastLiveUsage?.total ?? '-'})`
      )
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
      // Ticket 14: the replay payload is structured — user items carry the
      // sniffed skill marker field, and the round-A bash call comes back as
      // a settled tool item with its final output.
      if (!('skillName' in (event.items[0] ?? {}))) {
        fail('history items must be structured (user items carry skillName, ticket 14)')
      }
      const bashReplayed = event.items.some(
        (i) => i.role === 'tool' && i.name === 'bash' && typeof i.output === 'string' && i.output.includes('picode_tool_round')
      )
      if (!bashReplayed) {
        fail('resume replay must carry the round-A bash call with its final output (ticket 14)')
      }
      // Ticket 77报备: the replay event carries the leaf path's ring usage —
      // round A made real model calls, so it MUST be present here.
      if (event.usage === undefined) fail('ticket-77: history_loaded must carry the additive usage after real model calls')
      if (event.usage !== null) assertUsageShape(event.usage, 'history_loaded.usage')
      ring.historyUsage = event.usage ?? null
      console.log(`SMOKE ticket-77 history_loaded.usage ok (total ${ring.historyUsage?.total ?? 'null'})`)
      // Ticket 78: the replay projection rides the same additive increment —
      // the round's edit call comes back with the recorded details.diff as
      // the item's diff text, isomorphic with the live event.
      const editReplayed = event.items.find((i) => i.role === 'tool' && i.name === 'edit')
      if (editReplayed === undefined) fail('resume replay must carry the round-A edit call (ticket 78)')
      if (typeof editReplayed.diff !== 'string' || !editReplayed.diff.includes('+')) {
        fail(`replayed edit item must carry the recorded diff text, got: ${JSON.stringify(editReplayed.diff).slice(0, 120)}`)
      }
      firstEntryId = event.items[0].id
      // Navigate to the second item (an assistant entry): Pi moves the leaf
      // exactly onto non-user-message targets (user-message targets instead
      // move the leaf to the entry's parent for re-editing).
      navTargetId = event.items[1]?.id ?? null
      if (!navTargetId) fail('history should contain at least two items')
      console.log(`SMOKE history_loaded ok (${event.items.length} items, edit diff replayed: ${editReplayed.diff.split('\n').length} lines)`)
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
      // Ticket 77: a replayed path without any valid usage must degrade the
      // field to null (never a malformed record); shape-check when present.
      if (event.usage !== undefined && event.usage !== null) assertUsageShape(event.usage, 'B nav history usage')
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
      if (event.usage !== undefined && event.usage !== null) assertUsageShape(event.usage, 'C history usage')
      console.log(`SMOKE fork history ok (${event.items.length} item(s))`)
      step = 'C shutdown'
      child.send({ type: 'shutdown' })
      return
    }

    // ---------- Round D: ticket 71, the NON-repo candidate state ----------
    case 'D session_created': {
      if (event.type !== 'session_created') return
      if (!event.sessionId) fail('round D session_created missing id')
      console.log('SMOKE round D session ok (non-repo walk state)')
      step = 'D files'
      child.send({ type: 'list_files', requestId: 'smoke-files-walk', query: 'late' })
      return
    }
    case 'D files': {
      if (event.type !== 'file_list') return
      if (event.requestId !== 'smoke-files-walk') fail(`file_list for the wrong request: ${event.requestId}`)
      const files = event.files
      if (!Array.isArray(files)) fail('round D file_list must carry an array')
      if (files.includes('zzz/late.txt')) fail('ticket-71: the walk cap must cut zzz/late.txt — aaa/ exhausts the 1500-entry cap first')
      if (!files.includes('aaa/file-0000.txt')) fail('ticket-71: the alphabetically-first walk files must be candidates')
      if (files[files.length - 1] !== FILE_LIST_TRUNCATED) fail('ticket-71: a capped walk must append the truncation marker at the tail')
      if (files.length !== 1501) fail(`ticket-71: expected 1500 walk entries + marker, got ${files.length}`)
      console.log('SMOKE ticket-71 non-repo walk+cap ok (cap cut zzz, marker at tail, honest degradation)')
      step = 'D shutdown'
      child.send({ type: 'shutdown' })
      return
    }

    // ---------- Round E (ticket 80): legacy sentinel — accessMode absent ----------
    case 'E composer push': {
      if (event.type !== 'composer_state') return
      if (event.accessMode !== 'standard') {
        fail(`ticket-80 legacy payload: the gate should stay at its 'standard' fallback, got ${event.accessMode}`)
      }
      console.log('SMOKE ticket-80 legacy sentinel ok — old payload validates, gate fallback intact (standard)')
      step = 'E shutdown'
      child.send({ type: 'shutdown' })
      return
    }

    // ---------- Round E2 (ticket 80): sentinel with accessMode ----------
    case 'E2 composer push': {
      if (event.type !== 'composer_state') return
      if (event.accessMode !== 'read-only') {
        fail(`ticket-80: the accessMode sentinel should boot the gate into 'read-only', got ${event.accessMode}`)
      }
      console.log('SMOKE ticket-80 accessMode sentinel ok — the created session runs Read Only with no set_access_mode sent')
      step = 'E2 shutdown'
      child.send({ type: 'shutdown' })
      return
    }

    // ---------- Round F: ticket 79 — image projection + edit-resend tree semantics ----------
    case 'F session_created': {
      if (event.type !== 'session_created') return
      if (!event.resumed) fail('round F must open the seeded file as a resume')
      if (event.sessionFile !== edit79File) fail(`round F resumed the wrong file: ${event.sessionFile}`)
      console.log('SMOKE round F session ok (seeded ticket-79 fixture)')
      // The resume replay IS the image-projection assertion: the seeded
      // image message must carry its parts; the imageless one must keep the
      // EXACT pre-79 item shape (field absent, not empty).
      step = 'F history'
      return
    }
    case 'F history': {
      if (event.type !== 'history_loaded') return
      const items = event.items
      if (!Array.isArray(items) || items.length !== 4) fail(`round F replay must hold the 4 seeded messages, got ${JSON.stringify(items?.length)}`)
      const u1 = items[0]
      if (u1?.role !== 'user' || u1.id !== 'e79-u1') fail('round F replay order broken at the first user item')
      if (!Array.isArray(u1.images) || u1.images.length !== 1) fail('ticket-79: the image message must project its image parts')
      if (u1.images[0].kind !== 'image' || u1.images[0].mimeType !== 'image/png' || u1.images[0].data !== EDIT79_PNG) {
        fail(`ticket-79: image part shape wrong: ${JSON.stringify(u1.images[0])}`)
      }
      const u2 = items[2]
      if (u2?.role !== 'user' || u2.id !== 'e79-u2') fail('round F replay order broken at the second user item')
      if ('images' in u2) fail('ticket-79: an imageless user item must keep the old payload shape (no images field)')
      console.log('SMOKE ticket-79 image projection ok (image message carries parts; imageless stays field-absent)')
      // Edit-resend navigation, non-root: navigating to the USER entry u2
      // must land the leaf on its PARENT a1 and replay [u1, a1] — Pi's
      // edit-and-resubmit semantics (the resent message then branches from
      // exactly the pre-edit point).
      step = 'F navigate parent'
      child.send({ type: 'navigate_tree', entryId: 'e79-u2' })
      return
    }
    case 'F navigate parent': {
      if (event.type !== 'history_loaded') return
      const items = event.items
      if (!Array.isArray(items) || items.length !== 2) fail(`after navigating to u2 the replay must hold [u1, a1], got ${items?.length}`)
      if (items[0]?.id !== 'e79-u1' || items[1]?.id !== 'e79-a1') fail(`wrong replay path after the u2 edit navigate: ${JSON.stringify(items.map((i) => i.id))}`)
      if (!Array.isArray(items[0].images) || items[0].images?.length !== 1) fail('the image projection must survive the edit navigation replay')
      console.log('SMOKE ticket-79 edit navigate (non-root) ok — leaf landed on the parent entry, replay truncated losslessly')
      // The tree payload must agree: leaf = a1 (the session_tree arrives
      // alongside; the NEXT navigate step drives from it).
      step = 'F navigate tree-check'
      child.send({ type: 'request_tree' })
      return
    }
    case 'F navigate tree-check': {
      if (event.type !== 'session_tree') return
      if (event.tree.leafId !== 'e79-a1') fail(`the leaf must sit on the parent a1 after the edit navigate, got ${event.tree.leafId}`)
      console.log('SMOKE ticket-79 tree leaf ok (parent landing)')
      // Root edit: navigating to the ROOT user message u1 must resetLeaf —
      // empty replay, null leaf (the SDK's documented re-edit-the-first-
      // message path).
      step = 'F navigate root'
      child.send({ type: 'navigate_tree', entryId: 'e79-u1' })
      return
    }
    case 'F navigate root': {
      if (event.type !== 'history_loaded') return
      const items = event.items
      if (!Array.isArray(items) || items.length !== 0) fail(`the root edit navigate must replay an empty path, got ${items?.length}`)
      console.log('SMOKE ticket-79 root edit navigate ok (resetLeaf, empty replay)')
      step = 'F root tree-check'
      child.send({ type: 'request_tree' })
      return
    }
    case 'F root tree-check': {
      if (event.type !== 'session_tree') return
      if (event.tree.leafId !== null) fail(`the leaf must be null after the root edit navigate, got ${event.tree.leafId}`)
      console.log('SMOKE ticket-79 tree leaf ok (null after resetLeaf)')
      step = 'F shutdown'
      child.send({ type: 'shutdown' })
      return
    }

    // ---------- Round G: ticket 89报备 — the MCP OAuth bridge contract ----------
    case 'G session_created': {
      if (event.type !== 'session_created') return
      if (!event.sessionId) fail('round G session_created missing id')
      console.log('SMOKE round G session ok (MCP OAuth bridge round)')
      step = 'G flow'
      child.send({ type: 'mcp_auth_start', serverName: 'picode-ghost-server' })
      return
    }
    case 'G flow': {
      if (event.type === 'mcp_auth_notice') {
        gNotices.push({ level: event.level, message: event.message })
        return
      }
      if (event.type !== 'mcp_auth_completed') return
      if (event.serverName !== 'picode-ghost-server') fail(`mcp_auth_completed for the wrong server: ${event.serverName}`)
      if (event.ok !== false) fail('the ghost-server flow must complete ok:false (the adapter cannot find it)')
      if (!Array.isArray(event.notices)) fail('mcp_auth_completed must carry the notices array')
      const notices = event.notices.map((n) => n.message).join(' | ')
      if (!notices.includes('picode-ghost-server') || !notices.toLowerCase().includes('not found')) {
        fail(`mcp_auth_completed must relay the adapter's own not-found error notice, got ${JSON.stringify(event.notices)}`)
      }
      if (!gNotices.some((n) => n.level === 'error')) fail('the error notice must ALSO ride mcp_auth_notice live (the settings window listens live)')
      console.log('SMOKE ticket-89 MCP OAuth bridge contract ok — start → live notices → completed(ok=false), no credentials touched')
      step = 'G shutdown'
      child.send({ type: 'shutdown' })
      return
    }
    default:
      return
  }
}

child = forkHost([cwd], onEvent)

/** Summarize the smoke's real session file through the index pipeline and
 * assert the (additive) SessionSummary contract. Runs in the 'clean exit'
 * handler, after both rounds produced settled session files. */
async function verifySessionSummaryContract() {
  const { summarizeSession } = await import('../../src/shared/sessions/parse.ts')
  const stats = statSync(sessionFile)
  const text = await readFile(sessionFile, 'utf8')
  const summary = summarizeSession(text, sessionFile, Math.round(stats.mtimeMs), stats.birthtimeMs > 0 ? Math.round(stats.birthtimeMs) : null)
  if (summary === null) fail('the real session file must summarize')
  // Pure-additive assertion: every legacy field is still present and sane.
  for (const field of ['file', 'id', 'cwd', 'title', 'startedAt', 'modifiedAt', 'createdAt', 'messageCount']) {
    if (!(field in summary)) fail(`SessionSummary lost the field '${field}' — contract additions must be additive`)
  }
  if (summary.cwd !== cwd) fail(`summary cwd should be the smoke workspace, got ${summary.cwd}`)
  if (summary.name !== SMOKE_LABEL) fail(`summary name should be the smoke rename label, got ${summary.name}`)
  if (summary.messageCount < 1) fail('the smoke session must count at least one message')
  if (!Number.isFinite(summary.modifiedAt) || summary.modifiedAt <= 0) fail('modifiedAt must be a positive epoch ms')
  // The new field: birthtime-derived, null-degrading.
  if (stats.birthtimeMs > 0) {
    if (summary.createdAt !== Math.round(stats.birthtimeMs)) {
      fail(`createdAt must be the file birthtime (${Math.round(stats.birthtimeMs)}), got ${summary.createdAt}`)
    }
    console.log(`SMOKE createdAt contract ok — birthtime-derived (${summary.createdAt})`)
  } else {
    if (summary.createdAt !== null) fail(`createdAt must degrade to null without birthtime, got ${summary.createdAt}`)
    console.log('SMOKE createdAt contract ok — platform without birthtime degrades to null')
  }
  if (typeof summary.title !== 'string' || summary.title === '') fail('title must stay a non-empty string')
  console.log('SMOKE SessionSummary contract ok — purely additive (legacy fields intact)')

  // ---- ticket 54: cwdMissing, the additive contract increment reported at
  // implementation time. With the cwd alive the summary keeps the EXACT
  // legacy shape (the field stays ABSENT, not false) — old payloads and old
  // consumers keep validating; a dead cwd (injected stat) flags
  // `cwdMissing: true`. ----
  const { withCwdMissing } = await import('../../src/shared/sessions/cwd-liveness.ts')
  const alive = withCwdMissing([summary], () => true)
  if (alive[0] !== summary) fail('cwdMissing must leave an alive-cwd summary at its EXACT old payload shape (same reference, field absent)')
  if ('cwdMissing' in alive[0]) fail('cwdMissing must stay ABSENT while the cwd exists — additive means absent, not false')
  const flagged = withCwdMissing([{ id: 'x', cwd: '/gone' }], () => false)
  if (flagged[0].cwdMissing !== true) fail('a dead cwd must flag cwdMissing: true')
  console.log('SMOKE cwdMissing contract ok — absent while alive, true when dead; old payloads (field missing) pass through unchanged')
}

/** Ticket 36: the call-trace contract against the smoke's REAL session file.
 * The builder must see the round-A/B traffic as per-call payloads: at least
 * one call, usage columns present (the SDK records them per ADR-0002), the
 * bash tool round visible as a tool-call output block whose tool-result
 * feeds the next call's input section, and the title derivation. */
async function verifySessionTraceContract() {
  const { buildTracePayload, traceStats } = await import('../../src/shared/sessions/trace.ts')
  const text = await readFile(sessionFile, 'utf8')
  const payload = buildTracePayload(text, sessionFile)
  if (payload === null) fail('the real session file must build a trace payload')
  if (payload.calls.length < 1) fail('the smoke session must record at least one model call')
  const first = payload.calls[0]
  if (!first.inputBlocks.some((b) => b.kind === 'user')) fail('the first call must carry the opening user message in its input section')
  const withUsage = payload.calls.find((c) => c.usage !== null && c.usage.input > 0)
  if (!withUsage) fail('the SDK-recorded usage must surface as the IN column on some call')
  const bashCall = payload.calls.find((c) => c.outputBlocks.some((b) => b.kind === 'tool-call' && b.toolName === 'bash'))
  if (!bashCall) fail('the smoke bash round must appear as a tool-call output block')
  const callIndex = payload.calls.indexOf(bashCall)
  const next = payload.calls[callIndex + 1]
  if (!next || !next.inputBlocks.some((b) => b.kind === 'tool-result' && b.callId === bashCall.outputBlocks.find((b) => b.kind === 'tool-call' && b.toolName === 'bash')?.callId)) {
    fail('the bash tool result must feed the NEXT call input section (ticket 36)')
  }
  if (typeof payload.title !== 'string' || payload.title === '') fail('trace title must stay a non-empty string')
  const stats = traceStats(payload)
  if (stats.calls !== payload.calls.length) fail('trace stats must agree with the payload')
  if (stats.totalTokens === null) fail('usage-bearing calls must sum into the stats total')
  console.log(`SMOKE trace contract ok — ${payload.calls.length} call(s), ${stats.totalTokens} total tok, title "${payload.title}"`)
}
