/**
 * TUI↔SDK session-interop smoke (ticket 12 acceptance, ADR-0005). Proves
 * Handoff both ways:
 *
 *   Direction 1 — TUI → PiCode (STRICTLY READ-ONLY): the newest TUI-written
 *   session in ~/.pi/agent/sessions must (a) summarize into a sidebar row via
 *   the session index, (b) yield a transcript through the renderer's parser,
 *   and (c) open through the Pi SDK's own SessionManager — the same class the
 *   TUI uses — with a non-empty entry tree.
 *
 *   Direction 2 — PiCode → TUI: the built host (real SDK, Seam-1) creates a
 *   session in an ISOLATED session store (PICODE_SESSION_DIR, ticket 13 —
 *   the real library is never written) and runs one real model turn. The
 *   file must then (a) appear in the session index over that store, (b)
 *   re-open through the SDK with the exchange visible, (c) fold into usage
 *   with ≥1 event, and (d) RESUME through a second host process with full
 *   history (Handoff). The session file this smoke created is removed
 *   afterwards.
 *
 * Usage: npm run build && node scripts/smoke/interop-smoke.ts
 * Needs working model auth in ~/.pi/agent (same as the pi TUI). Exits
 * non-zero on the first broken expectation. Progress logs as
 * `INTEROP <step>` lines. Part of `npm run smoke`.
 */

import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdtemp, readFile, rm, readdir, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
import * as pi from '@earendil-works/pi-coding-agent'
import { SessionIndexService } from '../../src/main/sessions/index-service.ts'
import { summarizeSession } from '../../src/shared/sessions/parse.ts'
import { foldSessionFile } from '../../src/shared/usage/aggregate.ts'
import type { HostToParent } from '../../src/shared/contract.ts'

const HOST_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'out', 'main', 'host.js')
const STEP_TIMEOUT_MS = 90_000
const MARKER = 'PICODE_INTEROP_OK'

function log(step: string, detail = ''): void {
  console.log(`INTEROP ${step}${detail ? ` ${detail}` : ''}`)
}

function fail(message: string): never {
  console.error(`INTEROP FAIL ${message}`)
  process.exit(1)
}

const sessionsDir = join(homedir(), '.pi', 'agent', 'sessions')

// Session isolation (ticket 13): the real store stays strictly READ-ONLY in
// direction 1; hosts forked for direction 2 must write somewhere else. Use
// the suite-wide store when run through run-all.sh (which owns its cleanup),
// otherwise create and clean up a throwaway store of our own.
const isolatedDir = process.env.PICODE_SESSION_DIR
let isolatedSessionsDir = isolatedDir ?? ''
if (!isolatedSessionsDir) {
  isolatedSessionsDir = await mkdtemp(join(tmpdir(), 'picode-smoke-sessions-'))
  process.env.PICODE_SESSION_DIR = isolatedSessionsDir
  process.on('exit', () => rmSync(isolatedSessionsDir, { recursive: true, force: true }))
  log('isolated session store', isolatedSessionsDir)
}

function indexOver(dir: string): SessionIndexService {
  return new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
}

/** The REAL shared store — TUI-written sessions (direction 1, read-only). */
function noopIndex(): SessionIndexService {
  return indexOver(sessionsDir)
}

// ---------- direction 1: TUI → PiCode (read-only) ----------

async function tuiToPicode(): Promise<void> {
  const all = await noopIndex().list()
  if (all.length === 0) fail('the shared session store is empty — run the pi TUI once, then re-run this smoke')
  const newest = all.find((s) => s.messageCount > 0)
  if (!newest) fail(`no session with messages among ${all.length} (newest first)`)
  log('index lists TUI store', `${all.length} session(s); newest: ${newest.title.slice(0, 48)}`)

  const text = await readFile(newest.file, 'utf8')
  const summary = summarizeSession(text, newest.file, newest.modifiedAt)
  if (!summary) fail('summarizeSession returned null for a file the index lists')
  if (summary.messageCount !== newest.messageCount) {
    fail(`summarizeSession counts ${summary.messageCount} messages, index counted ${newest.messageCount}`)
  }
  if (!summary.title) fail('TUI session summary has no display title')

  // The renderer's transcript path must yield the conversation.
  const snapshot = await noopIndex().followSnapshot(newest.file)
  if (!snapshot || snapshot.items.length === 0) fail('transcript extraction returned no items for the TUI session')
  log('transcript parses', `${snapshot.items.length} item(s), first role=${snapshot.items[0].role}`)

  // The SDK's own manager (the TUI's loader) must open the same file.
  const manager = pi.SessionManager.open(newest.file)
  const entries = manager.getEntries()
  if (!Array.isArray(entries) || entries.length === 0) fail('SDK SessionManager.open sees no entries in the TUI session')
  log('SDK opens TUI session', `${entries.length} entr(y/ies), id=${manager.getSessionId()}`)
}

// ---------- direction 2: PiCode → TUI (one real turn through the host) ----------

function forkHost(args: string[]): ChildProcess {
  return fork(HOST_ENTRY, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
}

/** Wait for the next host event matching `match`, with a hard timeout. */
function waitForHost(child: ChildProcess, label: string, match: (event: HostToParent) => boolean): Promise<HostToParent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`${label} timed out after ${STEP_TIMEOUT_MS}ms`))
    }, STEP_TIMEOUT_MS)
    timer.unref?.()
    const onMessage = (event: unknown): void => {
      if (typeof event === 'object' && event !== null && typeof (event as { type?: unknown }).type === 'string') {
        const typed = event as HostToParent
        if (match(typed)) {
          cleanup()
          resolve(typed)
        }
      }
    }
    const onExit = (code: number | null): void => {
      cleanup()
      reject(new Error(`host exited early (code ${code}) while waiting for ${label}`))
    }
    function cleanup(): void {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('exit', onExit)
    }
    child.on('message', onMessage)
    child.on('exit', onExit)
  })
}

async function picodeToTui(): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'picode-interop-'))
  let live: ChildProcess | null = null

  try {
    live = forkHost([cwd])
    const created = (await waitForHost(live, 'session_created', (e) => e.type === 'session_created')) as Extract<
      HostToParent,
      { type: 'session_created' }
    >
    if (!created.sessionFile) fail('session_created did not report its session file')
    const file: string = created.sessionFile
    log('host session created', file)
    if (!file.startsWith(isolatedSessionsDir)) fail(`host wrote outside the isolated session store: ${file}`)

    live.send({ type: 'prompt', text: `Reply with exactly: ${MARKER}` })
    await waitForHost(live, 'agent_end', (e) => e.type === 'agent_end')
    log('real turn completed')

    // (a) The session index (what the sidebar shows) must list it — over the
    // ISOLATED store the host was told to write into.
    const listed = (await indexOver(isolatedSessionsDir).list()).find((s) => s.file === file)
    if (!listed) fail('the session PiCode just wrote is invisible to the session index')
    if (listed.messageCount < 2) fail(`index counts ${listed.messageCount} messages, want ≥2 (user + assistant)`)
    log('index lists PiCode session', `title="${listed.title.slice(0, 40)}"`)

    // (b) The SDK (what the TUI uses) must re-open the file with the exchange.
    const manager = pi.SessionManager.open(file)
    const raw = JSON.stringify(manager.getEntries())
    if (!raw.includes(MARKER)) fail('the PiCode-written exchange is not readable through the SDK SessionManager')
    log('SDK re-opens PiCode session', `${manager.getEntries().length} entries carry the marker`)

    // (c) Renderer transcript path sees both sides; usage folds ≥1 event.
    const snapshot = await indexOver(isolatedSessionsDir).followSnapshot(file)
    const items = snapshot?.items ?? []
    if (!items.some((i) => i.role === 'user' && i.text.includes(MARKER))) {
      fail('renderer transcript misses the user side of the exchange')
    }
    if (!items.some((i) => i.role === 'assistant' && i.text.trim().length > 0)) {
      fail('renderer transcript misses the assistant side of the exchange')
    }
    const folded = foldSessionFile(await readFile(file, 'utf8'), { timeZone: 'UTC' })
    if (folded.eventCount < 1) fail('usage fold recorded no events for the PiCode session')
    log('usage fold ok', `${folded.eventCount} event(s), ${folded.skippedLines} skipped lines`)

    // (d) Handoff: a SECOND host process resumes the file with full history.
    const resumed = forkHost([cwd, file])
    try {
      const rCreated = (await waitForHost(resumed, 'resumed session_created', (e) => e.type === 'session_created')) as Extract<
        HostToParent,
        { type: 'session_created' }
      >
      if (!rCreated.resumed) fail('the reopened session did not come up as a resume')
      const history = (await waitForHost(resumed, 'history_loaded', (e) => e.type === 'history_loaded')) as Extract<
        HostToParent,
        { type: 'history_loaded' }
      >
      if (!Array.isArray(history.items) || history.items.length < 2) {
        fail(`resumed history has ${history.items?.length} items, want ≥2`)
      }
      log('resume ok', `${history.items.length} history item(s) replayed`)
      resumed.send({ type: 'shutdown' })
      const exitCode: number = await new Promise((resolve) => resumed.on('exit', (code) => resolve(code ?? -1)))
      if (exitCode !== 0) fail(`resume host exit code ${exitCode}, want 0`)
    } finally {
      resumed.kill('SIGKILL')
    }

    // Cleanup: remove exactly the file this smoke created (and its empty dir).
    await rm(file, { force: true })
    try {
      const parent = dirname(file)
      if ((await readdir(parent)).length === 0) await rmdir(parent)
    } catch {
      // parent gone or non-empty — fine either way
    }
    log('cleaned up created session file')
  } finally {
    live?.kill('SIGKILL')
    await rm(cwd, { recursive: true, force: true })
  }
}

await tuiToPicode()
await picodeToTui()
console.log('INTEROP PASS TUI↔SDK session interop smoke complete (both directions)')
