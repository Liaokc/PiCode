/**
 * Composer adaptive-height visual-QA harness (ticket 49, spec R2). Enabled
 * with PICODE_VISUAL=1 plus PICODE_VISUAL_EXPAND=1. Like the fold/tree
 * harnesses it ASSERTS its probe results (exit 1 on any violation) and
 * captures the review frames:
 *
 *   e1-expand-collapsed — the in-session composer with a long draft pinned
 *                         at the 160px auto-grow cap (internal scrolling),
 *                         the persistent top-right button in place
 *   e2-expand-open      — the expanded input: in place at about half the
 *                         main zone (clamped [280, 560]), transcript pushed
 *                         DOWN (no overlay), collapse glyph on the button
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
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
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

      console.log('VISUAL expand done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL expand FAIL', err)
      app.exit(1)
    }
  })()
}
