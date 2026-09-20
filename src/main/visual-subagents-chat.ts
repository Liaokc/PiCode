/**
 * Subagent conversation-tab visual-QA harness (ticket 99). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_SUBAGENTS_CHAT=1. Like the directory
 * harness it ASSERTS its probe results (exit 1 on any violation). The
 * frames compare against the ZCode reference (z17-subagent-chat):
 *
 *   s99-1-chat     — the directory row click opened the task-named tab: the
 *                    child transcript (main component family) + the steer
 *                    composer (the run is live) + the head state chip
 *   s99-2-live     — after an append to the child session file: the new
 *                    entry rendered WITHOUT any re-request (the real
 *                    follow machinery: artifact → child file → push)
 *   s99-3-receipt  — a steer send landed its receipt verbatim (the honest
 *                    hostless failure — every outcome is visible)
 *   s99-4-readonly — the run settled: composer gone, the read-only note
 *   s99-5-error    — a run whose artifact is gone: the honest error state
 *   (multi-tab)    — two conversation tabs coexist; × closes one, the
 *                    other survives, and the directory still shows the
 *                    live row Running (closing a view never kills a child)
 *
 * The transcript follow is REAL: the harness seeds a child session file and
 * a status.json artifact on disk, so the tab's snapshot + live pushes ride
 * the main process's sessions service exactly as in production. The parent
 * session is a fixture announcement (contract events, the ticket-90
 * harness precedent) — no host, no model calls.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir, emitContractEvent as emit } from './visual'

export function subagentChatVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_SUBAGENTS_CHAT'] === '1'
}

/** Throwaway userData (nothing persists, but the run must never touch the
 * operator's prefs). Called from index.ts at module scope. */
export function isolateSubagentChatUserData(): void {
  if (!subagentChatVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-subchat-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const SESSION_ID = 'visual-subchat'
const LIVE_RUN = 'sub99-run-1'
const LOST_RUN = 'sub99-run-2'
const LIVE_CALL = 's99-call-live'
const LOST_CALL = 's99-call-lost'
const LIVE_TASK = 'Map the gateway routing table and list every middleware hop'
const LOST_TASK = 'Audit the error budgets of the lost run'

/** The child session file: a REAL Pi session jsonl (the fixture the follow
 * machinery parses through the same path as every session surface). */
function childSessionText(cwd: string): string {
  const stamp = new Date().toISOString()
  return [
    JSON.stringify({ type: 'session', version: 3, id: 'sub99-child-1', timestamp: stamp, cwd }),
    JSON.stringify({
      type: 'message', id: 'c1', parentId: null, timestamp: stamp,
      message: { role: 'user', content: [{ type: 'text', text: 'PICODE_SUB99 child task — map the routing' }] }
    }),
    JSON.stringify({
      type: 'message', id: 'c2', parentId: 'c1', timestamp: stamp,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Scouting the gateway: found 4 middleware hops so far.' }] }
    })
  ].join('\n') + '\n'
}

function parentItems(asyncDirLive: string): Array<Record<string, unknown>> {
  const stamp = new Date().toISOString()
  return [
    { role: 'user', id: 's99-u1', text: 'PICODE_SUB99 fan out the work', timestamp: stamp, skillName: null },
    {
      role: 'assistant', id: 's99-a1', timestamp: stamp, text: '', parts: []
    },
    {
      role: 'tool', id: LIVE_CALL, timestamp: stamp, name: 'subagent',
      args: { agent: 'scout', task: LIVE_TASK, async: true },
      output: `Async: scout [${LIVE_RUN}]`,
      isError: false,
      subagent: { mode: 'single', runId: LIVE_RUN, asyncId: LIVE_RUN, asyncDir: asyncDirLive }
    },
    {
      role: 'assistant', id: 's99-a2', timestamp: stamp, text: '', parts: []
    },
    {
      role: 'tool', id: LOST_CALL, timestamp: stamp, name: 'subagent',
      args: { agent: 'auditor', task: LOST_TASK, async: true },
      output: `Async: auditor [${LOST_RUN}]`,
      isError: false,
      subagent: { mode: 'single', runId: LOST_RUN, asyncId: LOST_RUN, asyncDir: path.join(tmpdir(), 'picode-sub99-gone', LOST_RUN) }
    }
  ]
}

async function waitFor(getWindow: () => BrowserWindow | null, probe: string, budgetMs: number): Promise<boolean> {
  const win = getWindow()
  if (!win) return false
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  // Let the compositor settle — a waitFor that succeeds milliseconds after
  // a mutation can otherwise capture the pre-mutation frame.
  await sleep(500)
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`subagent-chat visual: ${what}`)
}

export function startSubagentChatVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!subagentChatVisualEnabled()) return

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('subagent-chat visual: no window')
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)

      if (!(await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 20_000))) {
        throw new Error('subagent-chat visual: the chat subscription never attached')
      }

      // ---- the REAL follow fixtures: child session file + status.json ----
      const runsRoot = path.join(tmpdir(), `picode-visual-subchat-${process.pid}`, 'async-subagent-runs')
      const liveRunDir = path.join(runsRoot, LIVE_RUN)
      mkdirSync(liveRunDir, { recursive: true })
      const childFile = path.join(path.dirname(runsRoot), 'sub99-child.jsonl')
      writeFileSync(childFile, childSessionText(path.dirname(runsRoot)))
      writeFileSync(
        path.join(liveRunDir, 'status.json'),
        JSON.stringify({ lifecycleArtifactVersion: 1, runId: LIVE_RUN, mode: 'single', state: 'running', startedAt: Date.now() - 60_000, lastUpdate: Date.now(), sessionFile: childFile, agents: ['scout'] })
      )

      // ---- the parent session fixture + the Subagents tab ----
      emit({ type: 'session_event', sessionId: SESSION_ID, event: { type: 'session_created', sessionId: SESSION_ID, cwd: path.dirname(runsRoot), model: 'claude-opus-4-5', resumed: true } })
      emit({ type: 'session_event', sessionId: SESSION_ID, event: { type: 'history_loaded', items: parentItems(liveRunDir) as never } })
      emit({
        type: 'session_event',
        sessionId: SESSION_ID,
        event: {
          type: 'subagent_status',
          requestId: 'visual-99-1',
          available: true,
          runs: [{ runId: LIVE_RUN, state: 'running', startedAt: Date.now() - 60_000, currentTool: 'grep' }],
          fleet: { entries: [], totalActive: 1, omitted: 0 }
        }
      })

      // Open the Subagents tab through the picker.
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true })); true`)
      if (!(await waitFor(getWindow, `document.querySelector('.panel-tab-card[aria-label="Open Subagents tab"]') !== null`, 8_000))) {
        throw new Error('subagent-chat visual: the picker never offered the Subagents card')
      }
      await js(`document.querySelector('.panel-tab-card[aria-label="Open Subagents tab"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitFor(getWindow, `document.querySelector('[data-testid="subagents-tab"]') !== null`, 8_000))) {
        throw new Error('subagent-chat visual: the Subagents tab never rendered')
      }

      // ---- s99-1: click the live row → the task-named conversation tab ----
      await js(`document.querySelector('[data-subagent-row="${LIVE_CALL}"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitFor(getWindow, `(() => {
        const tab = [...document.querySelectorAll('.panel-tab .panel-tab-label span')].some((s) => s.textContent === ${JSON.stringify(LIVE_TASK)})
        return tab && document.querySelector('[data-testid="subagent-chat-tab"]') !== null
      })()`, 8_000))) {
        throw new Error('subagent-chat visual: the row click never opened the task-named conversation tab')
      }
      if (!(await waitFor(getWindow, `(() => {
        const view = document.querySelector('[data-testid="subagent-chat-tab"]')
        return view !== null && view.textContent.includes('Scouting the gateway') && view.querySelector('.subchat-composer') !== null
      })()`, 8_000))) {
        throw new Error('subagent-chat visual: the child transcript or the live composer never rendered')
      }
      const runningHead = (await js(`(() => ({
        state: document.querySelector('.subchat-head-state')?.textContent ?? '',
        turns: document.querySelectorAll('[data-testid="subagent-chat-tab"] .chat-thread > div').length,
        // The user bubble must hug the thread's RIGHT edge (the main
        // transcript's msg-user-block alignment) — a regression here means
        // the wrapper was lost and the input hugs the left again.
        bubble: (() => {
          const b = document.querySelector('[data-testid="subagent-chat-tab"] .msg-user-block .msg-user')
          const t = document.querySelector('[data-testid="subagent-chat-tab"] .chat-thread')
          if (b === null || t === null) return null
          const bb = b.getBoundingClientRect()
          const tb = t.getBoundingClientRect()
          return { rightGap: Math.round(tb.right - bb.right), leftGap: Math.round(bb.left - tb.left) }
        })()
      }))()`)) as { state: string; turns: number; bubble: { rightGap: number; leftGap: number } | null }
      assert(runningHead.state === 'running', `the head chip must read running, saw ${runningHead.state}`)
      // The child fixture is one turn (user + assistant) — the same
      // groupTurns projection the main transcript renders.
      assert(runningHead.turns >= 1, `the child transcript must hold the fixture turn, saw ${runningHead.turns}`)
      assert(
        runningHead.bubble !== null && runningHead.bubble.rightGap <= 2 && runningHead.bubble.rightGap < runningHead.bubble.leftGap,
        `the user bubble must right-align in the conversation tab, got ${JSON.stringify(runningHead.bubble)}`
      )
      await capture(win, 's99-1-chat')

      // ---- s99-2: the child file grows → the live entry lands (real tail) ----
      appendFileSync(
        childFile,
        JSON.stringify({
          type: 'message', id: 'c3', parentId: 'c2', timestamp: new Date().toISOString(),
          message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_SUB99 live tail: hop 5 discovered.' }] }
        }) + '\n'
      )
      if (!(await waitFor(getWindow, `document.querySelector('[data-testid="subagent-chat-tab"]')?.textContent.includes('hop 5 discovered') === true`, 10_000))) {
        throw new Error('subagent-chat visual: the child file growth never landed as a live transcript update')
      }
      await capture(win, 's99-2-live')

      // ---- s99-3: steer send → the receipt lands verbatim (hostless failure
      // here; the fold's delivered/queued paths are Seam-1 unit-tested) ----
      await js(`(() => {
        const input = document.querySelector('.subchat-composer-input')
        if (input instanceof HTMLTextAreaElement) {
          // React controlled input: the native value setter + a bubbling
          // input event is the only assignment the synthetic tracker sees.
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(input, 'PICODE_SUB99 also check the auth bypass keys')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        return true
      })()`)
      await js(`document.querySelector('.subchat-composer-send')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitFor(getWindow, `(() => {
        const r = document.querySelector('[data-subchat-receipt]')
        return r !== null && r.textContent.includes('Steer failed')
      })()`, 10_000))) {
        throw new Error('subagent-chat visual: the steer send never landed its receipt row')
      }
      const composerCleared = (await js(`document.querySelector('.subchat-composer-input')?.value === '' || document.querySelector('.subchat-composer-input') === null`)) as boolean
      assert(composerCleared, 'the steer send must empty the composer (the main composer rule)')
      await capture(win, 's99-3-receipt')

      // ---- multi-tab + the × rule (while the run is still LIVE): open the
      // lost run's error tab, then close it — the live conversation tab
      // survives and the live row still reads Running (the × closes a VIEW,
      // never the child). ----
      await js(`(() => {
        const tab = [...document.querySelectorAll('.panel-tab-label')].find((el) => el.textContent?.includes('Subagents'))
        if (tab instanceof HTMLElement) tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      if (!(await waitFor(getWindow, `document.querySelector('[data-subagent-row="${LOST_CALL}"]') !== null`, 8_000))) {
        throw new Error('subagent-chat visual: the lost row never rendered in the directory')
      }
      await js(`document.querySelector('[data-subagent-row="${LOST_CALL}"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitFor(getWindow, `(() => {
        const views = [...document.querySelectorAll('[data-testid="subagent-chat-tab"]')]
        return views.length === 2 && views.some((v) => v.querySelector('.review-empty') !== null)
      })()`, 8_000))) {
        throw new Error('subagent-chat visual: the lost run never opened its honest error state')
      }
      const tabCount = (await js(`document.querySelectorAll('.panel-tab').length`)) as number
      assert(tabCount >= 3, `expected the directory + two conversation tabs, saw ${tabCount}`)
      await capture(win, 's99-5-error')
      // Close the error tab (its × is the tab strip's close button).
      await js(`(() => {
        const views = [...document.querySelectorAll('.panel-tab-body')]
        const errorView = views.find((v) => v.querySelector('.review-empty') !== null)
        const body = errorView?.closest('.panel-tab-body')
        const index = body !== null && body !== undefined ? [...document.querySelectorAll('.panel-tab-body')].indexOf(body) : -1
        const close = index >= 0 ? document.querySelectorAll('.panel-tab .panel-tab-close')[index] : null
        if (close instanceof HTMLElement) close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      if (!(await waitFor(getWindow, `document.querySelectorAll('[data-testid="subagent-chat-tab"]').length === 1`, 8_000))) {
        throw new Error('subagent-chat visual: closing the error tab never left the live conversation tab intact')
      }
      const stillRunning = (await js(`(() => {
        const body = [...document.querySelectorAll('.panel-tab-body')].find((v) => v.querySelector('[data-testid="subagents-tab"]') !== null)
        const row = body?.querySelector('[data-subagent-row="${LIVE_CALL}"] .subagents-badge')
        return row?.textContent ?? ''
      })()`)) as string
      assert(stillRunning === 'Running', `the live row must still read Running after closing a chat tab, saw ${stillRunning}`)

      // ---- s99-4: the run settles → read-only, no composer ----
      writeFileSync(
        path.join(liveRunDir, 'status.json'),
        JSON.stringify({ lifecycleArtifactVersion: 1, runId: LIVE_RUN, mode: 'single', state: 'complete', startedAt: Date.now() - 60_000, endedAt: Date.now() - 5_000, lastUpdate: Date.now(), sessionFile: childFile, agents: ['scout'] })
      )
      emit({
        type: 'session_event',
        sessionId: SESSION_ID,
        event: {
          type: 'subagent_async_completed',
          runId: LIVE_RUN,
          state: 'complete',
          success: true,
          summary: 'Scout mapped 5 middleware hops and the routing table.'
        }
      })
      if (!(await waitFor(getWindow, `(() => {
        const view = document.querySelector('[data-testid="subagent-chat-tab"]')
        return view !== null && view.querySelector('.subchat-composer') === null && view.querySelector('[data-subchat-readonly]') !== null
      })()`, 10_000))) {
        throw new Error('subagent-chat visual: the settled run never flipped the tab to read-only')
      }
      await capture(win, 's99-4-readonly')

      console.log('subagent-chat visual: all frames captured')
      app.exit(0)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      app.exit(1)
    }
  })()
}
