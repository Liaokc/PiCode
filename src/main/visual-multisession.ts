/**
 * Visual-QA harness for ticket 20 (multi-active sessions): sidebar status-dot
 * states, fixed-slot title alignment, and the refocus catch-up. Enabled with
 * PICODE_VISUAL=1 + PICODE_VISUAL_MULTI=1. NOT part of `npm test` — a human
 * compares the PNGs against the ticket's acceptance line.
 *
 * Unlike the transcript harness (which injects unwrapped events for the
 * focused view alone), this one needs SIDEBAR rows, so it seeds an isolated
 * session store (PICODE_SESSION_DIR temp dir) with three fake sessions the
 * index will list:
 *
 *   A "api-server"  — running IN THIS APP (wrapped agent_start + deltas;
 *                     animated accent dot, even while unfocused)
 *   B "web-app"     — written by ANOTHER END (fresh mtime, no registry
 *                     events; static green dot)
 *   C "api-server"  — hosted here but IDLE (fresh mtime; empty slot — an
 *                     in-app session never shows the TUI green dot)
 *
 * Captures:
 *   m1-multi-dots      — C focused (its settled transcript), A streaming in
 *                        the background: all three dot states in one frame
 *   m2-refocus-caughtup— after clicking A's row: same host, caught-up
 *                        transcript with the live stream resumed on screen
 *
 * Ticket 19 extends the run with the group-hover framework (the api-server
 * group has two seeded sessions, web-app one):
 *   m3-group-hover     — real mouse move onto a group header: the ⋯ / new-task
 *                        actions replace the grip dots (CSS :hover, so the
 *                        harness synthesizes input events, not DOM clicks)
 *   m4-group-menu      — the ⋯ menu open ("Remove from sidebar"), actions
 *                        still visible
 *   m5-group-hidden    — after Remove: the group is gone from the Projects
 *                        list (task rows of the hidden cwd too) while the
 *   m5b-search-hits-hidden — ⌘K palette still lists every hidden-cwd session
 *   m6-hidden-restored — Settings → General restores the group via the
 *                        "Hidden projects" recovery card; back in the
 *   m7-group-restored  — workspace the api-server group is listed again
 *   m8-newtask-preset  — the group's ⊕ action preselects that project's chip
 *
 * Ticket 26 extends the run with the sidebar file browser (the api-server
 * project is now a REAL fixture directory — see ensureVisualProjectFixture
 * — because the tree reads through the actual preview channel):
 *   m9a-filebrowser-root    — hover → "View files": the sidebar swaps to the
 *                        browser (back bar + title bar + root listing with
 *                        hidden entries .git/.gitignore included)
 *   m9b-filebrowser-expanded — clicking src lazy-loads its children through
 *                        the preview channel, type icons per extension
 *   m9c-file-preview   — clicking README.md opens the File Preview tab on
 *                        that path (side panel, existing ticket-07 channel)
 *   m9d-back-to-tasks  — "← Back to tasks" restores the task list, browser
 *                        gone (no residue)
 */

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, multiSessionVisualEnabled, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualProjectFixture, ensureVisualStore, writeVisualSession } from './visual-store'

export { multiSessionVisualEnabled } from './visual'

/** Harness runs must never touch the operator's real preferences — the
 * ticket-19 hide/restore captures drive the REAL settings service (only the
 * IPC-level fake settings could lie about the recovery flow). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateVisualUserData(): void {
  if (!multiSessionVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const RUNNING_ID = 'multi-visual-running'
const TUI_ID = 'multi-visual-tui'
const IDLE_ID = 'multi-visual-idle'
/** REAL tmpdir dir (ticket 42): the cwd-liveness filter drops sessions
 * whose cwd is not a directory on disk; the basename keeps the group label. */
const WEB_CWD = (): string => ensureVisualProjectDir('web-app')
const STREAM_MARKER = 'Count the deploy checklist from one to twenty, one item per line'

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
  const { writeFileSync } = await import('node:fs')
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  const sig = (await win.webContents.executeJavaScript(
    `JSON.stringify((() => ({
      runDots: document.querySelectorAll('.sb-run-dot').length,
      liveDots: document.querySelectorAll('.sb-live-dot').length,
      slots: document.querySelectorAll('.sb-dot-slot').length,
      users: document.querySelectorAll('.msg-user').length,
      assistant: document.querySelectorAll('.msg-assistant').length
    }))())`
  ).catch(() => 'unavailable')) as string
  console.log(`VISUAL captured ${name}.png ${sig}`)
}

async function clickRow(win: BrowserWindow, file: string): Promise<boolean> {
  return (await win.webContents.executeJavaScript(
    `(() => {
      const row = document.querySelector('[data-file="${file}"]')
      if (!row) return false
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`
  ).catch(() => false)) as boolean
}

/** Viewport point of a selector's center (null when absent or not laid out —
 * display:none hover targets measure zero until they are revealed). */
async function rectOf(win: BrowserWindow, selector: string): Promise<{ x: number; y: number } | null> {
  const hit = (await win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!(el instanceof Element)) return null
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return null
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`
  ).catch(() => null)) as { x: number; y: number } | null
  return hit
}

/** Viewport center of the file-browser row with the exact given name
 * (ticket 26) — null when the tree does not show it. */
async function fbRowPoint(win: BrowserWindow, name: string): Promise<{ x: number; y: number } | null> {
  return (await win.webContents.executeJavaScript(
    `(() => {
      const row = [...document.querySelectorAll('.fb-row')].find((el) => el.textContent?.trim() === ${JSON.stringify(name)})
      if (!(row instanceof Element)) return null
      const r = row.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })()`
  ).catch(() => null)) as { x: number; y: number } | null
}

/** Synthesized REAL input events — CSS :hover only follows these, so the
 * hover-state captures move the pointer instead of calling el.click(). */
async function mouseMove(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
}

async function mouseClick(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
}

export function startMultiSessionVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!multiSessionVisualEnabled()) return

  // The session index reads PICODE_SESSION_DIR when it is constructed — this
  // starter runs BEFORE that line in the boot sequence, so seeding here
  // isolates the visual store like the smoke does. The api-server cwd is a
  // REAL fixture directory (ticket 26: the file browser reads it live).
  const store = ensureVisualStore()
  const apiCwd = ensureVisualProjectFixture()
  const runningFile = writeVisualSession(store, {
    id: RUNNING_ID,
    cwd: apiCwd,
    userText: `${STREAM_MARKER}: migration and rollback steps`
  })
  writeVisualSession(store, {
    id: TUI_ID,
    cwd: WEB_CWD(),
    userText: 'Wire the new checkout form to the payments sandbox'
  })
  const idleFile = writeVisualSession(store, {
    id: IDLE_ID,
    cwd: apiCwd,
    userText: 'Draft the changelog entry for the 1.1 release'
  })

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        const w = getWindow()
        if (w) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('multi-session visual harness: no window')
      // Events emitted before the renderer attaches its Seam-1 subscription
      // are lost — wait for the same readiness marker the smoke uses.
      for (let waited = 0; waited < 15_000; waited += 100) {
        const ready = (await win.webContents.executeJavaScript(
          "document.documentElement.dataset['chatSubscribed'] === 'true'"
        ).catch(() => false)) as boolean
        if (ready) break
        await sleep(100)
      }

      // Announce the RUNNING session and start its stream (it will never end
      // during the captures — that is the point: a run in flight).
      emitContractEvent({
        type: 'session_event',
        sessionId: RUNNING_ID,
        event: { type: 'session_created', sessionId: RUNNING_ID, cwd: apiCwd, model: 'claude-opus-4-5', sessionFile: runningFile }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: RUNNING_ID,
        event: { type: 'user_message', text: `${STREAM_MARKER}: migration and rollback steps` }
      })
      emitContractEvent({ type: 'session_event', sessionId: RUNNING_ID, event: { type: 'agent_start' } })
      emitContractEvent({ type: 'session_event', sessionId: RUNNING_ID, event: { type: 'message_start' } })
      for (const delta of ['1. Freeze the release branch. ', '2. Run the full migration in staging. ', '3. Announce the window to the team. ']) {
        emitContractEvent({ type: 'session_event', sessionId: RUNNING_ID, event: { type: 'text_delta', delta } })
        await sleep(60)
      }

      // Announce the IDLE session — focus switches to it (a create always
      // focuses), leaving A streaming in the background.
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'session_created', sessionId: IDLE_ID, cwd: apiCwd, model: 'claude-opus-4-5', sessionFile: idleFile }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'user_message', text: 'Draft the changelog entry for the 1.1 release' }
      })
      emitContractEvent({ type: 'session_event', sessionId: IDLE_ID, event: { type: 'agent_start' } })
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'message_start' }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'text_delta', delta: 'The 1.1 release focuses on daily usability.' }
      })
      emitContractEvent({ type: 'session_event', sessionId: IDLE_ID, event: { type: 'message_end' } })
      emitContractEvent({ type: 'session_event', sessionId: IDLE_ID, event: { type: 'agent_end' } })

      // The index must list the three seeded rows before any dot can render.
      const rows = await waitFor(
        getWindow,
        `document.querySelectorAll('.sb-task').length >= 3`,
        15_000
      )
      if (!rows) throw new Error('multi-session visual: seeded sessions never reached the sidebar')
      await sleep(500)

      // ---- m1: all three dot states in one frame -------------------------
      // A (unfocused, running) = animated; B (other end, fresh mtime) = green;
      // C (focused, idle in-app) = empty slot. All title left edges align.
      await capture(win, 'm1-multi-dots')
      // Pixel-gate measurements: dot vs group folder icon vs title edges.
      const geometry = (await win.webContents.executeJavaScript(
        `JSON.stringify((() => {
          const groupHeader = document.querySelector('.sb-group-header')
          const icon = groupHeader ? groupHeader.querySelector('svg') : null
          const dot = document.querySelector('.sb-run-dot')
          const row = dot ? dot.closest('.sb-task') : null
          const title = row ? row.querySelector('.sb-task-title') : null
          const idleRow = Array.prototype.find.call(
            document.querySelectorAll('.sb-task'),
            (r) => r.querySelector('.sb-dot-slot') !== null && r.querySelector('.sb-run-dot') === null && r.querySelector('.sb-live-dot') === null
          )
          const idleTitle = idleRow ? idleRow.querySelector('.sb-task-title') : null
          const iconRect = icon ? icon.getBoundingClientRect() : null
          const dotRect = dot ? dot.getBoundingClientRect() : null
          const titleRect = title ? title.getBoundingClientRect() : null
          const idleTitleRect = idleTitle ? idleTitle.getBoundingClientRect() : null
          return {
            iconLeft: iconRect ? iconRect.left : null,
            iconRight: iconRect ? iconRect.right : null,
            dotLeft: dotRect ? dotRect.left : null,
            dotRight: dotRect ? dotRect.right : null,
            dotRowTitleLeft: titleRect ? titleRect.left : null,
            idleRowTitleLeft: idleTitleRect ? idleTitleRect.left : null,
            dotLagBehindIcon: iconRect && dotRect ? iconRect.right - dotRect.left : null,
            dotToTitleGap: titleRect && dotRect ? titleRect.left - dotRect.right : null
          }
        })())`
      ).catch((err: unknown) => `PROBE-ERROR: ${String(err)}`)) as string
      console.log(`VISUAL geometry m1 ${geometry}`)

      // ---- m2: refocus the background session ----------------------------
      const clicked = await clickRow(win, runningFile)
      if (!clicked) throw new Error('multi-session visual: running row not clickable')
      const caught = await waitFor(
        getWindow,
        `document.body.textContent.includes('${STREAM_MARKER}') &&
         document.querySelectorAll('.msg-user').length === 1 &&
         document.querySelector('.msg-assistant') !== null`,
        10_000
      )
      if (!caught) throw new Error('multi-session visual: refocus never showed the caught-up transcript')
      await sleep(400)
      await capture(win, 'm2-refocus-caughtup')

      // ---- m3: group hover actions (ticket 19) ---------------------------
      // CSS :hover needs synthesized INPUT events. First rest the pointer on
      // the header's right edge so the (display:none) actions get laid out,
      // then capture the two-button form.
      const headerRect = (await win.webContents.executeJavaScript(
        `(() => {
          const headers = [...document.querySelectorAll('.sb-group-header')]
          const header = headers.find((el) => el.textContent?.includes('api-server'))
          if (!(header instanceof Element)) return null
          const r = header.getBoundingClientRect()
          return { left: r.left, right: r.right, top: r.top, height: r.height }
        })()`
      ).catch(() => null)) as { left: number; right: number; top: number; height: number } | null
      if (!headerRect) throw new Error('multi-session visual: api-server group header not found')
      const headerY = Math.round(headerRect.top + headerRect.height / 2)
      await mouseMove(win, Math.round(headerRect.right) - 24, headerY)
      await sleep(200)
      const hoverRevealed = (await win.webContents.executeJavaScript(
        `(() => {
          const actions = [...document.querySelectorAll('.sb-group-actions')]
          const revealed = actions.find((el) => getComputedStyle(el).display !== 'none')
          return revealed !== undefined
        })()`
      ).catch(() => false)) as boolean
      if (!hoverRevealed) throw new Error('multi-session visual: hover never revealed the group actions')
      const newTaskBtn = await rectOf(win, '[aria-label="New task in api-server"]')
      if (!newTaskBtn) throw new Error('multi-session visual: new-task action never laid out')
      await capture(win, 'm3-group-hover')

      // ---- m4: the ⋯ more-menu ("Remove from sidebar") --------------------
      const moreBtn = await rectOf(win, '[aria-label="Group actions: api-server"]')
      if (!moreBtn) throw new Error('multi-session visual: more-actions button never laid out')
      await mouseMove(win, Math.round(moreBtn.x), Math.round(moreBtn.y))
      await mouseClick(win, Math.round(moreBtn.x), Math.round(moreBtn.y))
      await sleep(300)
      const menuOpen = (await win.webContents.executeJavaScript(
        `document.querySelector('.sb-group-menu')?.textContent ?? ''`
      ).catch(() => '')) as string
      if (!menuOpen.includes('Remove from sidebar')) {
        throw new Error('multi-session visual: group menu never opened')
      }
      await capture(win, 'm4-group-menu')

      // ---- m5: Remove hides the group (locally, recoverably) --------------
      await win.webContents.executeJavaScript(
        `(() => {
          const item = document.querySelector('.sb-group-menu-item')
          if (item instanceof HTMLElement) item.click()
          return true
        })()`
      )
      await sleep(400)
      // Move the pointer off the list so no unrelated header shows actions.
      await mouseMove(win, 10, 300)
      await sleep(200)
      const hiddenSig = (await win.webContents.executeJavaScript(
        `JSON.stringify((() => ({
          apiHeaders: [...document.querySelectorAll('.sb-group-header')].filter((el) => el.textContent?.includes('api-server')).length,
          apiRows: [...document.querySelectorAll('.sb-task')].filter((el) => (el.getAttribute('data-file') ?? '').includes('api-server')).length,
          webHeaders: [...document.querySelectorAll('.sb-group-header')].filter((el) => el.textContent?.includes('web-app')).length,
          toast: document.querySelector('.toast')?.textContent ?? ''
        }))())`
      ).catch(() => 'unavailable')) as string
      console.log(`VISUAL m5 signature ${hiddenSig}`)
      const hidden = JSON.parse(hiddenSig) as { apiHeaders: number; apiRows: number; webHeaders: number; toast: string }
      if (hidden.apiHeaders !== 0 || hidden.apiRows !== 0 || hidden.webHeaders !== 1) {
        throw new Error(`multi-session visual: hiding the group left ${hiddenSig}`)
      }
      await capture(win, 'm5-group-hidden')

      // ---- m5b: ⌘K still reaches every hidden-cwd session -----------------
      await win.webContents.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }))`
      )
      await sleep(400)
      const paletteItems = (await win.webContents.executeJavaScript(
        `document.querySelectorAll('.palette-item').length`
      ).catch(() => 0)) as number
      if (paletteItems < 3) {
        throw new Error(`multi-session visual: ⌘K listed ${paletteItems} items after hiding — hidden sessions must stay searchable`)
      }
      await capture(win, 'm5b-search-hits-hidden')
      // The palette closes on Escape AT ITS FOCUSED INPUT (a window-level
      // dispatch never reaches that handler) — fire it where a user's
      // keystroke lands, then prove it is gone before the next stage.
      await win.webContents.executeJavaScript(
        `(() => {
          const input = document.querySelector('.palette-input')
          if (input instanceof HTMLElement) {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
          }
          return true
        })()`
      )
      await sleep(300)
      const paletteGone = (await win.webContents.executeJavaScript(
        `document.querySelector('.palette-overlay') === null`
      ).catch(() => false)) as boolean
      if (!paletteGone) throw new Error('multi-session visual: ⌘K palette never closed')

      // ---- m6: Settings → General restores the hidden group ---------------
      const settingsBtn = await rectOf(win, '[aria-label="Settings"]')
      if (!settingsBtn) throw new Error('multi-session visual: settings gear not found')
      await win.webContents.executeJavaScript(
        `(() => {
          const gear = document.querySelector('[aria-label="Settings"]')
          if (gear instanceof HTMLElement) gear.click()
          return true
        })()`
      )
      await sleep(600)
      const generalNav = (await win.webContents.executeJavaScript(
        `(() => {
          const item = [...document.querySelectorAll('.settings-item')].find((el) => el.textContent?.trim() === 'General')
          if (item instanceof HTMLElement) item.click()
          return item !== undefined
        })()`
      ).catch(() => false)) as boolean
      if (!generalNav) throw new Error('multi-session visual: settings General nav not found')
      await sleep(400)
      const hiddenRow = (await win.webContents.executeJavaScript(
        `(() => {
          const rows = [...document.querySelectorAll('.settings-hidden-row')]
          return rows.some((el) => el.textContent?.includes('api-server'))
        })()`
      ).catch(() => false)) as boolean
      if (!hiddenRow) throw new Error('multi-session visual: hidden-projects recovery row missing')
      // The recovery card WITH the hidden project listed (pre-restore).
      await capture(win, 'm6a-hidden-projects-card')
      await win.webContents.executeJavaScript(
        `(() => {
          const rows = [...document.querySelectorAll('.settings-hidden-row')]
          const row = rows.find((el) => el.textContent?.includes('api-server'))
          const restore = row?.querySelector('.settings-fixed-pick')
          if (restore instanceof HTMLElement) restore.click()
          return true
        })()`
      )
      await sleep(500)
      const restoredNote = (await win.webContents.executeJavaScript(
        `document.body.textContent.includes('No hidden projects')`
      ).catch(() => false)) as boolean
      if (!restoredNote) throw new Error('multi-session visual: restore did not clear the hidden list')
      await capture(win, 'm6-hidden-restored')

      // ---- m7: back in the workspace the group is listed again ------------
      await win.webContents.executeJavaScript(
        `(() => {
          const back = document.querySelector('.settings-back')
          if (back instanceof HTMLElement) back.click()
          return true
        })()`
      )
      await sleep(600)
      const groupBack = (await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.sb-group-header')].some((el) => el.textContent?.includes('api-server'))`
      ).catch(() => false)) as boolean
      if (!groupBack) throw new Error('multi-session visual: restored group never reappeared')
      await capture(win, 'm7-group-restored')

      // ---- m8: the group's ⊕ action preselects the new-task chip ----------
      // React state (not CSS hover) drives the click-through. The probe is
      // deliberately against the OTHER project: the focused session is an
      // api-server one, so the ticket-17 chain default would read api-server
      // — only the group preset can make the chip read web-app.
      await win.webContents.executeJavaScript(
        `(() => {
          const btn = document.querySelector('[aria-label="New task in web-app"]')
          if (btn instanceof HTMLElement) btn.click()
          return true
        })()`
      )
      await sleep(500)
      const chip = (await win.webContents.executeJavaScript(
        `document.querySelector('.newtask-chip span')?.textContent ?? ''`
      ).catch(() => '')) as string
      if (chip !== 'web-app') {
        throw new Error(`multi-session visual: new-task chip shows "${chip}" — expected the group's project (web-app)`)
      }
      await capture(win, 'm8-newtask-preset')

      // ---- m9a: "View files" swaps the sidebar to the file browser -------
      // (ticket 26). Hover reveals the actions (CSS :hover — real input
      // events, the m3 pattern), then a real click on the middle button.
      const headerPoint = (await win.webContents.executeJavaScript(
        `(() => {
          const header = [...document.querySelectorAll('.sb-group-header')].find((el) => el.textContent?.includes('api-server'))
          if (!(header instanceof Element)) return null
          const r = header.getBoundingClientRect()
          return { x: Math.round(r.right) - 24, y: Math.round(r.top + r.height / 2) }
        })()`
      ).catch(() => null)) as { x: number; y: number } | null
      if (!headerPoint) throw new Error('multi-session visual: api-server header missing before the browser capture')
      await mouseMove(win, headerPoint.x, headerPoint.y)
      await sleep(200)
      const viewFilesBtn = await rectOf(win, '[aria-label="View files in api-server"]')
      if (!viewFilesBtn) throw new Error('multi-session visual: view-files action never laid out')
      await mouseClick(win, Math.round(viewFilesBtn.x), Math.round(viewFilesBtn.y))
      const browserShown = await waitFor(
        getWindow,
        `(() => {
          const browser = document.querySelector('.fb-browser')
          if (!browser) return false
          const names = [...document.querySelectorAll('.fb-row')].map((el) => el.textContent?.trim() ?? '')
          return document.querySelector('[aria-label="Back to tasks"]') !== null &&
            document.querySelector('.fb-title-name')?.textContent === 'api-server' &&
            names.includes('src') && names.includes('.git') &&
            names.includes('.gitignore') && names.includes('README.md')
        })()`,
        10_000
      )
      if (!browserShown) throw new Error('multi-session visual: file browser never rendered the root listing')
      await capture(win, 'm9a-filebrowser-root')

      // ---- m9b: expanding src lazy-loads through the preview channel ------
      const srcRow = await fbRowPoint(win, 'src')
      if (!srcRow) throw new Error('multi-session visual: src row missing')
      await mouseClick(win, srcRow.x, srcRow.y)
      const srcLoaded = await waitFor(
        getWindow,
        `(() => {
          const names = [...document.querySelectorAll('.fb-row')].map((el) => el.textContent?.trim() ?? '')
          return names.includes('App.tsx') && names.includes('index.ts') && names.includes('host')
        })()`,
        10_000
      )
      if (!srcLoaded) throw new Error('multi-session visual: src children never lazy-loaded')
      const iconSig = (await win.webContents.executeJavaScript(
        `JSON.stringify((() => ({
          folders: document.querySelectorAll('.fb-icon-folder').length,
          code: document.querySelectorAll('.fb-icon-code').length,
          git: document.querySelectorAll('.fb-icon-git').length
        }))())`
      ).catch(() => 'unavailable')) as string
      console.log(`VISUAL m9b icons ${iconSig}`)
      await capture(win, 'm9b-filebrowser-expanded')

      // ---- m9c: a file click deep-links the File Preview tab --------------
      const readmeRow = await fbRowPoint(win, 'README.md')
      if (!readmeRow) throw new Error('multi-session visual: README.md row missing')
      await mouseClick(win, readmeRow.x, readmeRow.y)
      const previewOpen = await waitFor(
        getWindow,
        `document.querySelector('.preview-crumbs')?.textContent?.includes('README.md') === true`,
        10_000
      )
      if (!previewOpen) throw new Error('multi-session visual: file click never opened the File Preview tab')
      await capture(win, 'm9c-file-preview')

      // ---- m9d: Back to tasks restores the list, browser gone -------------
      const backBtn = await rectOf(win, '[aria-label="Back to tasks"]')
      if (!backBtn) throw new Error('multi-session visual: back button missing')
      await mouseClick(win, Math.round(backBtn.x), Math.round(backBtn.y))
      const restored = await waitFor(
        getWindow,
        `document.querySelector('.fb-browser') === null && document.querySelectorAll('.sb-task').length >= 3`,
        10_000
      )
      if (!restored) throw new Error('multi-session visual: back-to-tasks never restored the task list')
      await capture(win, 'm9d-back-to-tasks')

      console.log('VISUAL multi-session done')
      const { app } = await import('electron')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL multi-session FAIL', err)
      const { app } = await import('electron')
      app.exit(1)
    }
  })()
}
