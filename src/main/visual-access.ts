/**
 * Access-menu visual-QA harness (ticket 38). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_ACCESS=1. NOT part of `npm test` — a human compares the
 * capture against the archived before-frame `.scratch/compare/pi13-access-menu-spacing.png`;
 * the harness itself ASSERTS its structural probes (row-geometry precedent,
 * exit 1 on any violation):
 *
 *   1. Spacing: the mode name and its muted hint are two STACKED spans
 *      inside `.cmp-access-row-text` (flex column, 8px gap) — pre-38 they
 *      rendered glued together with zero gap.
 *   2. Tier colors: the shield icon takes the tier color — Full Access
 *      orange (--accent-orange) / Standard gray (--text-secondary) /
 *      Read Only green (the approved-check green) — asserted via computed
 *      color, so a token rename fails loudly here.
 *   3. Semantics untouched: exactly one check mark (the current tier), the
 *      three rows keep their labels and hints.
 *
 * Capture: a1-access-menu — the open access menu over a settled session.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import type { HostToParent } from '../shared/contract'

export function accessVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_ACCESS'] === '1'
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The expected computed colors — kept in sync with the app.css tier rules. */
const EXPECTED_SHIELD_COLORS: Record<string, string> = {
  'cmp-access-shield-full-access': 'rgb(236, 121, 49)', // --accent-orange #ec7931
  'cmp-access-shield-standard': 'rgb(142, 142, 136)', // --text-secondary #8e8e88
  'cmp-access-shield-read-only': 'rgb(43, 158, 78)' // approved-check green #2b9e4e
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`access visual: ${what}`)
}

export function startAccessVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!accessVisualEnabled()) return

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      // Wait for the renderer to mount AND attach its Seam-1 subscription —
      // events emitted before that point would never reach the reducer.
      let win: BrowserWindow | null = null
      for (let waited = 0; waited < 15_000; waited += 100) {
        win = getWindow()
        if (win) {
          const ready = await win.webContents
            .executeJavaScript("document.documentElement.dataset['chatSubscribed'] === 'true'")
            .catch(() => false)
          if (ready === true) break
        }
        await sleep(100)
        win = null
      }
      if (!win) throw new Error('access visual: no window')
      const target = win

      // A live session enables the composer (the access chip is disabled in
      // the New Task empty state). Renderer-only injection — no host.
      const emit = (event: HostToParent): void => {
        target.webContents.send('chat:from-host', event)
      }
      emit({ type: 'session_created', sessionId: 'visual-access', cwd: '/Users/dev/projects/api-server', model: 'claude-opus-4-5' })
      emit({ type: 'composer_state', model: null, thinkingLevel: null, availableLevels: [], accessMode: 'standard' })
      await sleep(500)

      // Open the access menu through the real chip.
      const opened = (await target.webContents.executeJavaScript(
        `(() => {
          const chip = document.querySelector('button[aria-label="Access mode: Standard"]')
          if (!(chip instanceof HTMLElement)) return false
          chip.click()
          return true
        })()`
      ).catch(() => false)) as boolean
      if (!opened) throw new Error('access visual: the Access Mode chip never opened the menu')
      await sleep(400)

      // ---- probes ----------------------------------------------------------
      const sig = (await target.webContents.executeJavaScript(
        `(() => {
          const rows = [...document.querySelectorAll('.cmp-popover .cmp-access-row')]
          const texts = [...document.querySelectorAll('.cmp-popover .cmp-access-row-text')].map((n) => {
            const style = getComputedStyle(n)
            return { display: style.display, direction: style.flexDirection, gap: style.rowGap }
          })
          const shields = [...document.querySelectorAll('.cmp-popover .cmp-access-shield')].map((n) => ({
            cls: [...n.classList].find((c) => c.startsWith('cmp-access-shield-')) ?? '',
            color: getComputedStyle(n).color
          }))
          const titles = [...document.querySelectorAll('.cmp-popover .cmp-access-row .cmp-menu-title')].map((n) => n.textContent ?? '')
          const descs = [...document.querySelectorAll('.cmp-popover .cmp-access-row .cmp-menu-desc')].map((n) => n.textContent ?? '')
          return { rows: rows.length, texts, shields, titles, descs, checks: document.querySelectorAll('.cmp-popover .cmp-menu-check').length }
        })()`
      ).catch(() => null)) as {
        rows: number
        texts: Array<{ display: string; direction: string; gap: string }>
        shields: Array<{ cls: string; color: string }>
        titles: string[]
        descs: string[]
        checks: number
      } | null
      if (!sig) throw new Error('access visual: menu probe failed')

      assert(sig.rows === 3, `expected 3 access rows, saw ${sig.rows}`)
      assert(
        sig.titles.join('|') === 'Full Access|Standard|Read Only',
        `tier labels changed: ${JSON.stringify(sig.titles)}`
      )
      assert(
        sig.descs.join('|') === 'Run every tool without asking|Ask before mutating tools|Inspect only — deny all mutations',
        `tier hints changed: ${JSON.stringify(sig.descs)}`
      )

      // ① Spacing: every text block stacks its title over the hint at 8px.
      for (const text of sig.texts) {
        assert(text.display === 'flex' && text.direction === 'column', `access text block must stack (got ${text.display}/${text.direction})`)
        assert(text.gap === '8px', `title↔hint gap must be 8px (got ${text.gap})`)
      }

      // ② Tier colors on the shields.
      for (const shield of sig.shields) {
        const expected = EXPECTED_SHIELD_COLORS[shield.cls]
        assert(expected !== undefined, `unexpected shield class ${shield.cls}`)
        assert(shield.color === expected, `${shield.cls} color ${shield.color} ≠ ${expected}`)
      }

      // ③ Semantics untouched: one check mark on the current tier only.
      assert(sig.checks === 1, `exactly one tier check expected, saw ${sig.checks}`)

      // ---- capture ---------------------------------------------------------
      const png = await target.webContents.capturePage()
      const file = path.join(visualOutDir(), 'a1-access-menu.png')
      writeFileSync(file, png.toPNG())
      console.log(`VISUAL captured ${file} ${JSON.stringify(sig)}`)

      console.log('VISUAL access-menu done — stacked rows at 8px, orange/gray/green shields, semantics untouched')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL access FAIL', err)
      app.exit(1)
    }
  })()
}
