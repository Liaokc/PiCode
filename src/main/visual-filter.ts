/**
 * Filter-dropdown visual-QA harness (ticket 33). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_FILTER=1. NOT part of `npm test` — a human compares the
 * captures against `.scratch/compare/z-filter-menu.png`; the harness itself
 * ASSERTS its structural probes (row-geometry precedent, exit 1 on any
 * violation):
 *
 *   1. Retirements: the text-filter row is GONE, the dead Expand-all button
 *      is GONE, and the old Groups/Projects pills are GONE (⌘K covers
 *      search; the dropdown owns the view).
 *   2. The FilterIcon opens the ZCode-form dropdown: a View section
 *      (By project / Timeline) + a Sort-by section (Updated / Created),
 *      each item with a check mark on the current choice.
 *   3. Timeline flattens every session into ONE list (no project headers)
 *      with the pinned section KEPT on top.
 *   4. Sort Created reorders rows by the file birthtime — against the
 *      expected order COMPUTED from the real stat() birthtimes, so the
 *      probe stays honest on any platform. The fixture backdates mtimes at
 *      creation and then freshens one file, which on birthtime-tracking
 *      filesystems (macOS) makes the created and updated orders DISAGREE —
 *      the switch is observable, not just plausible.
 *   5. Persistence: both choices land in preferences and a window reload
 *      restores the timeline + created sidebar.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with one
 * three-session api-server project and one two-session web-app project.
 * The pin goes through the REAL pin button (which, like the dropdown
 * choices, writes the REAL preference store — hence throwaway userData).
 *
 * Captures (PNGs land in the visual out dir):
 *   f1-filter-dropdown   — the open dropdown over the By project view
 *   f2-timeline          — Timeline chosen: flat list, pinned still on top
 *   f3-sort-created      — Created chosen: rows reordered by birthtime
 */

import { mkdirSync, utimesSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

export function filterVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_FILTER'] === '1'
}

/** The dropdown choices and the pin all write the REAL preference store, so
 * the run gets throwaway userData (multi-session harness precedent). Called
 * from index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateFilterUserData(): void {
  if (!filterVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-filter-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** REAL tmpdir dirs (ticket 42): the cwd-liveness filter drops sessions
 * whose cwd is not a directory on disk; basenames keep the group labels. */
const API_CWD = (): string => ensureVisualProjectDir('api-server')
const WEB_CWD = (): string => ensureVisualProjectDir('web-app')

interface Seed {
  file: string
  id: string
  cwd: string
}

/** Backdate a file's mtime to `days` ago. Called at CREATION time, so on
 * macOS the birthtime clamps along (birthtime ≤ mtime rule) — the file's
 * creation clock becomes its backdate target. */
function backdate(file: string, days: number): void {
  const then = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  utimesSync(file, then, then)
}

/** Freshen a file's mtime to `minutes` ago WITHOUT touching its birthtime —
 * moving mtime within [birthtime, now] leaves the birth clock alone. */
function freshen(file: string, minutes: number): void {
  const when = new Date(Date.now() - minutes * 60 * 1000)
  utimesSync(file, when, when)
}

function seedSessions(): { api: Seed[]; web: Seed[] } {
  const store = ensureVisualStore()
  const seed = (id: string, cwd: string, userText: string): Seed => ({
    file: writeVisualSession(store, { id, cwd, userText }),
    id,
    cwd
  })
  // api-server: births (via clamped backdates) 10d / 5d / 1d ago; then
  // api-old is freshened to 30m ago — updated order becomes
  // [api-old, api-young, api-mid] while created stays [api-old, api-mid,
  // api-young] (on birthtime-tracking filesystems the orders disagree).
  const apiOld = seed('filter-api-old', API_CWD(), 'Refresh the token rotation job')
  backdate(apiOld.file, 10)
  const apiMid = seed('filter-api-mid', API_CWD(), 'Trace the webhook retry storm')
  backdate(apiMid.file, 5)
  const apiYoung = seed('filter-api-young', API_CWD(), 'Draft the rate-limit headers')
  backdate(apiYoung.file, 1)
  freshen(apiOld.file, 30)
  // web-app: 2h / 3d — the pin target is the OLDER web session.
  const webNew = seed('filter-web-new', WEB_CWD(), 'Polish the empty-state copy')
  backdate(webNew.file, 0.08)
  const webOld = seed('filter-web-old', WEB_CWD(), 'Audit the checkout funnel')
  backdate(webOld.file, 3)
  return { api: [apiOld, apiMid, apiYoung], web: [webNew, webOld] }
}

/** Expected creation order of the given seeds under ticket 33's rule:
 * birthtime desc, missing birthtimes degrading to the header timestamp,
 * ties broken by mtime desc. Computed from the REAL stat() so the probe
 * never assumes a platform's birthtime semantics. */
function expectedCreatedOrder(seeds: Seed[]): string[] {
  const createdMs = (file: string): number => {
    const stats = statSync(file)
    if (stats.birthtimeMs > 0) return stats.birthtimeMs
    return 0
  }
  return [...seeds]
    .sort((a, b) => {
      const createdDelta = createdMs(b.file) - createdMs(a.file)
      if (createdDelta !== 0) return createdDelta
      return statSync(b.file).mtimeMs - statSync(a.file).mtimeMs
    })
    .map((seed) => seed.file)
}

/** Expected updated order: mtime desc. */
function expectedUpdatedOrder(seeds: Seed[]): string[] {
  return [...seeds]
    .sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs)
    .map((seed) => seed.file)
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

async function mouseMove(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
}

async function mouseClick(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
}

interface Point {
  x: number
  y: number
}

/** Center of an element matched by a selector + optional text needle. */
const CENTER_PROBE = (selector: string, text?: string): string => `(() => {
  const needle = ${JSON.stringify(text ?? null)}
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) =>
    needle === null || (n.textContent ?? '').trim().includes(needle)
  )
  if (!(el instanceof Element)) return null
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})()`

async function centerOf(win: BrowserWindow, selector: string, text?: string): Promise<Point> {
  const point = (await win.webContents.executeJavaScript(CENTER_PROBE(selector, text)).catch(() => null)) as Point | null
  if (!point) throw new Error(`filter visual: nothing on screen for ${selector}${text ? ` "${text}"` : ''}`)
  return point
}

/** Row order as data-file paths, top to bottom. */
const ROW_ORDER_PROBE = `(() => [...document.querySelectorAll('.sb-task')].map((n) => n.dataset['file']))()`

async function rowOrder(win: BrowserWindow): Promise<string[]> {
  const rows = (await win.webContents.executeJavaScript(ROW_ORDER_PROBE).catch(() => null)) as string[] | null
  if (rows === null) throw new Error('filter visual: row order probe failed')
  return rows
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`filter visual: ${what}`)
}

function assertOrder(actual: string[], expected: string[], what: string): void {
  const same = actual.length === expected.length && expected.every((file, i) => file === actual[i])
  if (!same) {
    throw new Error(
      `filter visual: ${what}\n  expected: ${expected.map((f) => path.basename(f)).join(', ')}\n  actual:   ${actual
        .map((f) => path.basename(f))
        .join(', ')}`
    )
  }
}

/** The dropdown choices round-trip through the preferences service (async)
 * before the rows re-render — poll until the DOM order matches. */
async function waitForOrder(win: BrowserWindow, expected: string[], what: string): Promise<void> {
  let last: string[] = []
  for (let waited = 0; waited < 8_000; waited += 120) {
    last = await rowOrder(win)
    const same = last.length === expected.length && expected.every((file, i) => file === last[i])
    if (same) return
    await sleep(120)
  }
  throw new Error(
    `filter visual: ${what} never settled\n  expected: ${expected.map((f) => path.basename(f)).join(', ')}\n  actual:   ${last
      .map((f) => path.basename(f))
      .join(', ')}`
  )
}

export function startFilterVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!filterVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const seeds = seedSessions()
  const all = [...seeds.api, ...seeds.web]
  const pinTarget = seeds.web[1]
  const nonPinned = all.filter((seed) => seed !== pinTarget)

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('filter visual: no window')

      // The seeded rows must reach the sidebar (index poll cadence ~2s).
      const rows = await waitFor(getWindow, `document.querySelectorAll('.sb-task').length >= ${all.length}`, 20_000)
      if (!rows) throw new Error('filter visual: seeded sessions never reached the sidebar')
      await sleep(400)

      // ---- retirements (ticket 33) ---------------------------------------
      const retired = (await win.webContents.executeJavaScript(
        `(() => ({
          filterRow: document.querySelector('.sb-filter-row') !== null,
          expandAll: document.querySelector('button[aria-label="Expand all sections"]') !== null,
          viewPills: document.querySelector('.sb-view-pills') !== null
        }))()`,
        true
      ).catch(() => null)) as { filterRow: boolean; expandAll: boolean; viewPills: boolean } | null
      if (!retired) throw new Error('filter visual: retirement probe failed')
      assert(!retired.filterRow, 'the text-filter row must be retired (⌘K covers search)')
      assert(!retired.expandAll, 'the dead Expand-all button must be gone')
      assert(!retired.viewPills, 'the Groups/Projects pills must be gone (the dropdown owns the view)')

      // ---- pin the target through the REAL button (projects view) --------
      const pinTargetRow = await centerOf(win, `[data-file="${pinTarget.file}"]`)
      await mouseMove(win, pinTargetRow.x, pinTargetRow.y)
      await sleep(250)
      await mouseMove(win, pinTargetRow.x, pinTargetRow.y)
      await sleep(250)
      const pinPoint = await centerOf(win, `[data-file="${pinTarget.file}"] .sb-pin-btn`)
      await mouseClick(win, pinPoint.x, pinPoint.y)
      const pinnedShown = await waitFor(
        getWindow,
        `document.querySelector('[data-file="${pinTarget.file}"] .sb-pin-btn.sb-pin-on') !== null`,
        10_000
      )
      if (!pinnedShown) throw new Error('filter visual: pin click never pinned the row')
      await mouseMove(win, 120, 40)
      await sleep(200)

      // ---- By project + Updated: per-group order under the defaults ------
      const groupCount = (await win.webContents.executeJavaScript(
        `document.querySelectorAll('.sb-group').length`,
        true
      ).catch(() => null)) as number | null
      if (groupCount !== 2) throw new Error(`filter visual: expected 2 project groups, got ${groupCount}`)
      // Groups keep their own rows sorted; the api group leads (its freshest
      // row, api-old at 30m, beats web-app's at ~2h).
      const apiRows = seeds.api.filter((seed) => seed !== pinTarget)
      const webRows = seeds.web.filter((seed) => seed !== pinTarget)
      assertOrder(
        await rowOrder(win),
        [pinTarget.file, ...expectedUpdatedOrder(apiRows), ...expectedUpdatedOrder(webRows)],
        'By project + Updated row order (pinned first, then per-group recency)'
      )

      // ---- open the dropdown (f1: ZCode form, checks on By project/Updated)
      const filterBtn = await centerOf(win, 'button[aria-label="Filter tasks"]')
      await mouseClick(win, filterBtn.x, filterBtn.y)
      const menuShown = await waitFor(
        getWindow,
        `document.querySelector('.sb-filter-menu') !== null`,
        5_000
      )
      if (!menuShown) throw new Error('filter visual: the filter dropdown never opened')
      const menuState = (await win.webContents.executeJavaScript(
        `(() => {
          const items = [...document.querySelectorAll('.sb-filter-menu .sb-filter-menu-item')]
          return items.map((n) => ({
            label: n.querySelector('span')?.textContent ?? '',
            checked: n.getAttribute('aria-checked') === 'true'
          }))
        })()`,
        true
      ).catch(() => null)) as Array<{ label: string; checked: boolean }> | null
      if (!menuState) throw new Error('filter visual: dropdown items probe failed')
      assert(
        JSON.stringify(menuState.map((i) => i.label)) ===
          JSON.stringify(['By project', 'Timeline', 'Updated', 'Created', 'Manual']),
        `dropdown must carry the five ZCode items in order, Manual third sort (ticket 84) (got ${JSON.stringify(menuState.map((i) => i.label))})`
      )
      assert(
        menuState.filter((i) => i.checked).map((i) => i.label).join(',') === 'By project,Updated',
        `the defaults must be checked: By project + Updated (got ${JSON.stringify(menuState)})`
      )
      await capture(win, 'f1-filter-dropdown')

      // ---- choose Timeline: flat list, pinned stays on top (f2) -----------
      const timelineItem = await centerOf(win, '.sb-filter-menu .sb-filter-menu-item', 'Timeline')
      await mouseClick(win, timelineItem.x, timelineItem.y)
      const timelineShown = await waitFor(
        getWindow,
        `document.querySelectorAll('.sb-group').length === 0`,
        5_000
      )
      if (!timelineShown) throw new Error('filter visual: Timeline never flattened the list (group headers stayed)')
      await waitForOrder(win, [pinTarget.file, ...expectedUpdatedOrder(nonPinned)], 'Timeline + Updated row order (pinned still on top, one flat list)')
      const pinnedFirst = (await win.webContents.executeJavaScript(
        `document.querySelector('.sb-task .sb-pin-btn.sb-pin-on')?.closest('.sb-task')?.dataset['file']`,
        true
      ).catch(() => null)) as string | null
      assert(pinnedFirst === pinTarget.file, 'the pinned row must sit at the very top of the timeline')
      await capture(win, 'f2-timeline')

      // ---- choose Created: birthtime order, computed from real stat() (f3)
      await mouseClick(win, filterBtn.x, filterBtn.y)
      if (!(await waitFor(getWindow, `document.querySelector('.sb-filter-menu') !== null`, 5_000))) {
        throw new Error('filter visual: the filter dropdown did not reopen')
      }
      const createdItem = await centerOf(win, '.sb-filter-menu .sb-filter-menu-item', 'Created')
      await mouseClick(win, createdItem.x, createdItem.y)
      if (!(await waitFor(getWindow, `document.querySelector('.sb-filter-menu') === null`, 5_000))) {
        throw new Error('filter visual: the dropdown never closed after choosing Created')
      }
      const createdExpected = expectedCreatedOrder(nonPinned)
      await waitForOrder(win, [pinTarget.file, ...createdExpected], 'Timeline + Created row order (birthtime desc)')
      await capture(win, 'f3-sort-created')

      // ---- persistence: the choices survive a reload ----------------------
      const persisted = (await win.webContents.executeJavaScript(`window.picode.settings.get()`, true).catch(
        () => null
      )) as { preferences: { sidebarView: string; sidebarSort: string } } | null
      if (!persisted) throw new Error('filter visual: settings.get probe failed')
      const { sidebarView, sidebarSort } = persisted.preferences
      assert(sidebarView === 'timeline', `preferences must persist sidebarView timeline (got ${String(sidebarView)})`)
      assert(sidebarSort === 'created', `preferences must persist sidebarSort created (got ${String(sidebarSort)})`)
      win.webContents.reload()
      const restored = await waitFor(
        getWindow,
        `document.querySelectorAll('.sb-task').length >= ${all.length} && document.querySelectorAll('.sb-group').length === 0`,
        20_000
      )
      if (!restored) throw new Error('filter visual: the reload did not restore Timeline + Created')
      await waitForOrder(win, [pinTarget.file, ...createdExpected], 'after reload: the timeline + created choice is restored')

      console.log('VISUAL filter-dropdown done — dropdown form, timeline, created sort, persistence all held')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL filter FAIL', err)
      app.exit(1)
    }
  })()
}
