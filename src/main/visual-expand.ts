/**
 * Composer adaptive-height visual-QA harness (ticket 49, spec R2). Enabled
 * with PICODE_VISUAL=1 plus PICODE_VISUAL_EXPAND=1. Like the fold/tree
 * harnesses it ASSERTS its probe results (exit 1 on any violation) and
 * captures the review frames:
 *
 *   e1a-text-clearance  — ticket 58: collapsed composer, one long unbroken
 *                         first line wrapping BEFORE the expand button's
 *                         zone (the pi15-composer-icon-covers-text defect
 *                         had it flowing beneath the opaque button)
 *   e1-expand-collapsed — the in-session composer with a long draft pinned
 *                         at the 160px auto-grow cap (internal scrolling),
 *                         the persistent top-right button in place
 *   e2-expand-open      — the expanded input: in place at about half the
 *                         main zone (clamped [280, 560]), transcript pushed
 *                         DOWN (no overlay), collapse glyph on the button
 *   e2b-expand-clearance — ticket 58: the same clearance rule while expanded
 *
 * The boot New Task empty state is probed first (same shared component:
 * button present, 74px floor), then a seeded session is opened by a real
 * sidebar-row click for the two chat frames.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with one
 * backdated session (a fresh mtime would take the Live Follow path, whose
 * view has no composer). Throwaway userData keeps the default view.
 */

import { mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the expand harness — every other visual harness stands
 * down when it is set. */
export function expandVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_EXPAND'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateExpandUserData(): void {
  if (!expandVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-expand-userdata-${process.pid}`))
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
  const { writeFileSync } = await import('node:fs')
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png state=${state}`)
}

/** 14 short lines → ~314px of content, safely past the 160px cap. */
const LONG_DRAFT = Array.from({ length: 14 }, (_, i) => `draft line ${i + 1} of the long prompt`).join('\n')

/** Ticket 58: the defect shot (pi15-composer-icon-covers-text) is ordinary
 * prose — a long first line fills the input to its right text boundary,
 * which used to run UNDER the opaque expand button. So the frame reproduces
 * it with natural prose: a long first line (its wrap point lands beside the
 * button) plus two short lines. No unbreakable token on purpose —
 * break-word moves an oversized token whole to the next line instead of
 * splitting it at the boundary, which would leave line 1 short. */
const CLEARANCE_DRAFT = [
  'Type a long first line like the defect shot: the sentence runs all the way to the right edge of the input and must wrap there, never flowing beneath the expand button at the top-right corner of the card.',
  'The second line stays short.',
  'And a third line closes the draft.'
].join('\n')

/** Ticket 58: the combined frame probe — geometry, not CSS bytes. The chat
 * view must be the settled top surface (no boot EmptyState overlay), the
 * clearance draft must be intact (a view remount wipes the composer's
 * local draft), the expand button must keep its approved top-right anchor
 * on the card, the text boundary — right rect edge minus right padding —
 * must sit at or left of the button's left edge, and the long first line
 * must actually have wrapped into ≥4 visual lines (vacuously true while
 * expanded, where the pinned height exceeds the content — the premise
 * carries over from the collapsed staging). */
function clearanceFrameProbe(expanded: boolean): string {
  const stateClause = expanded
    ? `if (btn.getAttribute('aria-expanded') !== 'true') return false`
    : `if (btn.getAttribute('aria-expanded') !== 'false') return false`
  return `(() => {
  if (document.querySelector('.empty-state') !== null) return false
  const ta = document.querySelector('.chat-dock textarea.composer-input')
  const btn = document.querySelector('.chat-dock .composer-expand')
  const card = document.querySelector('.chat-dock .composer')
  if (!(ta instanceof HTMLTextAreaElement) || !(btn instanceof HTMLElement) || !(card instanceof HTMLElement)) return false
  ${stateClause}
  if (ta.value !== ${JSON.stringify(CLEARANCE_DRAFT)}) return false
  const taR = ta.getBoundingClientRect()
  const btnR = btn.getBoundingClientRect()
  const cardR = card.getBoundingClientRect()
  if (cardR.right - btnR.right > 12 || btnR.top - cardR.top > 12) return false
  if (taR.right - parseFloat(getComputedStyle(ta).paddingRight) > btnR.left + 0.5) return false
  const cs = getComputedStyle(ta)
  const lines = (ta.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)
  return lines >= 3.5
})()`
}

/** Ticket 58: stage the clearance draft and wait until the frame's state
 * HOLDS — the resume boot transition and the index refresh can remount the
 * view tree for a render pass, wiping the composer's local draft, so the
 * probe must survive a stability window and the staging retries (re-set the
 * value, re-expand) before the capture. Throws if the state never settles. */async function stageClearanceFrame(win: BrowserWindow, expanded: boolean): Promise<void> {
  const setScript = `(() => {
    const ta = document.querySelector('.chat-dock textarea.composer-input')
    if (!(ta instanceof HTMLTextAreaElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, ${JSON.stringify(CLEARANCE_DRAFT)})
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`
  const expandScript = `(() => {
    const btn = document.querySelector('.chat-dock .composer-expand')
    if (!btn || btn.getAttribute('aria-expanded') === 'true') return true
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })()`
  const probe = clearanceFrameProbe(expanded)
  for (let attempt = 0; ; attempt++) {
    await win.webContents.executeJavaScript(setScript)
    if (expanded) await win.webContents.executeJavaScript(expandScript)
    // Stability window: the probe must hold across consecutive polls — a
    // one-pass remount flicker resets the chain.
    let held = 0
    for (let waited = 0; waited < 5_000 && held < 3; waited += 150) {
      const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
      held = ok ? held + 1 : 0
      await sleep(150)
    }
    if (held >= 3) return
    if (attempt >= 5) {
      throw new Error(
        expanded
          ? 'expand visual: the expanded clearance frame never settled (state kept flickering)'
          : 'expand visual: the collapsed clearance frame never settled (state kept flickering)'
      )
    }
  }
}

export function startExpandVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!expandVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const file = writeVisualSession(store, {
    id: 'expand-49',
    cwd: ensureVisualProjectDir('expand-demo'),
    userText: 'Draft the migration plan for the billing service'
  })
  // Backdate: a fresh mtime would take the Live Follow path (no composer).
  const then = new Date(Date.now() - 60 * 60 * 1_000)
  utimesSync(file, then, then)

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('expand visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      // The boot empty state shares the composer: button present, floor held.
      const emptyTa = `document.querySelector('.empty-state textarea.composer-input')`
      if (!(await waitFor(getWindow, `${emptyTa} !== null && ${emptyTa}.clientHeight === 74`, 10_000))) {
        throw new Error('expand visual: the empty-state composer never settled at the 74px floor')
      }
      if (!(await waitFor(getWindow, `document.querySelector('.empty-state .composer-expand') !== null`, 5_000))) {
        throw new Error('expand visual: the empty-state expand button never rendered')
      }

      // Open the seeded session by a real sidebar-row click (tree precedent).
      const rowExpr = `document.querySelector('[data-file="${file}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('expand visual: the seeded session never reached the sidebar')
      }
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.chat-dock textarea.composer-input') !== null`, 10_000))) {
        throw new Error('expand visual: the chat view composer never opened')
      }

      // Ticket 58: the long first line must fill to the text boundary and
      // wrap BEFORE the expand button's zone (frame e1a).
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
      await stageClearanceFrame(win, false)
      await capture(win, 'e1a-text-clearance', 'long first line wraps clear of the button')

      // Long draft → the 160px cap with internal scrolling.
      await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, ${JSON.stringify(LONG_DRAFT)})
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.focus()
        return true
      })()`)
      if (!(await waitFor(getWindow, `${chatTa}.clientHeight === 160 && ${chatTa}.scrollHeight > ${chatTa}.clientHeight`, 5_000))) {
        throw new Error('expand visual: the long draft never pinned the 160px auto-grow cap')
      }
      await capture(win, 'e1-expand-collapsed', 'auto-grow pinned at 160px, button top-right')

      // Expand: in place at about half the main zone, transcript pushed down.
      const transcriptBefore = (await win.webContents.executeJavaScript(
        `document.querySelector('.chat-scroll')?.clientHeight ?? 0`
      )) as number
      await win.webContents.executeJavaScript(
        `document.querySelector('.chat-dock .composer-expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const expandedProbe = `(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        const zone = document.querySelector('.chat-view')
        const card = document.querySelector('.chat-dock .composer')
        const transcript = document.querySelector('.chat-scroll')
        if (!ta || !zone || !card || !transcript) return false
        const expected = Math.round(Math.min(Math.max(zone.clientHeight / 2, 280), 560))
        if (ta.clientHeight !== expected) return false
        if (transcript.clientHeight >= ${transcriptBefore}) return false
        return card.getBoundingClientRect().top >= transcript.getBoundingClientRect().bottom - 1
      })()`
      if (!(await waitFor(getWindow, expandedProbe, 5_000))) {
        throw new Error('expand visual: the expansion never pushed the transcript down at the projected half-zone height')
      }
      await capture(win, 'e2-expand-open', 'expanded in place, transcript pushed down')

      // Ticket 58: the same rule while expanded — restage the long first
      // line at the expanded height (the staging helper re-expands if a
      // remount collapsed the composer and re-sets the draft if wiped).
      await stageClearanceFrame(win, true)
      await capture(win, 'e2b-expand-clearance', 'expanded: the wrapped line still clears the button')

      console.log('VISUAL expand done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL expand FAIL', err)
      app.exit(1)
    }
  })()
}
