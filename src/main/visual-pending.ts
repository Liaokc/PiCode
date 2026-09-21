/**
 * Optimistic New Task placeholder visual-QA harness (ticket 106). Enabled
 * with PICODE_VISUAL=1 plus PICODE_VISUAL_PENDING=1. Like the fold harness
 * it ASSERTS its probe results (exit 1 on any violation) — the honest
 * placeholder is exact state, not eyeballable.
 *
 * The invariants under test:
 *
 *   1. Dispatching a New Task create (the real empty-state send) makes the
 *      sidebar's project group + session card appear IMMEDIATELY — the
 *      placeholder rides the same group/sort pipeline as real cards.
 *   2. The placeholder is HONEST: its time slot reads "starting…" (no
 *      fabricated recency), it carries the data-pending marker, and its
 *      title is the projected first message — the exact title the real
 *      card will carry, so reconciliation never re-renders the text.
 *   3. session_created + the session index reconcile the card: zero
 *      pending rows remain, the real row shows the marker title and a real
 *      recency (对账替换 — no flicker, no ghost).
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with ONE
 * settled session in a real project directory (backdated mtime) — the
 * existing group the placeholder lands into. The send then creates a REAL
 * session (one short model turn); the app quits right after the captures.
 *
 * Captures (PNGs land in the visual out dir):
 *   p1-pending-instant — the sidebar mid-boot: the existing group with the
 *                        placeholder card on top ("starting…" slot)
 *   p2-reconciled      — the same group with the real card (real recency,
 *                        marker title, zero pending rows)
 */

import { mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the pending-create harness. */
export function pendingVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_PENDING'] === '1'
}

/** Throwaway userData — the default 'projects' view regardless of the
 * operator's real preferences (same rule as every other harness). Called
 * from index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolatePendingUserData(): void {
  if (!pendingVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-pending-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The seeded group's project directory — a REAL tmpdir (the cwd-liveness
 * filter must never drop the row) whose basename is the group label. */
function pendingProjectDir(): string {
  return path.join(tmpdir(), `picode-visual-pending-projects-${process.pid}`)
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

async function capture(win: BrowserWindow, name: string, state: string): Promise<void> {
  const { writeFileSync } = await import('node:fs')
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png state=${state}`)
}

/** Group-relative sidebar state for the seeded project's cwd. */
const groupStateJs = (cwd: string): string => `(() => {
  const g = document.querySelector('.sb-group[data-cwd="${cwd}"]')
  if (!g) return JSON.stringify({ group: false })
  const rows = [...g.querySelectorAll('.sb-task')]
  const pending = rows.filter((r) => (r.getAttribute('data-file') ?? '').startsWith('pending:'))
  const real = rows.filter((r) => (r.getAttribute('data-file') ?? '').endsWith('.jsonl'))
  return JSON.stringify({
    group: true,
    pendingRows: pending.length,
    anyPendingMarked: pending.length === 0 ? null : pending.every((r) => r.hasAttribute('data-pending')),
    // Ticket 106 honesty: no dot in the slot — the placeholder makes no
    // liveness claim (the dispatch-clock mtime must not read as the green
    // live-elsewhere dot).
    pendingDotEmpty: pending.length === 0 ? null : pending.every((r) => (r.querySelector('.sb-dot-slot')?.children.length ?? 1) === 0),
    pendingSlot: pending[0]?.querySelector('.sb-task-time')?.textContent ?? null,
    pendingTitle: pending[0]?.querySelector('.sb-task-title')?.textContent ?? null,
    real: real.length,
    time: real[0]?.querySelector('.sb-task-time')?.textContent ?? null,
    title: real[0]?.querySelector('.sb-task-title')?.textContent ?? null
  })
})()`

interface PendingGroupState {
  group: boolean
  pendingRows?: number
  anyPendingMarked?: boolean | null
  pendingDotEmpty?: boolean | null
  pendingSlot?: string | null
  pendingTitle?: string | null
  real?: number
  time?: string | null
  title?: string | null
}

export function startPendingVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!pendingVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const project = pendingProjectDir()
  mkdirSync(project, { recursive: true })
  const seeded = writeVisualSession(store, {
    id: 'pending-106-seed',
    cwd: project,
    userText: 'Pending probe task (settled seed)'
  })
  // Backdated mtime: the placeholder must sort ABOVE this row (newest first).
  const then = new Date(Date.now() - 30 * 60_000)
  utimesSync(seeded, then, then)

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('pending visual: no window')
      console.log('VISUAL pending: window up')
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      console.log('VISUAL pending: renderer subscribed')
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const groupState = async (): Promise<PendingGroupState> =>
        JSON.parse(String(await js(groupStateJs(project)))) as PendingGroupState

      // The seeded group renders its settled row first.
      if (!(await waitFor(getWindow, `${groupStateJs(project)}.includes('"real":1')`, 20_000))) {
        let snapshot: string
        try {
          snapshot = JSON.stringify(await groupState())
        } catch (probeErr) {
          snapshot = `state probe itself failed: ${probeErr instanceof Error ? probeErr.message : String(probeErr)}`
        }
        throw new Error(`pending visual: the seeded row never reached the sidebar (${snapshot})`)
      }
      console.log('VISUAL pending: seeded row up')

      // Open the New Task empty state and pick the seeded project on the chip.
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true })); true`)
      if (!(await waitFor(getWindow, `document.querySelector('.empty-state textarea.composer-input') !== null`, 10_000))) {
        throw new Error('pending visual: ⌘N never opened the new-task empty state')
      }
      await js(`(() => { const c = document.querySelector('.newtask-chip'); if (c instanceof HTMLElement) { c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`)
      if (!(await waitFor(getWindow, `document.querySelector('.newtask-pop') !== null`, 5_000))) {
        throw new Error('pending visual: the chip dropdown never rendered')
      }
      const label = path.basename(project)
      const picked = (await js(`(() => { const row = [...document.querySelectorAll('.newtask-row')].find((r) => r.querySelector('.newtask-row-label')?.textContent === '${label}'); if (row instanceof HTMLElement) { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`)) as boolean
      if (!picked) throw new Error('pending visual: the seeded project row never clicked')
      console.log('VISUAL pending: chip picked')
      if (!(await waitFor(getWindow, `document.querySelector('.newtask-chip span')?.textContent === '${label}'`, 5_000))) {
        throw new Error(`pending visual: the chip never showed the picked project (${label})`)
      }

      // Dispatch the create through the REAL send path.
      const typeJs = `(() => {
        const ta = document.querySelector('.empty-state textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, 'Reply with exactly: PICODE_106_VISUAL_OK')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.focus()
        return true
      })()`
      if (!((await js(typeJs)) as boolean)) throw new Error('pending visual: the empty-state composer is missing')
      await sleep(250)
      console.log('VISUAL pending: dispatching send')
      await js(`(() => { const ta = document.querySelector('.empty-state textarea.composer-input'); if (!(ta instanceof HTMLTextAreaElement)) return false; ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true })()`)

      // 1. The placeholder appears instantly — honest slot, marker, title.
      let pendingSeen = false
      for (let waited = 0; waited < 4_000; waited += 100) {
        const state = await groupState()
        if (state.group === true && (state.pendingRows ?? 0) >= 1) {
          pendingSeen = true
          if (state.anyPendingMarked !== true) throw new Error('pending visual: the placeholder lost its data-pending marker')
          if (state.pendingSlot !== 'starting…') {
            throw new Error(`pending visual: the placeholder time slot must read "starting…", got ${JSON.stringify(state.pendingSlot)}`)
          }
          if (state.pendingDotEmpty !== true) {
            throw new Error('pending visual: the placeholder dot slot must be empty (no liveness claim)')
          }
          if (!(state.pendingTitle ?? '').includes('PICODE_106_VISUAL_OK')) {
            throw new Error(`pending visual: the placeholder title must carry the projected first message, got ${JSON.stringify(state.pendingTitle)}`)
          }
          break
        }
        await sleep(100)
      }
      if (!pendingSeen) throw new Error(`pending visual: the placeholder card never appeared instantly (${JSON.stringify(await groupState())})`)
      await sleep(400)
      await capture(win, 'p1-pending-instant', 'existing group + placeholder card ("starting…")')

      // 2. Reconcile: the index confirms — real card, zero pending rows.
      let reconciled = false
      for (let waited = 0; waited < 35_000; waited += 150) {
        const state = await groupState()
        if (
          state.group === true &&
          (state.pendingRows ?? 1) === 0 &&
          (state.real ?? 0) === 2 &&
          state.time !== 'starting…' &&
          (state.title ?? '').includes('PICODE_106_VISUAL_OK')
        ) {
          reconciled = true
          break
        }
        await sleep(150)
      }
      if (!reconciled) throw new Error(`pending visual: the placeholder never reconciled into the real card (${JSON.stringify(await groupState())})`)
      await capture(win, 'p2-reconciled', 'real card (marker title, real recency), zero pending rows')

      console.log('VISUAL pending harness ok — all probes green')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL pending harness FAILED:', err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err))
      app.exit(1)
    }
  })()
}
