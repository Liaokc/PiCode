/**
 * Context-ring visual-QA harness (ticket 77). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_CONTEXT_RING=1. Like the expand harness it ASSERTS its
 * probe results (exit 1 on any violation) and captures the review frames
 * (对照 .scratch/compare/pi16-context-ring*.png):
 *
 *   cr1-ring-idle  — the grey idle ring: the resumed user-only session has
 *                    no assistant usage anywhere in the path (无 usage 灰环),
 *                    the track renders, no arc, and hovering opens NOTHING
 *   cr2-ring-usage — the ready ring: the resumed session whose file carries
 *                    a seeded 66,000-token usage renders the arc (the
 *                    history_loaded replay path) over the REAL model window
 *   cr3-ring-hover — the data popover open on hover: percent + used/limit
 *                    header, the accent-blue bar, the IN/OUT/cacheRead/
 *                    cacheWrite quadruple, the cache hit rate behind the
 *                    divider (NOT the Tooltip component — 数据揭示)
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with two
 * fresh hand-written sessions (the writeVisualSession shape — proven
 * openable by the resume chain) in one fresh project dir, backdated so both
 * take the quiet resume branch. Throwaway userData keeps the default view.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore } from './visual-store'

/** Exclusive gate of the context-ring harness — every other visual harness
 * stands down when it is set. */
export function contextRingVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_CONTEXT_RING'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateContextRingUserData(): void {
  if (!contextRingVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-context-ring-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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

async function capture(win: BrowserWindow, name: string, state: string): Promise<void> {
  const { writeFileSync: write } = await import('node:fs')
  const png = await win.webContents.capturePage()
  write(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png state=${state}`)
}

/** One fresh session jsonl: header + one user turn, optionally one assistant
 * turn carrying the seeded ring usage (the smoke stage's exact shape). */
function seedRingSession(dir: string, name: string, cwd: string, userText: string, withUsage: boolean): string {
  const stamp = new Date().toISOString()
  const user = {
    type: 'message',
    id: `${name}-u1`,
    parentId: null,
    timestamp: stamp,
    message: { role: 'user', content: [{ type: 'text', text: userText }] }
  }
  const lines: string[] = [
    JSON.stringify({ type: 'session', version: 3, id: randomUUID(), timestamp: stamp, cwd }),
    JSON.stringify(user)
  ]
  if (withUsage) {
    lines.push(
      JSON.stringify({
        type: 'message',
        id: `${name}-a1`,
        parentId: user.id,
        timestamp: stamp,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Seeded ring usage: 66,000 tokens of context.' }],
          stopReason: 'stop',
          usage: { input: 40_000, output: 2_000, cacheRead: 24_000, cacheWrite: 0, totalTokens: 66_000 }
        }
      })
    )
  }
  const file = path.join(dir, `visual-${name}.jsonl`)
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

export function startContextRingVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!contextRingVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const project = ensureVisualProjectDir('context-ring-demo')
  const quietFile = seedRingSession(store, 'ring77-idle', project, 'Draft the migration plan for the billing service', false)
  const usageFile = seedRingSession(store, 'ring77-usage', project, 'Audit the token budget for the billing service', true)
  // Backdate: a fresh mtime would take the Live Follow path (no composer).
  const then = new Date(Date.now() - 60 * 60 * 1_000)
  for (const file of [quietFile, usageFile]) utimesSync(file, then, then)

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('context-ring visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const openSession = async (row: string, marker: string): Promise<void> => {
        const rowExpr = `document.querySelector('[data-file="${row}"]')`
        if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
          throw new Error(`context-ring visual: the ${marker} session never reached the sidebar`)
        }
        await js(`${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        if (
          !(await waitFor(
            getWindow,
            `document.querySelector('.empty-state') === null &&
             [...document.querySelectorAll('.main-zone .msg-user')].some((n) => (n.textContent ?? '').includes(${JSON.stringify(marker)}))`,
            15_000
          ))
        ) {
          throw new Error(`context-ring visual: the ${marker} session never took over the main zone`)
        }
      }
      const hoverRing = async (): Promise<void> => {
        await js(
          `document.querySelector('.chat-dock .ctx-ring')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); true`
        )
      }
      const leaveRing = async (): Promise<void> => {
        await js(
          `document.querySelector('.chat-dock .ctx-ring')?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); true`
        )
      }

      // ---- cr1: the grey idle ring (no usage in the path, no hover) ----
      await openSession(quietFile, 'Draft the migration plan')
      if (!(await waitFor(getWindow, `document.querySelector(".chat-dock .ctx-ring[data-ring-mode='idle']") !== null`, 10_000))) {
        const diag = (await js(
          `JSON.stringify({
            ring: document.querySelector('.ctx-ring') !== null,
            mode: document.querySelector('.ctx-ring')?.dataset['ringMode'] ?? null,
            wrap: document.querySelector('.ctx-ring-wrap')?.outerHTML?.slice(0, 240) ?? null,
            footer: document.querySelector('.chat-dock .composer-footer')?.outerHTML?.slice(0, 400) ?? null
          })`,
        ).catch(() => 'unavailable')) as string
        throw new Error(`context-ring visual: the user-only session never showed the grey idle ring; DOM: ${diag}`)
      }
      if (!((await js(`document.querySelector('.chat-dock .ctx-ring .ctx-ring-arc') === null`)) as boolean)) {
        throw new Error('context-ring visual: the idle ring must render the track only')
      }
      await hoverRing()
      await sleep(600)
      if (!((await js(`document.querySelector('.ctx-ring-pop') === null`)) as boolean)) {
        throw new Error('context-ring visual: the idle ring must grant NO hover popover')
      }
      await capture(win, 'cr1-ring-idle', 'grey idle ring: track only, no arc, no hover')
      await leaveRing()

      // ---- cr2 + cr3: the ready ring from the replay path + its popover ----
      await openSession(usageFile, 'Audit the token budget')
      if (
        !(await waitFor(
          getWindow,
          `document.querySelector(".chat-dock .ctx-ring[data-ring-mode='ready']") !== null &&
           Number(document.querySelector(".chat-dock .ctx-ring[data-ring-mode='ready']")?.dataset['ringFraction'] ?? '0') > 0`,
          10_000
        ))
      ) {
        throw new Error('context-ring visual: the seeded usage never rendered the ready ring')
      }
      await capture(win, 'cr2-ring-usage', 'ready ring: the 66k seeded usage over the real model window')
      await hoverRing()
      if (!(await waitFor(getWindow, `document.querySelector('.ctx-ring-pop-open') !== null`, 5_000))) {
        throw new Error('context-ring visual: the ready ring never opened the data popover')
      }
      await sleep(300) // let the fade-in transition finish for the capture
      const popover = (await js(
        `(() => {
          const total = document.querySelector('.ctx-ring-pop .ctx-ring-pop-total')?.textContent ?? ''
          const rows = [...document.querySelectorAll('.ctx-ring-pop .ctx-ring-pop-row')].map((r) => r.textContent ?? '').join('|')
          const hit = document.querySelector('.ctx-ring-pop .ctx-ring-pop-hit-value')?.textContent ?? ''
          return JSON.stringify({ total, rows, hit })
        })()`
      )) as string
      const parsed = JSON.parse(popover) as { total: string; rows: string; hit: string }
      if (!parsed.total.startsWith('66,000 / ')) {
        throw new Error(`context-ring visual: popover total must start '66,000 / ', got ${parsed.total}`)
      }
      if (parsed.rows !== 'IN40,000|OUT2,000|cacheRead24,000|cacheWrite0') {
        throw new Error(`context-ring visual: popover quadruple wrong, got ${parsed.rows}`)
      }
      if (parsed.hit !== '37.5%') {
        throw new Error(`context-ring visual: cache hit rate must be 37.5%, got ${parsed.hit}`)
      }
      await capture(win, 'cr3-ring-hover', 'data popover: percent + used/limit + quadruple + hit rate')
      await leaveRing()
      if (!(await waitFor(getWindow, `document.querySelector('.ctx-ring-pop-open') === null`, 5_000))) {
        throw new Error('context-ring visual: the popover never closed after leave')
      }

      console.log('VISUAL context-ring done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL context-ring FAIL', err)
      app.exit(1)
    }
  })()
}
