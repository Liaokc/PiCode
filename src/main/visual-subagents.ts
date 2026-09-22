/**
 * Subagent directory visual-QA harness (ticket 90). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_SUBAGENTS=1. Like the trace harness it
 * ASSERTS its probe results (exit 1 on any violation). The frames compare
 * against the ZCode references (z17-subagent-dir):
 *
 *   s9-1-directory — the Subagents tab at its ZCode composition: the
 *                    Running section (one live Running row: badge + title +
 *                    relative time + current tool preview) and the Ended
 *                    section (Completed / Failed / Blocked / Cancelled
 *                    badges, one-line result previews, relative times, and
 *                    the "Show 20 more" control)
 *   s9-3-expanded  — after Show 20 more: every ended row visible, the
 *                    control gone
 *   s9-2-settled   — after the completion event: the live row's badge
 *                    flipped to Completed with the summary preview
 *   s9-4-empty     — a session with no subagent runs: the "No running
 *                    subagents" empty state
 *
 * The frames inject CONTRACT events directly (the ticket-14 replay
 * precedent in visual.ts): the fixture session's transcript carries
 * pi-subagents-shaped tool items, and the subagent_status snapshots /
 * lifecycle events replay exactly what the real bridge forwards. The base
 * harness (PICODE_VISUAL=1) owns the session store and the sidebar — this
 * harness must not seed either.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir, emitContractEvent as emit } from './visual'
import { ensureVisualProjectDir } from './visual-store'

export function subagentsVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_SUBAGENTS'] === '1'
}

/** Throwaway userData (nothing persists, but the run must never touch the
 * operator's prefs). Called from index.ts at module scope. */
export function isolateSubagentsUserData(): void {
  if (!subagentsVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-subagents-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** REAL tmpdir dir: the announcement's cwd only feeds the display. */
const SESSION_CWD = (): string => ensureVisualProjectDir('parallel-reviews')

const LIVE_RUN_ID = 'sub90-live-1'
const ENDED_ROWS = 24

/** The row's transcript timestamp: recent enough for honest relative times,
 * spread so the Ended order is deterministic. */
const stamp = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * 60 * 1_000).toISOString()

/**
 * The fixture transcript: one async launch receipt (live augmentation says
 * running), a parallel foreground fan-out (two completed children), the
 * badge vocabulary (failed / interrupted / stopped), and enough plain
 * completed calls to page past the 20-row Ended page.
 */
function buildFixtureItems(): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [
    { role: 'user', id: 's90-u1', text: 'Run the review fleet over the gateway module', timestamp: stamp(30), skillName: null }
  ]
  const pushCall = (callId: string, args: Record<string, unknown>, output: string, details: Record<string, unknown>, isError = false, minutesAgo = 28): void => {
    items.push(
      {
        role: 'assistant', id: `${callId}-a`, timestamp: stamp(minutesAgo), text: '',
        parts: []
      },
      {
        role: 'tool', id: callId, timestamp: stamp(minutesAgo), name: 'subagent',
        args, output, isError,
        subagent: {
          ...(typeof details['mode'] === 'string' ? { mode: details['mode'] } : {}),
          ...(typeof details['runId'] === 'string' ? { runId: details['runId'] } : {}),
          ...(typeof details['asyncId'] === 'string' ? { asyncId: details['asyncId'] } : {}),
          ...(typeof details['asyncDir'] === 'string' ? { asyncDir: details['asyncDir'] } : {}),
          ...(Array.isArray(details['results']) && details['results'].length > 0 ? { children: details['results'] } : {})
        }
      }
    )
  }

  // The async launch — live augmentation says running.
  pushCall(
    'call-live',
    { agent: 'scout', task: 'Map the gateway routing table and list every middleware hop', async: true },
    `Async: scout [${LIVE_RUN_ID}]`,
    { mode: 'single', runId: LIVE_RUN_ID, asyncId: LIVE_RUN_ID, results: [] },
    false,
    12
  )

  // A parallel foreground fan-out (two completed children).
  pushCall(
    'call-par',
    { tasks: [{ agent: 'reviewer', task: 'Review the rate limiter for off-by-one windows' }, { agent: 'reviewer', task: 'Review the auth bypass keys' }] },
    'Both reviews found no regressions.',
    {
      mode: 'parallel', runId: 'sub90-par',
      results: [
        { index: 0, agent: 'reviewer', exitCode: 0, finalOutput: 'No off-by-one in the window math; tests cover the boundaries.' },
        { index: 1, agent: 'reviewer', exitCode: 0, finalOutput: 'Bypass keys are correctly scoped to the staging provider.' }
      ]
    }
  )

  // The badge vocabulary: a failed call, an interrupted (Blocked) call, a
  // stopped (Cancelled) call.
  pushCall(
    'call-fail',
    { agent: 'auditor', task: 'Audit the gateway error budgets' },
    'budgets.json missing',
    { mode: 'single', runId: 'sub90-fail', results: [{ index: 0, agent: 'auditor', exitCode: 1, error: 'budgets.json missing' }] },
    true,
    8
  )
  pushCall(
    'call-block',
    { agent: 'planner', task: 'Plan the middleware extraction' },
    'Run paused after interrupt (planner). Waiting for explicit next action.',
    { mode: 'single', runId: 'sub90-block', results: [{ index: 0, agent: 'planner', exitCode: 0, interrupted: true }] },
    false,
    7
  )
  pushCall(
    'call-stop',
    { agent: 'worker', task: 'Refactor the gateway response types' },
    'stopped',
    { mode: 'single', runId: 'sub90-stop', results: [{ index: 0, agent: 'worker', exitCode: 0, stopped: true }] },
    false,
    6
  )

  // Plain completed calls to push the Ended section past the 20-row page.
  for (let i = 0; i < ENDED_ROWS - 5; i++) {
    pushCall(
      `call-ok-${i}`,
      { agent: 'worker', task: `PICODE_SUB90 task ${i} — sweep the gateway handlers batch ${i}` },
      `Batch ${i} clean.`,
      { mode: 'single', runId: `sub90-ok-${i}`, results: [{ index: 0, agent: 'worker', exitCode: 0, finalOutput: `Batch ${i} clean: 4 handlers reviewed.` }] },
      false,
      45 - i
    )
  }
  return items
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
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`subagents visual: ${what}`)
}

export function startSubagentsVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!subagentsVisualEnabled()) return

  // The frames inject the CONTRACT events directly (the visual.ts replay
  // precedent): session_created + history_loaded with the fixture's
  // pi-subagents-shaped tool items, then the subagent_status snapshots the
  // bridge would answer with — the runs array carries the live states read
  // from the fixture's status.json artifacts. No session store, no sidebar
  // row, no host: the base harness (PICODE_VISUAL=1) owns those surfaces and
  // must not see this harness's fixtures.
  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('subagents visual: no window')

      // The base harness drives the same window; wait for its chat
      // subscription marker before injecting anything.
      if (!(await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 20_000))) {
        throw new Error('subagents visual: the chat subscription never attached')
      }

      const emitSession = (sessionId: string, items: unknown[]): void => {
        // The WRAPPED shapes: the registry routes the subagent_status
        // snapshot ONLY through the wrapped form (the legacy unwrapped path
        // folds into the chat reducer, which ignores it).
        emit({ type: 'session_event', sessionId, event: { type: 'session_created', sessionId, cwd: SESSION_CWD(), model: 'claude-opus-4-5', resumed: true } })
        emit({ type: 'session_event', sessionId, event: { type: 'history_loaded', items: items as never } })
      }

      // ---- s9-1: the directory at its ZCode composition ----
      emitSession('visual-sub90', buildFixtureItems())
      // The bridge snapshot: the async run live (status.json state running),
      // the foreground runIds resolved by the forwarded completion events.
      emit({
        type: 'session_event',
        sessionId: 'visual-sub90',
        event: {
          type: 'subagent_status',
          requestId: 'visual-90-1',
          available: true,
          runs: [
            { runId: LIVE_RUN_ID, state: 'running', startedAt: Date.now() - 12 * 60 * 1_000, currentTool: 'grep', nestedCount: 2 }
          ],
          fleet: { entries: [], totalActive: 1, omitted: 0 }
        }
      })
      // Ticket 136: open the subagents sidebar through its always-present
      // titlebar entry (the side panel's picker no longer offers a
      // Subagents card); the opening leg lands on the fixed directory tab.
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-testid="subagent-panel-toggle"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.subagent-panel:not([data-closed])') !== null && document.querySelector('.subagents-view') !== null`, 8_000))) {
        throw new Error('subagents visual: the subagents sidebar never opened onto its directory tab')
      }
      if (!(await waitFor(getWindow, `document.querySelector('[data-subagent-row="call-live"] .subagents-badge-running') !== null`, 8_000))) {
        const diag = (await win.webContents.executeJavaScript(`(() => ({
          tab: document.querySelector('.subagents-view') !== null,
          rows: [...document.querySelectorAll('.subagents-row')].slice(0, 4).map((r) => ({
            id: r.getAttribute('data-subagent-row'),
            badge: r.querySelector('.subagents-badge')?.textContent ?? null
          })),
          rowIds: document.querySelectorAll('.subagents-row').length
        }))()`))
        throw new Error(`subagents visual: the live run never showed its Running badge ${JSON.stringify(diag)}`)
      }
      const running = (await win.webContents.executeJavaScript(`(() => ({
        rows: document.querySelectorAll('.subagents-section[aria-label="Running"] .subagents-row').length,
        ids: [...document.querySelectorAll('.subagents-section[aria-label="Running"] .subagents-row')].map((r) => r.getAttribute('data-subagent-row')),
        badge: document.querySelector('[data-subagent-row="call-live"] .subagents-badge')?.textContent ?? '',
        tool: document.querySelector('[data-subagent-row="call-live"] .subagents-row-preview')?.textContent ?? ''
      }))()`)) as { rows: number; ids: string[]; badge: string; tool: string }
      // Two ACTIVE rows: the artifact-driven Running run AND the paused
      // foreground call (Blocked is live work, not Ended — the badge sits in
      // the active section until it settles).
      assert(running.rows === 2, `expected 2 active rows (saw ${running.rows}: ${JSON.stringify(running.ids)})`)
      assert(running.ids.includes('call-block'), `the paused call must sit in the active section: ${JSON.stringify(running.ids)}`)
      assert(running.badge === 'Running', `the live badge must read Running, saw ${running.badge}`)
      assert(running.tool === 'grep', `the running row should preview the current tool, saw ${running.tool}`)
      const nested = (await win.webContents.executeJavaScript(
        `document.querySelector('[data-subagent-row="call-live"] .subagents-row-nested')?.textContent ?? ''`
      )) as string
      assert(nested === '+2 nested', `the live run should fold its nested count, saw ${nested}`)

      const ended = (await win.webContents.executeJavaScript(`(() => ({
        shown: document.querySelectorAll('.subagents-section[aria-label="Ended"] .subagents-row').length,
        head: document.querySelector('.subagents-section[aria-label="Ended"] .subagents-section-count')?.textContent ?? '',
        completed: document.querySelectorAll('.subagents-badge-completed').length,
        failed: document.querySelectorAll('.subagents-badge-failed').length,
        blocked: document.querySelectorAll('.subagents-badge-blocked').length,
        cancelled: document.querySelectorAll('.subagents-badge-cancelled').length,
        lost: document.querySelectorAll('.subagents-badge-lost').length,
        showMore: document.querySelector('.subagents-show-more') !== null,
        preview: document.querySelector('[data-subagent-row="call-par"] .subagents-row-preview')?.textContent ?? '',
        fanout: document.querySelector('[data-subagent-row="call-par"] .subagents-row-fanout')?.textContent ?? ''
      }))()`)) as {
        shown: number; head: string; completed: number; failed: number; blocked: number
        cancelled: number; lost: number; showMore: boolean; preview: string; fanout: string
      }
      assert(ended.shown === 20, `expected 20 visible ended rows, saw ${ended.shown}`)
      assert(ended.head === '· 22', `the Ended head must count all rows (· 22), saw ${ended.head}`)
      assert(ended.completed === 18, `expected the completed badges (18), saw ${ended.completed}`)
      assert(ended.failed === 1, `expected exactly 1 Failed badge, saw ${ended.failed}`)
      assert(ended.blocked === 1, `expected exactly 1 Blocked badge, saw ${ended.blocked}`)
      assert(ended.cancelled === 1, `expected exactly 1 Cancelled badge, saw ${ended.cancelled}`)
      assert(ended.lost === 0, `no Lost badge while the artifact drives Running, saw ${ended.lost}`)
      assert(ended.showMore, 'the Show 20 more control must be visible with hidden rows')
      assert(ended.preview.startsWith('No off-by-one'), `the parallel row should preview its first child output, saw ${ended.preview}`)
      assert(ended.fanout === '2 children', `the parallel row should carry its fan-out count, saw ${ended.fanout}`)
      await capture(win, 's9-1-directory')

      // ---- s9-3-expanded: Show 20 more reveals everything ----
      await win.webContents.executeJavaScript(
        `document.querySelector('.subagents-show-more')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `(() => {
        const shown = document.querySelectorAll('.subagents-section[aria-label="Ended"] .subagents-row').length
        return shown === 22 && document.querySelector('.subagents-show-more') === null
      })()`, 8_000))) {
        throw new Error('subagents visual: Show 20 more never revealed every ended row')
      }
      await capture(win, 's9-3-expanded')

      // ---- the artifact settles: Completed badge, row back in Ended ----
      emit({
        type: 'session_event',
        sessionId: 'visual-sub90',
        event: {
          type: 'subagent_async_completed',
          runId: LIVE_RUN_ID,
          state: 'complete',
          success: true,
          summary: 'Scout mapped 4 middleware hops and the routing table.'
        }
      })
      if (!(await waitFor(getWindow, `document.querySelector('[data-subagent-row="call-live"] .subagents-badge-completed') !== null`, 8_000))) {
        throw new Error('subagents visual: the completion event never flipped the badge to Completed')
      }
      const settledPreview = (await win.webContents.executeJavaScript(
        `document.querySelector('[data-subagent-row="call-live"] .subagents-row-preview')?.textContent ?? ''`
      )) as string
      assert(settledPreview.startsWith('Scout mapped'), `the settled row should preview the completion summary, saw ${settledPreview}`)
      await capture(win, 's9-2-settled')

      // ---- s9-4-empty: the empty state on a fresh session ----
      emit({ type: 'session_event', sessionId: 'visual-sub90-empty', event: { type: 'session_created', sessionId: 'visual-sub90-empty', cwd: SESSION_CWD(), model: 'claude-opus-4-5', resumed: true } })
      emit({ type: 'session_event', sessionId: 'visual-sub90-empty', event: { type: 'history_loaded', items: [] } })
      if (!(await waitFor(getWindow, `(() => {
        const empty = document.querySelector('.subagents-empty')
        const rows = document.querySelectorAll('.subagents-row').length
        return empty !== null && empty.textContent === 'No running subagents' && rows === 0
      })()`, 8_000))) {
        throw new Error('subagents visual: the empty state never rendered for the fresh session')
      }
      await capture(win, 's9-4-empty')

      console.log('subagents visual: all frames captured')
      app.exit(0)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      app.exit(1)
    }
  })()
}
