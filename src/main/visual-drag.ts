/**
 * Sidebar drag-reorder visual-QA harness (ticket 84). Enabled with
 * PICODE_VISUAL_DRAG=1 alone — deliberately NOT paired with PICODE_VISUAL=1:
 * the base frame harness pins exact sidebar-row counts (its 2d fork-frame
 * assertion), so the two must not share a store/window. Standalone like
 * visual:settings; the harness ASSERTS its structural probes (filter-harness
 * precedent, exit 1 on any violation) and owns the process exit:
 *
 *   1. Two seeded project groups render in the Updated arrangement.
 *   2. ONE session-row drag (row body, within its own group) reorders the
 *      rows AND auto-enters Manual — the persisted sort flips without any
 *      dropdown click.
 *   3. ONE group drag (the group header's ⋮⋮ grip handle) moves the whole
 *      group above the other — Manual composes the second move.
 *   4. The dropdown shows Manual checked; Updated restores the auto sort.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir, the shared
 * visual-store helpers) with a two-session api-server project and a
 * two-session web-app project; the drags go through the REAL handler chain
 * and write the REAL preference store — hence throwaway userData (the
 * filter-harness rule).
 *
 * Captures (PNGs land in the visual out dir):
 *   d1-row-dragged       — after the row drag: group A reordered, Manual active
 *   d2-dropdown-manual   — the open dropdown with Manual checked
 *   d3-group-dragged     — after the group drag: web-app above api-server
 */

import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'
import { utimesSync } from 'node:fs'

export function dragVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_DRAG'] === '1'
}

/** The drags write the REAL preference store, so the run gets throwaway
 * userData (filter-harness rule). Called from index.ts at module scope,
 * BEFORE app.whenReady reads userData. */
export function isolateDragUserData(): void {
  if (!dragVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-drag-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const API_CWD = (): string => ensureVisualProjectDir('api-server')
const WEB_CWD = (): string => ensureVisualProjectDir('web-app')

interface Seed {
  file: string
  id: string
  cwd: string
}

function seedSessions(): { api: Seed[]; web: Seed[] } {
  const store = ensureVisualStore()
  const seed = (id: string, cwd: string, userText: string, ageMinutes: number): Seed => {
    const file = writeVisualSession(store, { id, cwd, userText })
    const when = new Date(Date.now() - ageMinutes * 60_000)
    utimesSync(file, when, when)
    return { file, id, cwd }
  }
  // mtime tiers fix the Updated arrangement: web leads (2m), then api
  // (10m / 20m) — groups [web-app, api-server], rows [web-new, web-old],
  // [api-new, api-old].
  const webNew = seed('drag-web-new', WEB_CWD(), 'Polish the empty-state copy', 2)
  const webOld = seed('drag-web-old', WEB_CWD(), 'Audit the checkout funnel', 6)
  const apiNew = seed('drag-api-new', API_CWD(), 'Refresh the token rotation job', 10)
  const apiOld = seed('drag-api-old', API_CWD(), 'Trace the webhook retry storm', 20)
  return { api: [apiNew, apiOld], web: [webNew, webOld] }
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
  const image = await win.webContents.capturePage()
  const dir = visualOutDir()
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.png`)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, image.toPNG())
  console.log(`VISUAL captured ${file}`)
}

/** One synthetic HTML5 drag through the REAL handler chain (the electron-
 * smoke stage's driver): dragstart on the source, dragover + drop on the
 * target's top half, dragend on the source. */
async function dragTopHalf(win: BrowserWindow, fromSel: string, toSel: string): Promise<void> {
  const result = (await win.webContents.executeJavaScript(
    `(() => {
      const from = document.querySelector(${JSON.stringify(fromSel)})
      const to = document.querySelector(${JSON.stringify(toSel)})
      if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) return 'missing'
      const dt = new DataTransfer()
      const rect = to.getBoundingClientRect()
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientY: rect.top + 2 }
      from.dispatchEvent(new DragEvent('dragstart', opts))
      to.dispatchEvent(new DragEvent('dragover', opts))
      to.dispatchEvent(new DragEvent('drop', opts))
      from.dispatchEvent(new DragEvent('dragend', opts))
      return 'ok'
    })()`,
    true
  ).catch(() => 'failed')) as string
  if (result !== 'ok') throw new Error(`drag visual: the drag driver failed (${result})`)
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`drag visual: ${what}`)
}

/** Start the harness after the window exists (index.ts whenReady hook). */
export function startDragVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!dragVisualEnabled()) return

  const seeds = seedSessions()

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('drag visual: no window')

      const all = [...seeds.api, ...seeds.web]
      const rowsUp = await waitFor(
        getWindow,
        `document.querySelectorAll('.sb-task').length >= ${all.length}`,
        20_000
      )
      if (!rowsUp) throw new Error('drag visual: the seeded sessions never reached the sidebar')
      await sleep(400)

      const rowsOfGroup = (label: string): string =>
        `(() => { const g = [...document.querySelectorAll('.sb-group')].find((x) => x.querySelector('.sb-group-header span')?.textContent === '${label}'); return g ? [...g.querySelectorAll('.sb-task')].map((r) => (r.dataset['file'] ?? '').split('/').pop() ?? '') : [] })()`

      // ① Row drag within api-server: api-old above api-new — the FIRST
      //    drag auto-enters Manual (sort flips without any dropdown click).
      //    The base PICODE_VISUAL harness also seeds a fresh 'visual-tui-
      //    live' row into the same project dir, so the assertions here (and
      //    below) pin the RELATIVE order, never the exact row set.
      await dragTopHalf(win, '[data-file$="visual-drag-api-old.jsonl"]', '[data-file$="visual-drag-api-new.jsonl"]')
      const reordered = await waitFor(
        getWindow,
        `(() => { const r = ${rowsOfGroup('api-server')}; return r.indexOf('visual-drag-api-old.jsonl') !== -1 && r.indexOf('visual-drag-api-old.jsonl') < r.indexOf('visual-drag-api-new.jsonl') })()`,
        5_000
      )
      if (!reordered) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            api: ${rowsOfGroup('api-server')},
            web: ${rowsOfGroup('web-app')},
            view: document.querySelector('.sb-section-label-projects') !== null,
            draggables: [...document.querySelectorAll('.sb-task[draggable="true"]')].length
          })`,
          true
        ).catch(() => 'diag-failed')) as string
        throw new Error(`drag visual: the row drag never reordered api-server; DOM: ${diag}`)
      }
      await capture(win, 'd1-row-dragged')

      // ② The dropdown: Manual is checked (the auto-entry), Updated still
      //    available — capture the menu, then keep it open for ③.
      const filterBtn = await win.webContents.executeJavaScript(
        `(() => { const b = document.querySelector('button[aria-label="Filter tasks"]'); if (b instanceof HTMLElement) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`,
        true
      )
      assert(filterBtn === true, 'the filter dropdown never opened')
      const menuUp = await waitFor(getWindow, `document.querySelector('.sb-filter-menu') !== null`, 5_000)
      assert(menuUp, 'the filter menu never rendered')
      const checked = (await win.webContents.executeJavaScript(
        `(() => [...document.querySelectorAll('.sb-filter-menu .sb-filter-menu-item')].filter((n) => n.getAttribute('aria-checked') === 'true').map((n) => n.querySelector('span')?.textContent ?? '').join(','))()`,
        true
      )) as string
      assert(checked === 'By project,Manual', `Manual must be checked after the first drag (got ${checked})`)
      await capture(win, 'd2-dropdown-manual')
      await win.webContents.executeJavaScript(
        `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`
      )
      await sleep(200)

      // ③ Group drag by the grip handle: api-server above web-app.
      await dragTopHalf(
        win,
        `[data-cwd="${seeds.api[0].cwd}"] .sb-grip-handle`,
        `[data-cwd="${seeds.web[0].cwd}"]`
      )
      const groupsUp = await waitFor(
        getWindow,
        `(() => { const o = [...document.querySelectorAll('.sb-group .sb-group-header')].map((h) => h.querySelector('span')?.textContent ?? ''); return o.indexOf('api-server') !== -1 && o.indexOf('api-server') < o.indexOf('web-app') })()`,
        5_000
      )
      assert(groupsUp, 'the grip drag never moved api-server above web-app')
      // The base PICODE_VISUAL harness runs concurrently on this window and
      // can leave a popover open — close whatever is open before the frame.
      await win.webContents.executeJavaScript(
        `document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true`
      )
      await sleep(300)
      await capture(win, 'd3-group-dragged')

      // ④ Stage hygiene for the visual run: back to Updated.
      await win.webContents.executeJavaScript(
        `(() => { const b = document.querySelector('button[aria-label="Filter tasks"]'); if (b instanceof HTMLElement) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`,
        true
      )
      await waitFor(getWindow, `document.querySelector('.sb-filter-menu') !== null`, 5_000)
      await win.webContents.executeJavaScript(
        `(() => { const item = [...document.querySelectorAll('.sb-filter-menu .sb-filter-menu-item')].find((n) => n.querySelector('span')?.textContent === 'Updated'); if (item instanceof HTMLElement) { item.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`,
        true
      )
      await sleep(300)

      console.log('VISUAL drag harness done')
      app.exit(0)
    } catch (err) {
      console.error(`VISUAL drag FAIL ${String(err)}`)
      app.exit(1)
    } finally {
      rmSync(path.join(tmpdir(), `picode-visual-drag-userdata-${process.pid}`), { recursive: true, force: true })
    }
  })()
}
