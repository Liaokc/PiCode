/**
 * Turn-navigator-rail stacking visual harness (ticket 62). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_RAIL_STACK=1. Like the context-menu
 * harness it ASSERTS its probe results (exit 1 on any violation): stacking
 * order is observable behavior, not eyeball material — document
 * .elementFromPoint follows PAINT order, so a hit-test at a point where two
 * overlapping surfaces meet tells us exactly which one wins.
 *
 * The bug being pinned (pi15-rail-over-context-menu): the sidebar is a
 * stacking context (z-index: 1, holding the empty-state watermark down), so
 * the nine-item row context menu (z-index: 80) is TRAPPED in the sidebar's
 * subtree and compares at the sidebar's root-level slot. The nav rail used
 * to carry z-index: 5 of its own, which beat that slot — wherever the menu
 * extended past the sidebar's right edge, the tick column painted over it.
 * The fix (ticket 62, equivalent z-index scheme): the rail carries NO
 * z-index — it paints in the positioned/auto band (above the static
 * transcript, below the whole sidebar subtree) and keeps `isolation:
 * isolate` so its hover bubble never leaks to the root.
 *
 * The invariants under test:
 *
 *   1. Scene setup: the open session renders ≥2 navigator ticks and the
 *      context menu opened from a sidebar row actually OVERLAPS the rail's
 *      48px strip (otherwise the geometry proves nothing).
 *   2. At every menu item ∩ rail intersection point, the hit-test resolves
 *      INTO the menu — the nine items are fully visible and clickable, no
 *      tick penetration (fails on the pre-fix z-index: 5 rail).
 *   3. Zero regressions inside the main area: a tick still hit-tests above
 *      the transcript, the hover bubble still fades in over the transcript,
 *      and the Jump-to-Latest button (z-index: 10, untouched) still fades in
 *      and hit-tests above the transcript.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with three
 * backdated sessions in one real project dir, all with REAL cwds (ticket 42
 * filter). The transcript comes from a session_created(resumed) +
 * history_loaded injection (two user turns with long answers so the
 * transcript overflows the viewport for the jump-button probe).
 *
 * Captures (PNGs land in the visual out dir):
 *   rs1-menu-over-rail — the nine-item menu open ACROSS the rail (post-fix form)
 *   rs2-rail-bubble    — the rail's hover preview bubble over the transcript
 *   rs3-jump-btn       — Jump to Latest above the composer
 *
 * Plus rail-stack.json — the raw measurement dump (density-probe convention).
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

export function railStackVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_RAIL_STACK'] === '1'
}

/** The harness only reads through the real app (no pin/archive writes), but
 * it seeds an isolated store and must not touch operator preferences —
 * throwaway userData, same rule as the other store harnesses. Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateRailStackUserData(): void {
  if (!railStackVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-railstack-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** REAL tmpdir dir (ticket 42): the cwd-liveness filter drops sessions whose
 * cwd is not a directory on disk. The synthetic transcript session reuses it
 * so the sidebar's project grouping stays truthful. */
const PROJECT_CWD = (): string => ensureVisualProjectDir('rail-stack-proj')

/** Ages (days) of the three seeded sessions — all settled rows. */
const SEED_AGES_DAYS = [3, 6, 9]

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface MenuOverlap {
  label: string
  overlapsRail: boolean
  /** elementFromPoint at the item∩rail intersection resolves into the menu? */
  menuWins: boolean | null
}

interface MenuStackProbe {
  menu: Rect
  rail: Rect
  itemCount: number
  items: string[]
  overlaps: MenuOverlap[]
  anyOverlap: boolean
  allOverlappingWin: boolean
  allCentersClickable: boolean
}

/** Geometry + paint-order probe: for every menu item, intersect its rect
 * with the rail's rect and hit-test the intersection's center — the point
 * where the tick column would overpaint the menu if the stacking bug were
 * present. Item centers outside the rail band are probed too (plain
 * clickability). */
const MENU_STACK_PROBE = `(() => {
  const menu = document.querySelector('.sb-context-menu')
  const rail = document.querySelector('.nav-rail')
  if (!(menu instanceof Element) || !(rail instanceof Element)) return null
  const rect = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height })
  const mr = rect(menu.getBoundingClientRect())
  const rr = rect(rail.getBoundingClientRect())
  const inMenu = (x, y) => {
    const el = document.elementFromPoint(x, y)
    return el !== null && el.closest('.sb-context-menu') !== null
  }
  const items = [...menu.querySelectorAll('.sb-context-item')]
  const overlaps = items.map((el) => {
    const ir = el.getBoundingClientRect()
    const left = Math.max(ir.left, rr.left)
    const right = Math.min(ir.right, rr.right)
    const top = Math.max(ir.top, rr.top)
    const bottom = Math.min(ir.bottom, rr.bottom)
    const w = right - left
    const h = bottom - top
    const label = (el.textContent ?? '').trim()
    if (w < 8 || h < 8) return { label, overlapsRail: false, menuWins: null }
    return { label, overlapsRail: true, menuWins: inMenu(left + w / 2, top + h / 2) }
  })
  const centersClickable = items.map((el) => {
    const r = el.getBoundingClientRect()
    return inMenu(r.left + r.width / 2, r.top + r.height / 2)
  })
  const winning = overlaps.filter((o) => o.overlapsRail)
  return {
    menu: mr,
    rail: rr,
    itemCount: items.length,
    items: items.map((el) => (el.textContent ?? '').trim()),
    overlaps,
    anyOverlap: overlaps.some((o) => o.overlapsRail),
    allOverlappingWin: winning.length > 0 && winning.every((o) => o.menuWins === true),
    allCentersClickable: centersClickable.every((v) => v === true)
  }
})()`

/** A tick slot still hit-tests into the rail (rail above the transcript). */
const RAIL_HIT_PROBE = `(() => {
  const rail = document.querySelector('.nav-rail')
  const slot = document.querySelector('.nav-tick-slot')
  if (!(rail instanceof Element) || !(slot instanceof Element)) return null
  const r = slot.getBoundingClientRect()
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return el !== null && el.closest('.nav-rail') !== null
})()`

async function waitFor(getWindow: () => BrowserWindow | null, probe: string, budgetMs: number): Promise<boolean> {
  const win = getWindow()
  if (!win) return false
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok === true) return true
    await sleep(100)
  }
  return false
}

async function measure<T>(getWindow: () => BrowserWindow | null, probe: string): Promise<T | null> {
  const win = getWindow()
  if (!win) return null
  return win.webContents.executeJavaScript(probe).catch(() => null) as Promise<T | null>
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

/** Poll a compositor-driven fade to completion (the harness window may be
 * unfocused; Electron throttles background transitions — the element must
 * be SEEN opaque, not just class-flagged). */
async function pollOpacity(win: BrowserWindow, selector: string, budgetMs: number): Promise<number> {
  let last = 0
  for (let waited = 0; waited < budgetMs; waited += 100) {
    last = (await win.webContents.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el === null ? 0 : Number(getComputedStyle(el).opacity) })()`
    )) as number
    if (last > 0.9) return last
    await sleep(100)
  }
  return last
}

/** CSS :hover only follows REAL input events (m3 precedent). Electron hover
 * is frame-aligned: the second move re-issues the hit test. */
async function hoverPoint(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  await sleep(120)
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  await sleep(120)
}

function rightClick(win: BrowserWindow, x: number, y: number): void {
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 })
}

function pressEscape(win: BrowserWindow): void {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
}

async function rectOf(win: BrowserWindow, selector: string): Promise<Rect | null> {
  return win.webContents
    .executeJavaScript(
      `(() => {
        const el = document.querySelector('${selector}')
        if (!(el instanceof Element)) return null
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
      })()`
    )
    .catch(() => null) as Promise<Rect | null>
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`rail-stack visual: ${what}`)
}

const EXPECTED_ITEMS = [
  'Pin task',
  'Rename task',
  'Archive task',
  'Mark as Unread',
  'Reveal in Finder',
  'Copy task path',
  'Copy session file path',
  'Copy session ID',
  'View call trace'
]

/** Two settled turns with long answers — enough vertical content that the
 * transcript overflows the viewport (the jump-button probe needs real
 * scroll-away). */
const ANSWER_1 =
  'Validation is in place. The register endpoint now rejects malformed addresses before they reach the service layer. ' +
  'Email is syntax-checked, lowercased, and length-capped at 254 characters; password is a minimum of 12 characters and ' +
  'checked against the breached-list; errors come back as 400 { field, message } instead of a generic 500. '.repeat(6) +
  'The guard itself is small and sits at the route boundary, so no other layer needs to duplicate the checks. '.repeat(6)
const ANSWER_2 =
  'The flaky auth test is fixed. The flake smelled like a shared fixture: auth.test.ts reused the token cache across ' +
  'cases, so run order decided the outcome. beforeEach now resets the shared cache, and the suite passes three shuffled ' +
  'runs in a row — reproduced with --sequence.shuffle first to confirm the diagnosis before touching the fixture. '.repeat(6) +
  'No production code changed; the fixture isolation is the whole fix. '.repeat(6)

export function startRailStackVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!railStackVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const backdate = (file: string, days: number): void => {
    const then = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    utimesSync(file, then, then)
  }
  const files: string[] = []
  for (let i = 0; i < SEED_AGES_DAYS.length; i++) {
    const file = writeVisualSession(store, {
      id: `rail-stack-${i}`,
      cwd: PROJECT_CWD(),
      userText: `Rail stacking probe task number ${i + 1}`
    })
    backdate(file, SEED_AGES_DAYS[i])
    files.push(file)
  }
  const targetFile = files[0] as string

  void (async () => {
    const measurements: Record<string, unknown> = {}
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('rail-stack visual: no window')
      win.webContents.setBackgroundThrottling(false)

      // The renderer must have attached its Seam-1 subscription before the
      // history injection, and the seeded rows must reach the sidebar (index
      // poll cadence ~2s).
      const ready = await waitFor(
        getWindow,
        `document.documentElement.dataset['chatSubscribed'] === 'true' &&
         document.querySelectorAll('.sb-task').length >= 3`,
        30_000
      )
      if (!ready) {
        const diag = (await win.webContents
          .executeJavaScript(
            `JSON.stringify({ subscribed: document.documentElement.dataset['chatSubscribed'], tasks: document.querySelectorAll('.sb-task').length })`
          )
          .catch(() => 'diag failed')) as string
        throw new Error(`rail-stack visual: renderer never became ready ${diag}`)
      }
      await sleep(400)

      // ---- open a two-turn session in the main zone ----------------------
      // A resumed session with structured history renders isomorphic to a
      // live transcript (3b precedent): two user bubbles → two rail ticks.
      emitContractEvent({
        type: 'session_created',
        sessionId: 'rail-stack-session',
        cwd: PROJECT_CWD(),
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({
        type: 'history_loaded',
        items: [
          {
            role: 'user',
            id: 'rs-u1',
            text: 'Add input validation to the register endpoint and re-run its tests.',
            timestamp: '2026-09-10T09:12:04.100Z',
            skillName: null
          },
          {
            role: 'assistant',
            id: 'rs-a1',
            timestamp: '2026-09-10T09:12:40.000Z',
            text: ANSWER_1,
            parts: [{ kind: 'text', text: ANSWER_1 }]
          },
          {
            role: 'user',
            id: 'rs-u2',
            text: 'Now investigate the flaky auth test.',
            timestamp: '2026-09-10T09:14:40.010Z',
            skillName: null
          },
          {
            role: 'assistant',
            id: 'rs-a2',
            timestamp: '2026-09-10T09:15:20.000Z',
            text: ANSWER_2,
            parts: [{ kind: 'text', text: ANSWER_2 }]
          }
        ]
      })
      const railReady = await waitFor(
        getWindow,
        `(() => { const rail = document.querySelector('.nav-rail'); return rail !== null && rail.querySelectorAll('.nav-tick-slot').length >= 2 })()`,
        15_000
      )
      assert(railReady, 'the two-turn session never rendered the navigator rail (want ≥2 ticks)')

      // Regression surface (ticket 46): the rail hit-tests ABOVE the
      // transcript — a tick slot center resolves into the rail.
      const railHits = (await measure<boolean>(getWindow, RAIL_HIT_PROBE)) === true
      assert(railHits, 'a tick slot no longer hit-tests above the transcript (rail z demotion went too far)')
      measurements.railAboveTranscript = railHits

      // ---- right-click a row near the sidebar's right edge ---------------
      // The menu is clamped to the VIEWPORT only (not the sidebar), so a
      // cursor near the pane boundary opens the menu across the rail's 48px
      // strip — the exact pi15-rail-over-context-menu geometry.
      const row = (await rectOf(win, `[data-file="${targetFile}"]`)) ?? null
      if (row === null) {
        const diag = (await win.webContents
          .executeJavaScript(
            `JSON.stringify([...document.querySelectorAll('.sb-task')].map((el) => el.getAttribute('data-file')))`
          )
          .catch(() => 'diag failed')) as string
        throw new Error(`rail-stack visual: target row not present (want ${targetFile}); rows: ${diag}`)
      }
      rightClick(win, Math.round(row.right - 16), Math.round(row.top + row.height / 2))
      let stack: MenuStackProbe | null = null
      for (let waited = 0; waited < 5_000; waited += 120) {
        stack = (await measure<MenuStackProbe>(getWindow, MENU_STACK_PROBE)) as MenuStackProbe | null
        if (stack !== null) break
        await sleep(120)
      }
      if (stack === null) throw new Error('rail-stack visual: right-click never opened the menu')
      assert(stack.itemCount === 9, `menu must carry nine items (got ${stack.itemCount})`)
      if (JSON.stringify(stack.items) !== JSON.stringify(EXPECTED_ITEMS)) {
        throw new Error(`rail-stack visual: menu items/order wrong: ${stack.items.join(' | ')}`)
      }
      // The scene must genuinely exercise the overlap, or it proves nothing.
      assert(
        stack.menu.right > stack.rail.left + 8 && stack.menu.left < stack.rail.left,
        `menu must overlap the rail strip (menu right ${stack.menu.right} vs rail left ${stack.rail.left})`
      )
      assert(stack.anyOverlap, 'no menu item intersects the rail band — scene geometry is wrong')
      // THE FIX: at every item∩rail intersection the menu wins the hit-test.
      const losing = stack.overlaps.filter((o) => o.overlapsRail && o.menuWins !== true)
      assert(
        stack.allOverlappingWin,
        `ticks still paint over the menu — losing items: ${JSON.stringify(losing)} (rail left ${stack.rail.left}, menu left ${stack.menu.left})`
      )
      assert(stack.allCentersClickable, 'some menu item center is not hit-testable — menu not fully clickable')
      measurements.menuStack = stack
      await capture(win, 'rs1-menu-over-rail')

      // ---- close the menu (Escape) — it covers the rail band, so the
      // bubble probe must run on a clear rail ------------------------------
      pressEscape(win)
      const menuClosed = await waitFor(
        getWindow,
        `document.querySelector('.sb-context-menu') === null`,
        5_000
      )
      assert(menuClosed, 'Escape never closed the menu')

      // ---- regression surface (ticket 46): hover a tick → the preview
      // bubble fades in over the transcript (pointer-events: none, so paint
      // order here is pinned by the captured frame + the opacity poll).
      const slot = (await rectOf(win, '.nav-tick-slot')) ?? null
      if (slot === null) throw new Error('rail-stack visual: tick slot vanished')
      await hoverPoint(win, Math.round(slot.left + slot.width / 2), Math.round(slot.top + slot.height / 2))
      const bubbleOpacity = await pollOpacity(win, '.nav-bubble-open', 8_000)
      assert(bubbleOpacity > 0.9, `the hover bubble never faded in (opacity ${bubbleOpacity})`)
      measurements.bubbleOpacity = bubbleOpacity
      await capture(win, 'rs2-rail-bubble')
      // Park the cursor off the rail so the bubble closes for the next shot.
      await hoverPoint(win, 800, 500)

      // ---- regression surface (ticket 45): Jump to Latest still fades in
      // and hit-tests above the transcript (z-index: 10, untouched by the
      // fix — the probe pins that nothing leaked into its layer).
      const scrollable = (await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.chat-scroll'); if (!el) return false; el.scrollTop = 0; return el.scrollHeight > el.clientHeight + 160 })()`
      )) as boolean
      assert(scrollable, 'the seeded transcript does not overflow the viewport — jump probe needs real scroll-away')
      const jumpOpacity = await pollOpacity(win, '.chat-jump-btn', 8_000)
      assert(jumpOpacity > 0.9, `the jump button never faded in (opacity ${jumpOpacity})`)
      const jumpWins = (await win.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector('.chat-jump-btn')
          if (!(el instanceof Element)) return false
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return hit !== null && hit.closest('.chat-jump-btn') !== null
        })()`
      )) as boolean
      assert(jumpWins, 'the jump button no longer hit-tests above the transcript')
      measurements.jumpButton = { opacity: jumpOpacity, aboveTranscript: jumpWins }
      await capture(win, 'rs3-jump-btn')

      // ---- archive the dump (density-probe convention) ---------------------
      const jsonPath = path.join(visualOutDir(), 'rail-stack.json')
      writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      console.log(`VISUAL measured ${jsonPath}`)
      console.log(JSON.stringify(measurements, null, 2))
      console.log('VISUAL rail-stack done — all invariants held')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL rail-stack FAIL', err)
      try {
        const jsonPath = path.join(visualOutDir(), 'rail-stack.json')
        writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      } catch {
        // dump best-effort; the failure report above is what matters
      }
      app.exit(1)
    }
  })()
}
