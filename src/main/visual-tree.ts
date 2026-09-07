/**
 * History-tree visual-QA harness (ticket 43). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_TREE=1. Like the trace harness it ASSERTS its probe
 * results (exit 1 on any violation) and captures the review frame:
 *
 *   tr43-tree — the History dropdown over a branched fixture session:
 *               user:/assistant: type labels, a [bash: …] tool row, the
 *               noise entries (model_change / toolResult / label) absent,
 *               branch connectors, and exactly one "current" tag
 *
 * Reference frame: .scratch/compare/pitui13-tree (the Pi TUI /tree display
 * form this restyle aligns with — desktop chrome, TUI grammar).
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with ONE
 * branched fixture session written directly as jsonl (model_change root —
 * the noise; user → assistant+toolCall → toolResult → assistant text on the
 * leaf path, a second assistant branch off the user with its own deep
 * chain, and a label entry). The harness drives the REAL UI: click the
 * sidebar row, click History, probe the dropdown's DOM.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore } from './visual-store'

export function treeVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_TREE'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateTreeUserData(): void {
  if (!treeVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-tree-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** REAL tmpdir dir (ticket 42): the cwd-liveness filter drops sessions
 * whose cwd is not a directory on disk. */
const SESSION_CWD = (): string => ensureVisualProjectDir('tree-demo')

function writeTreeFixtureSession(dir: string): string {
  const t = new Date(Date.now() - 60 * 60 * 1_000).toISOString()
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id: 'tree-visual-43', timestamp: t, cwd: SESSION_CWD() }),
    // Noise root: the model_change every real session opens with.
    JSON.stringify({
      type: 'model_change',
      id: 'tv43-mc',
      parentId: null,
      timestamp: t,
      provider: 'bella',
      modelId: 'GLM-5.3'
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv43-u1',
      parentId: 'tv43-mc',
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: 'Audit the rate limit handling in the gateway' }] }
    }),
    JSON.stringify({
      type: 'label',
      id: 'tv43-l1',
      parentId: 'tv43-u1',
      timestamp: t,
      targetId: 'tv43-u1',
      label: 'audit start'
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv43-a1',
      parentId: 'tv43-u1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'The gateway routes through middleware; find the limiter.', thinkingSignature: 'sim' },
          { type: 'toolCall', id: 'call-tv43-1', name: 'bash', arguments: { command: 'rg -n "rate limit" src/gateway' } },
          { type: 'text', text: 'I will locate the rate limit handling first.' }
        ],
        stopReason: 'toolUse',
        timestamp: Date.parse(t)
      }
    }),
    // Noise: the toolResult echo (the tool row derives from the toolCall).
    JSON.stringify({
      type: 'message',
      id: 'tv43-r1',
      parentId: 'tv43-a1',
      timestamp: t,
      message: {
        role: 'toolResult',
        toolCallId: 'call-tv43-1',
        toolName: 'bash',
        content: [{ type: 'text', text: 'src/gateway/middleware.ts:41  if (hits > RATE_LIMIT_MAX) {' }],
        isError: false,
        timestamp: Date.parse(t)
      }
    }),
    // The second branch off the user turn (fork structure): deep enough to
    // prove off-path collapse. Written BEFORE the leaf-path tail so the
    // leaf stays a2.
    JSON.stringify({
      type: 'message',
      id: 'tv43-b1',
      parentId: 'tv43-u1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Alternative: token bucket at the edge.' }],
        stopReason: 'stop',
        timestamp: Date.parse(t)
      }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv43-b2',
      parentId: 'tv43-b1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Bucket depth: one more level visible off-path.' }],
        stopReason: 'stop',
        timestamp: Date.parse(t)
      }
    }),
    // Off-path GREAT-grandchild: past the one-level visibility policy —
    // must never render.
    JSON.stringify({
      type: 'message',
      id: 'tv43-b3',
      parentId: 'tv43-b2',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Deep probe — collapsed, must not render.' }],
        stopReason: 'stop',
        timestamp: Date.parse(t)
      }
    }),
    JSON.stringify({
      type: 'message',
      id: 'tv43-a2',
      parentId: 'tv43-r1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'The rate limit path is a sliding-window counter in middleware.ts: it counts hits per key and sheds load with 429s.' }
        ],
        stopReason: 'stop',
        timestamp: Date.parse(t)
      }
    })
  ]
  const file = path.join(dir, 'visual-tree-43.jsonl')
  writeFileSync(file, lines.join('\n') + '\n')
  const back = new Date(Date.now() - 60 * 60 * 1_000)
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
  if (!cond) throw new Error(`tree visual: ${what}`)
}

export function startTreeVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!treeVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const sessionFile = writeTreeFixtureSession(store)

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('tree visual: no window')

      // The seeded row must reach the sidebar (index poll cadence ~2s).
      const rowExpr = `document.querySelector('[data-file="${sessionFile}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('tree visual: the seeded session never reached the sidebar')
      }

      // Open the session (real click), then the History dropdown.
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.chat-topbar-btn') !== null`, 10_000))) {
        throw new Error('tree visual: the chat view never opened')
      }
      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.chat-topbar-btn')].find((el) => el.textContent?.includes('History'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.tree-panel') !== null`, 5_000))) {
        throw new Error('tree visual: the History dropdown never opened')
      }
      if (!(await waitFor(getWindow, `document.querySelectorAll('.tree-row').length > 0`, 5_000))) {
        throw new Error('tree visual: the tree rows never rendered')
      }

      // The whole display-form assertion set, evaluated in one pass.
      const probe = (await win.webContents.executeJavaScript(`(() => {
        const texts = [...document.querySelectorAll('.tree-row .tree-row-text')].map((el) => el.textContent ?? '')
        const labels = [...document.querySelectorAll('.tree-row .tree-row-type')].map((el) => el.textContent ?? '')
        return {
          rows: document.querySelectorAll('.tree-row').length,
          userLabels: labels.filter((l) => l === 'user:').length,
          assistantLabels: labels.filter((l) => l === 'assistant:').length,
          toolRows: texts.filter((t) => t.startsWith('[bash: ')).length,
          toolRowText: texts.find((t) => t.startsWith('[bash: ')) ?? '',
          noise: texts.filter((t) => t.includes('model_change') || t.includes('toolResult') || t.includes('(label)')).length,
          collapsedLeak: texts.some((t) => t.includes('must not render')),
          labelChips: [...document.querySelectorAll('.tree-row-label-chip')].map((el) => el.textContent ?? ''),
          currentTags: document.querySelectorAll('.tree-leaf-tag').length,
          connectors: document.querySelectorAll('.tree-guide-conn').length,
          rails: document.querySelectorAll('.tree-guide-on').length,
          forkBtns: document.querySelectorAll('.tree-fork-btn').length
        }
      })()`)) as {
        rows: number
        userLabels: number
        assistantLabels: number
        toolRows: number
        toolRowText: string
        noise: number
        collapsedLeak: boolean
        labelChips: string[]
        currentTags: number
        connectors: number
        rails: number
        forkBtns: number
      }

      assert(probe.rows >= 5, `expected at least 5 display rows, saw ${probe.rows}`)
      assert(probe.userLabels >= 1, 'no user: type label rendered')
      assert(probe.assistantLabels >= 3, `expected ≥3 assistant: labels, saw ${probe.assistantLabels}`)
      assert(probe.toolRows === 1, `expected exactly one [bash: …] tool row, saw ${probe.toolRows}`)
      assert(probe.toolRowText.includes('rg -n "rate limit" src/gateway'), `tool row lost its command summary: ${probe.toolRowText}`)
      assert(probe.noise === 0, `noise entries leaked into the tree (${probe.noise})`)
      assert(!probe.collapsedLeak, 'the off-path grandchild leaked past the one-level collapse')
      assert(probe.labelChips.includes('audit start'), `the label chip never rendered: ${JSON.stringify(probe.labelChips)}`)
      assert(probe.currentTags === 1, `expected exactly one current tag, saw ${probe.currentTags}`)
      // The user turn forks into two assistant branches → two connector cells.
      assert(probe.connectors >= 2, `expected ≥2 connector cells, saw ${probe.connectors}`)
      assert(probe.rails >= 1, 'no rail rendered under the non-last branch')
      assert(probe.forkBtns >= 5, 'fork buttons missing on rows')
      await capture(win, 'tr43-tree')

      console.log('tree visual: frame captured, all probes green')
      app.exit(0)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      app.exit(1)
    }
  })()
}
