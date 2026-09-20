/**
 * Group fold + Show more pagination visual-QA harness (ticket 39, spec R5).
 * Enabled with PICODE_VISUAL=1 plus PICODE_VISUAL_FOLD=1. NOT part of
 * `npm test` — but like the context-menu harness it ASSERTS its probe
 * results (exit 1 on any violation): the fold shape table is exact state,
 * not eyeballable.
 *
 * The invariants under test (the Seam-1 fold-model, rendered):
 *
 *   1. A 12-session group starts at the DEFAULT shape: five rows + "Show
 *      more", and NO caret anywhere in the sidebar.
 *   2. "Show more" steps +5 per click (12 → 10 shown).
 *   3. The group ROW's click folds ALL rows; the header stays count-free
 *      (Q9 — no caret, no count, the ⋯/view-files/new-task actions stay).
 *   4. Unfolding restores the PRE-FOLD step (10, not the default 5).
 *   5. The second step reaches ALL 12 — the control flips to "Show less".
 *   6. "Show less" resets to the initial five in ONE click.
 *
 * Ticket 95 adds the section row's aggregate pair (a SECOND seeded group
 * of 3 makes the aggregate real — 多组):
 *
 *   7. The Projects section row renders BOTH resident buttons (Collapse
 *      all / Expand all) alongside the stepped group.
 *   8. Collapse all folds EVERY listed group (zero rows, headers only)
 *      while each keeps its remembered step.
 *   9. Expand all restores every remembered shape — the stepped 10 comes
 *      back (Show more 位置不丢), the small group unfolds at its page.
 *  10. The Timeline view hides the whole section row — the pair with it.
 *  11. Back to By project the pair AND the shapes are still there.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with a
 * 12-session project group, distinct ascending mtimes so the newest-first
 * order is deterministic. Throwaway userData keeps the default 'projects'
 * view regardless of the operator's real preferences.
 *
 * Captures (PNGs land in the visual out dir):
 *   f1-fold-default   — five rows + Show more
 *   f2-fold-step      — ten rows + Show more (one step pressed)
 *   f3-fold-collapsed — the folded group (header only, no rows)
 *   f4-fold-restored  — the pre-fold step restored (ten rows)
 *   f5-fold-all       — all twelve + Show less
 *   f6-fold-reset     — back at the initial five + Show more
 *   c1-collapse-row   — the section row pair (A stepped to 10, B at 3)
 *   c2-collapse-all   — every group folded by ONE click
 *   c3-expand-all     — every remembered shape restored
 *   c4-timeline-pair  — Timeline: the section row (pair included) hidden
 *   c5-back-projects  — the pair back, shapes still remembered
 */

import { mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the fold harness (PICODE_VISUAL_FOLD=1 alongside
 * PICODE_VISUAL=1) — every other visual harness stands down when it is set. */
export function foldVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_FOLD'] === '1'
}

/** The harness needs the DEFAULT preferences (the 'projects' view) —
 * throwaway userData, exactly like the other harnesses. Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateFoldUserData(): void {
  if (!foldVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-fold-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const FOLD_SESSIONS = 12
/** The second (ticket-95) group's size — fits one page, no control. */
const FOLD_SECOND_SESSIONS = 3

/** The seeded group's project directory — a REAL tmpdir (the dead-cwd
 * filter must never drop these rows) whose basename is the group label. */
function foldProjectDir(): string {
  return path.join(tmpdir(), `picode-visual-fold-projects-${process.pid}`)
}

/** The ticket-95 second group's project directory (same rules). */
function foldSecondDir(): string {
  return path.join(tmpdir(), `picode-visual-fold-second-${process.pid}`)
}

/** Click one element inside the seeded group's section (bubbling DOM click
 * — React handlers, exactly like the smoke stage). */
function clickInGroup(groupExpr: string, selector: string): string {
  return `(() => { const g = ${groupExpr}; const el = g?.querySelector('${selector}'); if (el instanceof HTMLElement) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`
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

export function startFoldVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!foldVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const project = foldProjectDir()
  mkdirSync(project, { recursive: true })
  for (let i = 0; i < FOLD_SESSIONS; i++) {
    const file = writeVisualSession(store, {
      id: `fold-${String(i).padStart(2, '0')}`,
      cwd: project,
      userText: `Fold probe task ${i + 1} of ${FOLD_SESSIONS}`
    })
    // Distinct past mtimes: deterministic newest-first order inside the group.
    const then = new Date(Date.now() - (FOLD_SESSIONS - i) * 60_000)
    utimesSync(file, then, then)
  }
  // The ticket-95 second group: three sessions in their own project dir.
  const second = foldSecondDir()
  mkdirSync(second, { recursive: true })
  for (let i = 0; i < FOLD_SECOND_SESSIONS; i++) {
    const file = writeVisualSession(store, {
      id: `fold-b-${i}`,
      cwd: second,
      userText: `Fold probe task ${i + 1} of ${FOLD_SECOND_SESSIONS} (b)`
    })
    const then = new Date(Date.now() - (FOLD_SECOND_SESSIONS - i) * 60_000)
    utimesSync(file, then, then)
  }

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('fold visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(
        getWindow,
        `document.documentElement.dataset['chatSubscribed'] === 'true'`,
        15_000
      )
      await sleep(500)

      const projectName = path.basename(project)
      const secondName = path.basename(second)
      const groupExprOf = (label: string): string =>
        `([...document.querySelectorAll('.sb-group')].find((g) => g.querySelector('.sb-group-header span')?.textContent === '${label}') ?? null)`
      const stateExprOf = (label: string): string => `(() => {
        const g = ${groupExprOf(label)}
        if (!g) return '-1|none'
        const m = g.querySelector('.sb-show-more')
        return g.querySelectorAll('.sb-task').length + '|' + (m ? (m.textContent ?? '').trim() : 'none')
      })()`
      const groupExpr = groupExprOf(projectName)
      const stateExpr = stateExprOf(projectName)
      const stateSecondExpr = stateExprOf(secondName)
      /** One poll that also FAILS loudly when the shape is not the expected one. */
      const expectExpr = async (expr: string, expected: string, what: string): Promise<void> => {
        const ok = await waitFor(getWindow, `${expr} === '${expected}'`, 15_000)
        if (!ok) {
          const state = (await win.webContents.executeJavaScript(expr).catch(() => '?')) as string
          throw new Error(`fold visual: ${what} never reached ${expected} (state: ${state})`)
        }
      }
      const expectState = async (expected: string, what: string): Promise<void> => expectExpr(stateExpr, expected, what)
      const expectSecond = async (expected: string, what: string): Promise<void> => expectExpr(stateSecondExpr, expected, what)
      const click = async (selector: string, what: string): Promise<void> => {
        const clicked = (await win.webContents.executeJavaScript(clickInGroup(groupExpr, selector)).catch(() => false)) as boolean
        if (!clicked) throw new Error(`fold visual: could not click the ${what}`)
        await sleep(250)
      }
      /** Extra per-frame assertions (carets, folded header count). */
      const expectGlobal = async (probe: string, what: string): Promise<void> => {
        const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
        if (!ok) throw new Error(`fold visual: ${what}`)
      }

      // 1. Default shape: five rows + Show more, and the caret is GONE from
      //    every group header (ticket 39).
      await expectState('5|Show more', 'the seeded group at default shape')
      await expectGlobal(`document.querySelectorAll('.sb-caret').length === 0`, 'caret arrows still render in group headers')
      await capture(win, 'f1-fold-default', '5|Show more')

      // 2. One Show more step: ten rows.
      await click('.sb-show-more', 'Show more control')
      await expectState('10|Show more', 'one Show more step')
      await capture(win, 'f2-fold-step', '10|Show more')

      // 3. Fold through the group ROW: zero rows, control gone, header
      //    exactly the project label (no count, Q9).
      await click('.sb-group-header', 'group header (fold)')
      await expectState('0|none', 'the folded group')
      const headerText = (await win.webContents
        .executeJavaScript(`(() => { const g = ${groupExpr}; return g ? (g.querySelector('.sb-group-header')?.textContent ?? '').trim() : '' })()`)
        .catch(() => '')) as string
      if (headerText !== projectName) {
        throw new Error(`fold visual: the folded header carries extra text (count?): "${headerText}"`)
      }
      await capture(win, 'f3-fold-collapsed', '0|none')

      // 4. Unfold restores the PRE-FOLD step (ten, not the default five).
      await click('.sb-group-header', 'group header (unfold)')
      await expectState('10|Show more', 'the restored pre-fold shape')
      await capture(win, 'f4-fold-restored', '10|Show more')

      // 5. The second step reaches ALL 12 — the control flips to Show less.
      await click('.sb-show-more', 'Show more control')
      await expectState(`${FOLD_SESSIONS}|Show less`, 'full expansion')
      await capture(win, 'f5-fold-all', `${FOLD_SESSIONS}|Show less`)

      // 6. Show less: ONE click back to the initial five.
      await click('.sb-show-more', 'Show less control')
      await expectState('5|Show more', 'the Show less reset')
      await capture(win, 'f6-fold-reset', '5|Show more')

      // ---- ticket 95: the section row's Collapse all / Expand all pair ----
      // Both buttons live on the Projects section row (Projects view only);
      // the second seeded group makes the aggregate real.

      // 7. Seed a non-default shape again (f6 left the default five), then
      //    capture the section row WITH the pair — both groups visible.
      await click('.sb-show-more', 'Show more control')
      await expectState('10|Show more', 'the pre-collapse step')
      await expectSecond('3|none', 'the second group at its page')
      await expectGlobal(`document.querySelectorAll('.sb-section-action').length === 2`, 'the section row pair is not resident (ticket 95)')
      await capture(win, 'c1-collapse-row', 'A 10|Show more, B 3')

      // 8. Collapse all: ONE click folds BOTH listed groups (headers only).
      const clickPairButton = async (aria: string, what: string): Promise<void> => {
        const clicked = (await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('button[aria-label="${aria}"]'); if (b instanceof HTMLElement) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`).catch(() => false)) as boolean
        if (!clicked) throw new Error(`fold visual: could not click the ${what}`)
        await sleep(250)
      }
      await clickPairButton('Collapse all', 'Collapse all button')
      await expectState('0|none', 'the collapsed-by-pair stepped group')
      await expectSecond('0|none', 'the collapsed-by-pair second group')
      await capture(win, 'c2-collapse-all', 'A 0, B 0, pinned untouched')

      // 9. Expand all: every remembered shape restored — the stepped 10
      //    comes back (Show more 位置不丢), the small group at its page.
      await clickPairButton('Expand all', 'Expand all button')
      await expectState('10|Show more', 'the restored stepped shape after Expand all')
      await expectSecond('3|none', 'the restored second group')
      await capture(win, 'c3-expand-all', 'A 10|Show more, B 3')

      // 10. Timeline hides the whole section row — the pair with it.
      const openDropdown = `(() => { const b = document.querySelector('button[aria-label="Filter tasks"]'); if (b instanceof HTMLElement) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`
      const clickMenuItem = (label: string): string =>
        `(() => { const item = [...document.querySelectorAll('.sb-filter-menu .sb-filter-menu-item')].find((n) => n.querySelector('span')?.textContent === '${label}'); if (item instanceof HTMLElement) { item.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`
      await win.webContents.executeJavaScript(openDropdown)
      await waitFor(getWindow, `document.querySelector('.sb-filter-menu') !== null`, 5_000)
      await win.webContents.executeJavaScript(clickMenuItem('Timeline'))
      await waitFor(
        getWindow,
        `document.querySelector('.sb-section-label-projects') === null && document.querySelectorAll('.sb-section-action').length === 0`,
        5_000
      )
      await expectGlobal(
        `document.querySelector('.sb-section-label-projects') === null && document.querySelectorAll('.sb-section-action').length === 0`,
        'the Timeline view still shows the section row pair (ticket 95)'
      )
      await capture(win, 'c4-timeline-pair', 'Timeline: no section row, no pair')

      // 11. Back to By project: the pair AND the remembered shapes.
      await win.webContents.executeJavaScript(openDropdown)
      await waitFor(getWindow, `document.querySelector('.sb-filter-menu') !== null`, 5_000)
      await win.webContents.executeJavaScript(clickMenuItem('By project'))
      await expectState('10|Show more', 'the stepped shape after the view round-trip')
      await expectSecond('3|none', 'the second group after the view round-trip')
      await expectGlobal(`document.querySelectorAll('.sb-section-action').length === 2`, 'the section row pair never returned from Timeline')
      await capture(win, 'c5-back-projects', 'A 10|Show more, B 3, pair back')

      console.log('VISUAL fold done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL fold FAIL', err)
      app.exit(1)
    }
  })()
}
