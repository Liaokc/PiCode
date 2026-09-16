/**
 * Command-card visual-QA harness (ticket 72, spec R1; CONTEXT.md: 技能卡
 * Skill Card). Enabled with PICODE_VISUAL=1 plus PICODE_VISUAL_SKILL_CARD=1.
 * Like the expand harness it asserts its probe results (exit 1 on any
 * violation) and captures the review frames:
 *
 *   sc1-skill-card    — the picked skill as the structured card (violet wand
 *                       icon + name + ×) above the args text — the form the
 *                       pi16-zcode-skill-card reference frame anchors
 *   sc2-template-card — the prompt-template card: same treatment, same slot
 *                       (× first, then a re-pick — the replace path)
 *   sc3-newtask-card  — the SAME card in the New Task empty state (the
 *                       shared-composer rule: both surfaces behave alike)
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with one
 * backdated session whose cwd is a seeded project carrying a REAL .pi skill
 * + prompt template — the session's own resource loader enumerates them, so
 * the frames are staged through the real slash-menu pick path.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the skill-card harness — every other visual harness
 * stands down when it is set. */
export function skillCardVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_SKILL_CARD'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateSkillCardUserData(): void {
  if (!skillCardVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-skillcard-userdata-${process.pid}`))
}

const SKILL_NAME = 'picode-visual-skill'
const TEMPLATE_NAME = 'picode-visual-template'
const ARGS_TEXT = 'PICODE_VISUAL_ARGS follow the grain and keep the card in view'

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

/** React-controlled textarea — set the value through the native setter so
 * onChange fires (the smoke's composerTypeJs pattern). `surface` scopes the
 * composer (the chat view's .chat-dock vs the empty state's .empty-state). */
const typeArgsJs = (text: string, surface = '.chat-dock'): string => `(() => {
  const ta = document.querySelector('${surface} textarea.composer-input')
  if (!(ta instanceof HTMLTextAreaElement)) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta, ${JSON.stringify(text)})
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.focus()
  return true
})()`

export function startSkillCardVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!skillCardVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const project = ensureVisualProjectDir('skill-card-demo')
  // The real resources the resumed session's loader enumerates: one skill,
  // one prompt template — the menu rows the frames are staged from.
  mkdirSync(path.join(project, '.pi', 'skills', SKILL_NAME), { recursive: true })
  writeFileSync(
    path.join(project, '.pi', 'skills', SKILL_NAME, 'SKILL.md'),
    `---\nname: ${SKILL_NAME}\ndescription: Card-flow demo skill\n---\nDemo skill body\n`
  )
  mkdirSync(path.join(project, '.pi', 'prompts'), { recursive: true })
  writeFileSync(
    path.join(project, '.pi', 'prompts', `${TEMPLATE_NAME}.md`),
    `---\ndescription: Card-flow demo template\nargument-hint: [env]\n---\nDemo template body\n`
  )
  const file = writeVisualSession(store, {
    id: 'skillcard-72',
    cwd: project,
    userText: 'Stage the command-card frames for ticket 72'
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
      if (!win) throw new Error('skill-card visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      // Open the seeded session by a real sidebar-row click (tree precedent).
      const rowExpr = `document.querySelector('[data-file="${file}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('skill-card visual: the seeded session never reached the sidebar')
      }
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.chat-dock textarea.composer-input') !== null`, 10_000))) {
        throw new Error('skill-card visual: the chat view composer never opened')
      }

      // The real pick path: type the seeded query, wait for both rows.
      const cmdRowJs = (name: string): string => `(() => {
        const rows = [...document.querySelectorAll('.cmp-popover .cmp-cmd-row')]
        const row = rows.find((r) => (r.querySelector('.cmp-cmd-name')?.textContent ?? '') === '/${name}')
        if (!(row instanceof HTMLElement)) return false
        row.click()
        return true
      })()`
      const cmdRowProbe = (name: string): string => `(() => {
        const rows = [...document.querySelectorAll('.cmp-popover .cmp-cmd-row')]
        return rows.some((r) => (r.querySelector('.cmp-cmd-name')?.textContent ?? '') === '/${name}')
      })()`
      await win.webContents.executeJavaScript(typeArgsJs('/picode-visual'))
      if (
        !(await waitFor(getWindow, `${cmdRowProbe(SKILL_NAME)} && ${cmdRowProbe(TEMPLATE_NAME)}`, 15_000))
      ) {
        throw new Error('skill-card visual: the seeded skill/template rows never reached the `/` menu')
      }
      if (!((await win.webContents.executeJavaScript(cmdRowJs(SKILL_NAME))) as boolean)) {
        throw new Error('skill-card visual: the skill row disappeared before the pick')
      }

      // Frame sc1: the skill card + the args text following it.
      const cardWithName = (name: string): string => `(() => {
        const c = document.querySelector('.chat-dock .composer-command-card')
        return c !== null && c.getAttribute('data-card-name') === ${JSON.stringify(name)}
      })()`
      if (!(await waitFor(getWindow, cardWithName(SKILL_NAME), 5_000))) {
        throw new Error('skill-card visual: the skill pick never staged the command card')
      }
      await win.webContents.executeJavaScript(typeArgsJs(ARGS_TEXT))
      if (!(await waitFor(getWindow, `${cardWithName(SKILL_NAME)} && document.querySelector('.chat-dock textarea.composer-input')?.value === ${JSON.stringify(ARGS_TEXT)}`, 5_000))) {
        throw new Error('skill-card visual: the args text never followed the card')
      }
      await sleep(300)
      await capture(win, 'sc1-skill-card', 'skill card (violet wand + name + ×) above the args text')

      // Frame sc2: × clears, a re-pick REPLACES — the prompt-template card
      // in the same single slot.
      await win.webContents.executeJavaScript(
        `document.querySelector('.chat-dock .composer-command-card-remove')?.click(); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.chat-dock .composer-command-card') === null`, 5_000))) {
        throw new Error('skill-card visual: × never cleared the card')
      }
      await win.webContents.executeJavaScript(typeArgsJs('/picode-visual'))
      if (!(await waitFor(getWindow, cmdRowProbe(TEMPLATE_NAME), 5_000))) {
        throw new Error('skill-card visual: the template row never re-appeared for the re-pick')
      }
      if (!((await win.webContents.executeJavaScript(cmdRowJs(TEMPLATE_NAME))) as boolean)) {
        throw new Error('skill-card visual: the template row disappeared before the re-pick')
      }
      if (!(await waitFor(getWindow, cardWithName(TEMPLATE_NAME), 5_000))) {
        throw new Error('skill-card visual: the re-pick never replaced the card with the template')
      }
      await win.webContents.executeJavaScript(typeArgsJs(ARGS_TEXT))
      if (!(await waitFor(getWindow, `${cardWithName(TEMPLATE_NAME)} && document.querySelector('.chat-dock textarea.composer-input')?.value === ${JSON.stringify(ARGS_TEXT)}`, 5_000))) {
        throw new Error('skill-card visual: the template card never took the args text')
      }
      await sleep(300)
      await capture(win, 'sc2-template-card', 'prompt-template card: same treatment, same single slot')

      // Frame sc3: the New Task empty state — the shared composer stages the
      // same card there (the chip selects the seeded project so the catalog
      // probe enumerates the same two rows; the ticket-52 smoke flow).
      await win.webContents.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.empty-state textarea.composer-input') !== null`, 10_000))) {
        throw new Error('skill-card visual: ⌘N never opened the new-task empty state')
      }
      await win.webContents.executeJavaScript(`document.querySelector('.newtask-chip')?.click(); true`)
      const chipRowProbe = `(() => {
        const rows = [...document.querySelectorAll('.newtask-pop .newtask-row')]
        return rows.some((r) => (r.querySelector('.newtask-row-label')?.textContent ?? '').includes('skill-card-demo'))
      })()`
      if (!(await waitFor(getWindow, chipRowProbe, 10_000))) {
        throw new Error('skill-card visual: the chip dropdown never listed the seeded project')
      }
      await win.webContents.executeJavaScript(
        `(() => {
          const rows = [...document.querySelectorAll('.newtask-pop .newtask-row')]
          const row = rows.find((r) => (r.querySelector('.newtask-row-label')?.textContent ?? '').includes('skill-card-demo'))
          if (!(row instanceof HTMLElement)) return false
          row.click()
          return true
        })()`
      )
      // The catalog probe enumerates the selected directory over IPC — the
      // menu rows land late (the ticket-52 stage's poll pattern).
      const emptyCmdProbe = `(() => {
        const rows = [...document.querySelectorAll('.cmp-popover .cmp-cmd-row')]
        return rows.some((r) => (r.querySelector('.cmp-cmd-name')?.textContent ?? '') === '/${SKILL_NAME}')
      })()`
      await win.webContents.executeJavaScript(typeArgsJs('/picode-visual', '.empty-state'))
      if (!(await waitFor(getWindow, emptyCmdProbe, 45_000))) {
        throw new Error('skill-card visual: the seeded rows never reached the empty-state `/` menu')
      }
      if (!((await win.webContents.executeJavaScript(cmdRowJs(SKILL_NAME))) as boolean)) {
        throw new Error('skill-card visual: the empty-state skill row disappeared before the pick')
      }
      const emptyCardProbe = `(() => {
        const c = document.querySelector('.empty-state .composer-command-card')
        return c !== null && c.getAttribute('data-card-name') === ${JSON.stringify(SKILL_NAME)}
      })()`
      if (!(await waitFor(getWindow, emptyCardProbe, 5_000))) {
        throw new Error('skill-card visual: the empty-state pick never staged the command card')
      }
      await win.webContents.executeJavaScript(typeArgsJs(ARGS_TEXT, '.empty-state'))
      if (!(await waitFor(getWindow, `${emptyCardProbe} && document.querySelector('.empty-state textarea.composer-input')?.value === ${JSON.stringify(ARGS_TEXT)}`, 5_000))) {
        throw new Error('skill-card visual: the empty-state card never took the args text')
      }
      await sleep(300)
      await capture(win, 'sc3-newtask-card', 'New Task empty state: the same card, the same rules')

      console.log('VISUAL skill-card done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL skill-card FAIL', err)
      app.exit(1)
    }
  })()
}
