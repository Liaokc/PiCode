/**
 * Call-trace tool-surfaces visual-QA harness (ticket 37). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_TRACE=1. NOT part of `npm test` —
 * but like the context-menu harness it ASSERTS its probe results (exit 1
 * on any violation): the three frames' DOM states are measurable.
 *
 * The three human-review frames (ZCode reference .scratch/compare/
 * z-trace-{expanded,collapsed,search}.png):
 *
 *   tr1-expanded   — the tab at its default: every call entry fully
 *                    expanded (six block kinds, usage columns)
 *   tr2-collapsed  — after Collapse all: every block folded to its
 *                    one-line row (kind label + ellipsized preview)
 *   tr3-search     — search bar open, a typed query with matches, the
 *                    count reading n/m and one highlighted hit block
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with ONE
 * rich fixture session — three settled calls exercising user blocks, a
 * tool call + result pair, thinking, assistant text, and usage — written
 * directly as jsonl. The harness drives the REAL UI: right-click the
 * sidebar row, View call trace, then the header buttons.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualStore } from './visual-store'

export function traceVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_TRACE'] === '1'
}

/** Throwaway userData, exactly like the context-menu harness (the toggles'
 * nothing persists, but the run must never touch the operator's prefs).
 * Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateTraceUserData(): void {
  if (!traceVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-trace-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const SESSION_CWD = '/Users/dev/projects/api-server'
/** The search probe's needle — matches exactly three fixture blocks. */
const SEARCH_NEEDLE = 'rate limit'

/**
 * One rich fixture session: three model calls covering user text, a tool
 * call + result pair, thinking, assistant text, and usage on every call —
 * the six-kind vocabulary minus system-prompt (which Pi never persists).
 */
function writeTraceFixtureSession(dir: string): string {
  const t = new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString()
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id: 'trace-visual-1', timestamp: t, cwd: SESSION_CWD }),
    JSON.stringify({
      type: 'message',
      id: 'tv-u1',
      parentId: null,
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: 'Audit the rate limit handling in the gateway' }] }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv-a1',
      parentId: 'tv-u1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'The gateway routes everything through middleware; start from the routing table.', thinkingSignature: 'sim' },
          { type: 'toolCall', id: 'call-tv-1', name: 'bash', arguments: { command: 'rg -n "rate limit" src/gateway' } },
          { type: 'text', text: 'I will locate the rate limit handling first.' }
        ],
        usage: { input: 1_234, output: 89 },
        model: 'glm-5.3',
        stopReason: 'toolUse',
        timestamp: Date.parse(t) - 4_100
      }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv-r1',
      parentId: 'tv-a1',
      timestamp: t,
      message: {
        role: 'toolResult',
        toolCallId: 'call-tv-1',
        toolName: 'bash',
        content: [{ type: 'text', text: 'src/gateway/middleware.ts:41  if (hits > RATE_LIMIT_MAX) {\nsrc/gateway/middleware.ts:88  const window = rateLimitWindow(request)' }],
        isError: false,
        timestamp: Date.parse(t)
      }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv-u2',
      parentId: 'tv-r1',
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: 'Now summarize what the rate limit path does' }] }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv-a2',
      parentId: 'tv-u2',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Middleware checks a sliding window counter and sheds load with 429s; the retry header comes from the bucket state.', thinkingSignature: 'sim' },
          { type: 'text', text: 'The rate limit path is a sliding-window counter in middleware.ts: it counts hits per key, sheds load with 429 once the bucket empties, and attaches a Retry-After header derived from the window reset time.' }
        ],
        usage: { input: 2_468, output: 173 },
        model: 'glm-5.3',
        stopReason: 'stop',
        timestamp: Date.parse(t) - 3_900
      }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv-u3',
      parentId: 'tv-a2',
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: 'Which config keys feed the rate limit bucket?' }] }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv-a3',
      parentId: 'tv-u3',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'RATE_LIMIT_MAX (per-window ceiling), RATE_LIMIT_WINDOW_MS (bucket span), and RATE_LIMIT_BYPASS_KEYS (exempt api keys) — all read once at middleware boot.' }
        ],
        usage: { input: 1_872, output: 96 },
        model: 'glm-5.3',
        stopReason: 'stop',
        timestamp: Date.parse(t) - 4_400
      }
    })
  ]
  const file = path.join(dir, 'visual-trace-1.jsonl')
  writeFileSync(file, lines.join('\n') + '\n')
  const back = new Date(Date.now() - 2 * 60 * 60 * 1_000)
  utimesSync(file, back, back)
  return file
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
  if (!cond) throw new Error(`trace visual: ${what}`)
}

/** Evaluated in-page: click the first result of a selector scan. */
const clickByLabel = (selector: string, label: string): string =>
  `[...document.querySelectorAll('${selector}')].find((el) => el.textContent === '${label}')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`

export function startTraceVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!traceVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const sessionFile = writeTraceFixtureSession(store)

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('trace visual: no window')

      // The seeded row must reach the sidebar (index poll cadence ~2s).
      if (!(await waitFor(getWindow, `document.querySelectorAll('.sb-task').length >= 1`, 20_000))) {
        throw new Error('trace visual: the seeded session never reached the sidebar')
      }

      // Open the trace tab through the REAL context menu.
      await win.webContents
        .executeJavaScript(
          `(() => {
            const row = document.querySelector('[data-file="${sessionFile}"]')
            if (!(row instanceof Element)) return false
            const r = row.getBoundingClientRect()
            row.dispatchEvent(new MouseEvent('contextmenu', {
              bubbles: true, cancelable: true,
              clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
            }))
            return true
          })()`
        )
        .catch(() => false)
      if (!(await waitFor(getWindow, `document.querySelector('.sb-context-menu') !== null`, 5_000))) {
        throw new Error('trace visual: the context menu never opened')
      }
      await win.webContents.executeJavaScript(clickByLabel('.sb-context-item', 'View call trace'))
      if (!(await waitFor(getWindow, `document.querySelector('.side-panel .trace-view') !== null`, 5_000))) {
        throw new Error('trace visual: View call trace never opened the trace tab')
      }
      // Three calls, default fully expanded, usage columns on every entry.
      if (!(await waitFor(getWindow, `document.querySelectorAll('.trace-call').length === 3`, 5_000))) {
        throw new Error('trace visual: the three fixture calls never rendered')
      }
      const expanded = (await win.webContents.executeJavaScript(`(() => {
        const blocks = document.querySelectorAll('.trace-block').length
        const collapsed = document.querySelectorAll('.trace-block-collapsed').length
        const kinds = new Set([...document.querySelectorAll('.trace-kind')].map((el) => el.className.split('trace-kind-')[1]?.split(' ')[0])).size
        const usage = document.querySelectorAll('.trace-call-usage .trace-num').length
        return { blocks, collapsed, kinds, usage }
      })()`)) as { blocks: number; collapsed: number; kinds: number; usage: number }
      assert(expanded.blocks >= 9, `expected at least 9 blocks, saw ${expanded.blocks}`)
      assert(expanded.collapsed === 0, 'the default state must have no collapsed blocks')
      assert(expanded.kinds >= 5, `expected at least 5 distinct block kinds, saw ${expanded.kinds}`)
      assert(expanded.usage >= 3, `expected usage columns on all three calls, saw ${expanded.usage}`)
      await capture(win, 'tr1-expanded')

      // ---- collapse-all: every block folds to its one-line row ----
      await win.webContents.executeJavaScript(
        `document.querySelector('button[aria-label="Collapse all blocks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `(() => {
        const all = document.querySelectorAll('.trace-block').length
        const c = document.querySelectorAll('.trace-block-collapsed').length
        return all > 0 && all === c
      })()`, 5_000))) {
        throw new Error('trace visual: Collapse all never folded every block')
      }
      await capture(win, 'tr2-collapsed')

      // ---- search: bar open, needle typed, count + one highlighted hit ----
      await win.webContents.executeJavaScript(
        `document.querySelector('button[aria-label="Expand all blocks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      await win.webContents.executeJavaScript(
        `document.querySelector('button[aria-label="Search trace"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.trace-search-input') !== null`, 5_000))) {
        throw new Error('trace visual: the search bar never opened')
      }
      await win.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.trace-search-input')
        if (!(input instanceof HTMLInputElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, '${SEARCH_NEEDLE}')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      // The fixture contains 'rate limit' in the user-1 text, the bash args,
      // the tool result, the user-2 text, and the a2 text — advance to a
      // later match so the highlighted hit is visually mid-list.
      await win.webContents.executeJavaScript(
        `document.querySelector('button[aria-label="Next match"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `(() => {
        const count = document.querySelector('.trace-search-count')?.textContent ?? ''
        return /^\\d+\\/\\d+$/.test(count) && count !== '0/0' && document.querySelectorAll('.trace-block-active').length === 1
      })()`, 5_000))) {
        throw new Error('trace visual: the search never showed a nonzero count with one highlighted hit')
      }
      await capture(win, 'tr3-search')

      console.log('trace visual: all three frames captured')
      app.exit(0)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      app.exit(1)
    }
  })()
}
