/**
 * Real-Electron smoke of the live chat loop (ticket 02 acceptance). Enabled
 * only with PICODE_SMOKE=1; drives the supervisor directly so the whole
 * main→host→Pi SDK→streaming pipeline runs for real:
 *
 *   create session → prompt → first text deltas → abort → agent_end
 *   → second prompt → streamed text → host SIGKILL → host_exit(!clean)
 *   → rebuild session → clean shutdown → quit(0)
 *
 * Ticket 14 adds the structured-replay stage: a simulated TUI turn carrying
 * thinking + tool traffic is appended to a session file and must replay —
 * through the Live Follow view first, then through a full resume — as
 * collapsed turn containers with settled thinking rows and tool cards,
 * isomorphic to live. Ticket 23 adds the turn-fold gate: replayed AND
 * followed turns arrive as collapsed "Worked · Ns ›" containers; the stages
 * open them before auditing the inner rows.
 * Ticket 24 extends the Live Follow stage into the takeover chain: the follow
 * view renders the structured turn (markdown / thinking / tool cards), shows
 * no Open while the session is live, shows Open once it goes quiet, REJECTS
 * a click with a toast when the TUI woke up again (fresh-mtime re-check),
 * and otherwise resumes the session in full — auto-switching to the chat
 * view with no duplicate content.
 *
 * Ticket 20 adds the multi-active-sessions stage: several hosts stay alive
 * while focus switches (registry semantics, ADR-0006), a background session
 * keeps streaming, the sidebar shows fixed-slot dot states, switching back
 * is a same-pid focus change with a caught-up transcript and no duplicates,
 * a targeted abort settles it, a SIGKILLed host isolates its crash to its
 * own session, and shutdownAll leaves zero orphaned processes.
 *
 * Ticket 25 adds the background-approval stage: a gate hit in a background
 * session parks the pill inside that session (the agent stays suspended —
 * nothing auto-approves), lights the sidebar's orange badge, and requests
 * the OS notification; the notification's click path foregrounds the window
 * and focuses the session, where the SAME approve/deny controls work as in
 * the foreground — Approve & Remember sticks (no second ask), and deny
 * terminates the round, round-trips the reason, and updates the transcript.
 *
 * Ticket 27 adds the keymap-remap stage: the four titlebar tooltips carry
 * R1 keycaps (⌘B / ⌥⌘B / ⌘J / ⌥⌘J) and the four chords — dispatched as
 * physical-key events (code + modifiers only) — toggle sidebar, side
 * panel, terminal dock and bridge dock.
 *
 * Ticket 28 adds the selection-follows-view and unread assertions: the
 * followed row carries the selected styling while the focused row reverts
 * (clicking the focused row exits Follow and the highlight follows back), a
 * running-in-background row keeps its animated dot with a plain background,
 * and a background turn lights the indigo unread dot once settled — masked
 * by the animated dot while in flight — until the session is focused again.
 *
 * Ticket 35 adds the context-menu + archive stage: hovering a settled row
 * reveals the archive button in the dot slot (real-input hover — the CSS
 * gate follows real moves only), archiving hides the row from both sidebar
 * views (toast confirms), the trash button swaps to the archive view where
 * one click restores the row, the right-click menu shows the nine entries
 * in ZCode order, and the copy actions fire the read-only context-action
 * IPC (asserted against main's bounded action log).
 *
 * Ticket 38 adds the retired-slash stage: the `/` menu lists only the
 * retained built-in (/compact), typing a retired command bare or with
 * arguments raises the pointer toast, and the session sees ZERO new
 * messages across the gated sends (stage-local user_message observer).
 * Ticket 39 adds the group-fold stage: a seeded 12-session project group
 * drives the whole fold/pagination shape table in the sidebar — Show more
 * steps +5, full expansion flips the control to "Show less", Show less
 * resets to the initial five in one click, the group row's click folds ALL
 * rows and unfolding restores the pre-fold step, no caret remains, the
 * folded header stays count-free, and a renderer reload (the restart
 * proxy) returns the group to the default shape — shapes are memory-level,
 * never persisted.
 *
 * Ticket 53 adds the answer-split stage (at the tail of the run, a settled
 * structured replay injected through the contract stream — the visual-perf
 * precedent, no model call): the settled long turn's answer is its LAST
 * text block only, the earlier narration folds into the Worked container
 * (hidden collapsed, work rows when opened) and the tool that ran after
 * the answer stays visible below it, outside the fold.
 *
 * Ticket 57 extends the composer-expand stage with the global ⌘E chord:
 * a new KeyE row in the ticket-27 keymap table routes to whichever
 * composer is mounted, so the chord toggles BOTH composers' expanded
 * state (re-press retracts), and the expand button's tooltip carries the
 * ⌘E keycap only (Tooltip discipline).
 *
 * Ticket 68 adds the menu-surface stage right after the retired-slash
 * stage: the shared trigger surface — a multi-line `/` report never
 * haunts the composer with a menu (open only while the caret sits inside
 * the leading token), a mid-text @ never opens the file menu, zero
 * matches render NO menu at all, and Enter on a zero-match /skill:...
 * sends the raw text straight through to the SDK (user_message observed,
 * no retired-slash toast, composer cleared).
 *
 * Ticket 74 adds the draft-preservation stage: the typed-but-unsent
 * composer content (text + pasted images) survives every view switch —
 * A/B per-session slots stay isolated across pure focus switches (which
 * also used to LEAK the outgoing composer into the incoming session: the
 * same Composer instance simply stayed mounted), a pasted-image draft
 * round-trips with its thumbnail, the New Task single slot survives
 * ⌘N → session → ⌘N and Escape, both send paths clear their slot
 * naturally, and a renderer reload (the restart proxy) loses every draft
 * — memory-level by design.
 * Ticket 69 adds the menu-keyboard stage right after it: ONE keyboard
 * rule for every composer menu — the text menus (keys intercepted at the
 * textarea) and the chip menus (keys inside the focused popover) all
 * clamp at both ends (no wrap, no unbounded ArrowDown), Enter picks
 * through the single pick path (the @ menu inserts the mention, the
 * access menu lands on the highlighted tier), Escape closes, and the
 * selected row always sits inside the visible list (scroll follow,
 * pi16-menu-no-scroll).
 *
 * Ticket 72 adds the command-card stage after the draft-preservation stage
 * (CONTEXT.md: 技能卡 Skill Card; after ticket-20's crash isolation like
 * every stage that resumes a seeded session — the legacy crash-isolation
 * stage SIGKILLs the most recently spawned host and waits for the FIRST
 * session's host_exit, so a resume before it would break that pairing):
 * picking a seeded skill renders the structured card (violet wand icon +
 * name + ×) instead of raw text, the args text follows it, × removes the
 * card (args preserved), and a re-pick — the seeded prompt template —
 * REPLACES the card (single slot). The send recombines `/skill:name args`
 * and the SDK's own expansion proves the byte-identical form: the
 * persisted user message is the skill prologue plus the exact args (a real
 * in-session turn).
 *
 * Ticket 70 adds the chip-toggle stage right after it: REAL chip presses
 * (mousedown, mouseup, click — click() alone never fires mousedown, which
 * is why the race hid from this suite) replay the chip-popover toggle
 * race for each of the three chips — the mousedown half of a second press
 * on the OWNING chip must not close its menu (the outside-close anchor
 * exemption) while the completing click must (the toggle) — and a click
 * inside the popover still picks while a real outside press still closes
 * for good.
 *
 * Any missed step times out and exits non-zero. Progress logs as
 * `SMOKE <step>` lines on stdout. Not part of `npm test`.
 */

import os, { homedir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { app, clipboard, type BrowserWindow } from 'electron'
import type { HostSupervisor } from './host-supervisor'
import { focusSessionFromNotification, type ApprovalNotice } from './notifications'
import type { HostToParent, SessionScopedEvent } from '../shared/contract'
import type { AuthProbeReport } from '../shared/auth-status'
import { configuredProviderIds, sortProvidersConfiguredFirst } from '../shared/provider-sort'
import { projectNewTaskCatalog } from '../shared/new-task-models'
import { FOLLOW_TAKEOVER_REJECTED_TOAST } from '../shared/sessions/group'
import { CWD_MISSING_ROW_TOAST } from '../shared/sessions/cwd-liveness'
import { EDIT_RESEND_TOAST } from '../shared/edit-resend'
import type { SessionContextActionService } from './sessions/context-actions'
import { emitContractEvent } from './visual'
import { chmodSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const STEP_TIMEOUT_MS = 90_000
const ABORT_AFTER_DELTAS = 3

/** Marker prompt of the ticket-20 multi-session stage (unique in the DOM). */
const MULTI_MARKER = 'PICODE_MULTI_SESSION_ONE'

/** Markers of the ticket-25 background-approval stage. */
const BG_APPROVAL_MARKER = 'PICODE_BG_APPROVAL'
const BG_REMEMBER_MARKER = 'PICODE_BG_REMEMBERED'
const BG_DENY_MARKER = 'PICODE_BG_DENY'
const BG_DENY_REASON = 'No new files today.'

// ---- composer DOM drivers (shared by the ticket-41 and ticket-38 stages):
// React-controlled textarea — set the value through the native setter so
// onChange fires, like the visual harness does. ----
const composerTypeJs = (text: string): string => `(() => {
  const ta = document.querySelector('.composer-input')
  if (!(ta instanceof HTMLTextAreaElement)) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta, ${JSON.stringify(text)})
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.focus()
  return true
})()`
const composerKeyJs = (key: string, mods: Record<string, boolean> = {}): string => `(() => {
  const ta = document.querySelector('.composer-input')
  if (!(ta instanceof HTMLTextAreaElement)) return false
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true, cancelable: true, ...${JSON.stringify(mods)} }))
  return true
})()`
const composerClearJs = `(() => {
  const ta = document.querySelector('.composer-input')
  if (!(ta instanceof HTMLTextAreaElement)) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta, '')
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

/** Click the composer chip whose aria-label starts with the given prefix
 * (the model/thinking chips are uniquely addressable that way). */
const composerChipClickJs = (ariaPrefix: string): string => `(() => {
  const chip = document.querySelector('.cmp-chip[aria-label^=${JSON.stringify(ariaPrefix)}]')
  if (!(chip instanceof HTMLElement)) return false
  chip.click()
  return true
})()`

/** Ticket 70: a REAL press on the chip whose aria-label starts with the
 * prefix — mousedown, mouseup, click, in order, all bubbling (the synthetic
 * click() above never fires mousedown, which is exactly why the chip-popover
 * open/close race could hide from this suite). Mid-press splits:
 * chipDownJs fires only the mousedown; chipPressCompletionJs finishes the
 * press with mouseup + click — so a stage can probe the world BETWEEN the
 * two halves of a real press. */
const composerChipEventJs = (ariaPrefix: string, type: string): string => `(() => {
  const chip = document.querySelector('.cmp-chip[aria-label^=${JSON.stringify(ariaPrefix)}]')
  if (!(chip instanceof HTMLElement)) return false
  const r = chip.getBoundingClientRect()
  chip.dispatchEvent(new MouseEvent('${type}', {
    bubbles: true, cancelable: true,
    clientX: r.x + r.width / 2, clientY: r.y + r.height / 2
  }))
  return true
})()`
const composerChipDownJs = (ariaPrefix: string): string => composerChipEventJs(ariaPrefix, 'mousedown')
const composerChipPressCompletionJs = (ariaPrefix: string): string =>
  [composerChipEventJs(ariaPrefix, 'mouseup'), composerChipEventJs(ariaPrefix, 'click')].join(';\n')
const composerChipPressJs = (ariaPrefix: string): string =>
  [composerChipDownJs(ariaPrefix), composerChipPressCompletionJs(ariaPrefix)].join(';\n')

/** Ticket 83: a REAL press on the topbar History button (the TreePanel's
 * owning trigger), split exactly like the chip press helpers above — the
 * synthetic click() the ticket-43 stage uses never fires mousedown, which
 * is exactly where the close-reopen toggle race hides. Mid-press splits:
 * historyBtnDownJs fires only the mousedown; historyBtnPressCompletionJs
 * finishes mouseup + click — a stage can probe BETWEEN the two halves. */
const historyBtnEventJs = (type: string): string => `(() => {
  const btn = [...document.querySelectorAll('.chat-topbar-btn')].find((el) => el.textContent?.includes('History'))
  if (!(btn instanceof HTMLElement)) return false
  const r = btn.getBoundingClientRect()
  btn.dispatchEvent(new MouseEvent('${type}', {
    bubbles: true, cancelable: true,
    clientX: r.x + r.width / 2, clientY: r.y + r.height / 2
  }))
  return true
})()`
const historyBtnDownJs = (): string => historyBtnEventJs('mousedown')
const historyBtnPressCompletionJs = (): string =>
  [historyBtnEventJs('mouseup'), historyBtnEventJs('click')].join(';\n')
const historyBtnPressJs = (): string => [historyBtnDownJs(), historyBtnPressCompletionJs()].join(';\n')

/** The aria-label of the chip whose aria-label starts with the prefix ('' = absent). */
const composerChipLabelJs = (ariaPrefix: string): string =>
  `document.querySelector('.cmp-chip[aria-label^=${JSON.stringify(ariaPrefix)}]')?.getAttribute('aria-label') ?? ''`

/** Click the open menu's row whose .cmp-menu-title equals the given text
 * (the flat menus — access/thinking — render one row per entry). */
const pickAccessRowJs = (title: string): string => `(() => {
  const rows = [...document.querySelectorAll('.cmp-popover .cmp-menu-list .cmp-menu-row')]
  const row = rows.find((r) => (r.querySelector('.cmp-menu-title')?.textContent ?? '') === ${JSON.stringify(title)})
  if (!(row instanceof HTMLElement)) return false
  row.click()
  return true
})()`

/** Ticket 80 probe: the access chip shows exactly this tier, with the
 * "default" tag present/absent. Self-contained (no ?? composition — the
 * label helper's `?? ''` cannot mix with && unparenthesized). */
const accessChipIsJs = (label: string, tagged: boolean): string => `(() => {
  const chip = document.querySelector('.cmp-chip[aria-label^="Access mode:"]')
  if (!(chip instanceof HTMLElement)) return false
  const hasTag = chip.querySelector('.cmp-chip-default') !== null
  return chip.getAttribute('aria-label') === ${JSON.stringify(label)} && hasTag === ${tagged}
})()`

export function smokeEnabled(): boolean {
  return process.env['PICODE_SMOKE'] === '1'
}

/** What the smoke exposes to main (index.ts): the host-event tap plus the
 * notification-notice tap (ticket 25 asserts the notification pipeline).
 * Ticket 76 adds the cached auth-probe report getter — the exact report the
 * renderer joined for the provider order, so the order assertions compute
 * their expectation from the same source the UI used. */
export interface SmokeHooks {
  onHostEvent: (event: HostToParent) => void
  onApprovalNotice: (notice: ApprovalNotice) => void
  getAuthReport: () => Promise<AuthProbeReport | null>
}

/** Every event the smoke sees carries its session scope: the supervisor
 * wraps host events in `session_event` (ticket 20), and the tap flattens
 * that onto the scoped event so matchers can address a session. */
type Scoped = SessionScopedEvent & { sessionId: string }

interface Waiter {
  match: (event: Scoped) => boolean
  label: string
  resolve: (event: Scoped) => void
  timer: NodeJS.Timeout
}

/**
 * Drive the smoke sequence against `supervisor` and return hooks for host
 * events and approval notices (waiters only; the caller keeps forwarding
 * events to the renderer). `actions` is the ticket-35 context-action
 * service: the smoke asserts the session-row menu's copy/reveal IPC
 * actually fired. Returns null when PICODE_SMOKE is unset.
 */
export function startSmokeIfEnabled(
  supervisor: HostSupervisor,
  getWindow: () => BrowserWindow | null,
  actions?: SessionContextActionService | null,
  getAuthReport?: () => Promise<AuthProbeReport | null>
): SmokeHooks | null {
  if (!smokeEnabled()) return null
  const cwd = process.env['PICODE_SMOKE_CWD'] || os.tmpdir()
  const waiters = new Set<Waiter>()
  const approvalNotices: ApprovalNotice[] = []
  const log = (step: string, detail = ''): void => console.log(`SMOKE ${step}${detail ? ` ${detail}` : ''}`)

  const fail: (message: string) => never = (message) => {
    console.error(`SMOKE FAIL ${message}`)
    console.error(`SMOKE FAIL recent events: ${recentEvents.join(' | ') || '(none)'}`)
    app.exit(1)
    throw new Error(`SMOKE FAIL ${message}`)
  }

  /** Ring buffer of the last scoped events — dumped on failure so a timeout
   * says WHAT actually arrived instead of just what never did. */
  const recentEvents: string[] = []
  const noteEvent = (scoped: Scoped): void => {
    const detail =
      scoped.type === 'approval_resolved'
        ? `(${String(scoped.approved)}:${scoped.reason ?? '-'})`
        : scoped.type === 'session_created'
          ? `(${scoped.sessionFile ?? 'no-file'})`
          : ''
    recentEvents.push(`${scoped.sessionId.slice(-6)}:${scoped.type}${detail}`)
    if (recentEvents.length > 40) recentEvents.shift()
  }

  /** Stage-local observers (ticket 25 negative assertions need to SEE that
   * an event never came, not just wait for ones that must). */
  const observers: Array<(event: Scoped) => void> = []

  function onHostEvent(event: HostToParent): void {
    // Flatten the ticket-20 wrapping: scoped events reach matchers tagged
    // with the session they belong to.
    const scoped: Scoped = (
      event.type === 'session_event' ? { ...event.event, sessionId: event.sessionId } : { ...event, sessionId: '' }
    ) as Scoped
    for (const waiter of [...waiters]) {
      if (waiter.match(scoped)) {
        clearTimeout(waiter.timer)
        waiters.delete(waiter)
        waiter.resolve(scoped)
      }
    }
    noteEvent(scoped)
    for (const observe of observers) observe(scoped)
  }

  function waitFor(match: (event: Scoped) => boolean, label: string): Promise<Scoped> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match,
        label,
        resolve: resolve as (event: Scoped) => void,
        timer: setTimeout(() => {
          waiters.delete(waiter)
          reject(new Error(`${label} timed out after ${STEP_TIMEOUT_MS}ms`))
        }, STEP_TIMEOUT_MS)
      }
      waiter.timer.unref?.()
      waiters.add(waiter)
    })
  }

  async function main(): Promise<void> {
    log('start', `cwd=${cwd} pid=${process.pid}`)

    // ---- ticket 41: the new-task empty state — the model menu lists the
    // REAL auth-probe catalog, the thinking menu offers all seven levels,
    // the chip shows the chained default (Pi's fallback, tagged), and a
    // pick made here rides create_session's defaults. Round 1 is created BY
    // the renderer's empty-state send; the first prompt still rides the
    // pending chain. ----
    log('empty_state_start')
    // The smoke's main() starts before the window exists (index.ts wires the
    // hooks during app setup, creates the window on whenReady) — poll for it.
    let smokeWin: BrowserWindow | null = null
    for (let waited = 0; waited < 30_000 && smokeWin === null; waited += 100) {
      smokeWin = getWindow()
      if (smokeWin === null) await new Promise((r) => setTimeout(r, 100))
    }
    if (smokeWin === null) fail('smoke window missing for the empty-state stage')
    const win = smokeWin
    let pickedModelId: string | null = null
    {
      const modelPrefix = 'Model:'

      // ① The chained default reaches the chip once the probe catalog lands:
      // a real model (never the dead placeholder), tagged "default" — the
      // smoke's isolated settings carry no PiCode preference, so Pi's own
      // fallback shows.
      let chipLabel = ''
      for (let waited = 0; waited < 60_000; waited += 200) {
        chipLabel = (await win.webContents.executeJavaScript(composerChipLabelJs(modelPrefix)).catch(() => '')) as string
        if (chipLabel.startsWith(modelPrefix)) break
        await new Promise((r) => setTimeout(r, 200))
      }
      if (!chipLabel.startsWith(modelPrefix)) fail('the empty-state model chip never showed the chained default')
      const tagged = (await win.webContents.executeJavaScript(
        `document.querySelector('.cmp-chip[aria-label^="${modelPrefix}"] .cmp-chip-default')?.textContent ?? ''`
      ).catch(() => '')) as string
      if (tagged !== 'default') fail('the chained-default chip does not carry the default tag')
      log('empty_state_chip_default_ok', chipLabel)

      // ② The model menu lists the real catalog (the probe ran against this
      // machine's Pi registry): at least one provider and one model row.
      if (!(await win.webContents.executeJavaScript(composerChipClickJs(modelPrefix)).catch(() => false))) {
        fail('the model chip is missing for the empty-state stage')
      }
      let providerRows = 0
      let modelRows: string[] = []
      for (let waited = 0; waited < 5_000; waited += 100) {
        const cols = (await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.cmp-popover .cmp-cascade-col')].map((col) => [...col.querySelectorAll('.cmp-menu-title')].map((n) => n.textContent ?? ''))`
        ).catch(() => [])) as string[][]
        if (cols.length >= 2) {
          providerRows = cols[0]!.length
          modelRows = cols[1]!
          if (providerRows > 0 && modelRows.length > 0) break
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      if (providerRows === 0) fail('the empty-state model menu lists no providers')
      if (modelRows.length === 0) fail('the empty-state model menu lists no models')
      log('empty_state_menu_catalog_ok', `providers=${providerRows} models=${modelRows.length}`)

      // ②b (ticket 76): the provider column is ordered configured-first,
      // alphabetical within each group, joined from the SAME auth report
      // the settings service cached (zero new contract — the expectation
      // is computed from that report, so the check holds on any machine:
      // all-configured ⇒ pure alphabetical; missing report ⇒ registry
      // order). The current provider is also located and check-marked on
      // open — the chip's chained default (the report's first configured
      // provider, report order).
      {
        const authReport = getAuthReport ? await getAuthReport() : null
        if (authReport === null) fail('the smoke could not read the cached auth report for the ticket-76 order check')
        const sortedGroups = sortProvidersConfiguredFirst(
          projectNewTaskCatalog(authReport).providers,
          configuredProviderIds(authReport)
        )
        const expectedProviders = sortedGroups.map((group) => group.name)
        let menuCols: string[][] = []
        for (let waited = 0; waited < 5_000; waited += 100) {
          menuCols = (await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('.cmp-popover .cmp-cascade-col')].map((col) => [...col.querySelectorAll('.cmp-menu-row')].map((n) => n.textContent ?? ''))`
          ).catch(() => [])) as string[][]
          if (menuCols.length >= 2 && menuCols[0]!.length > 0) break
          await new Promise((r) => setTimeout(r, 100))
        }
        const providerTitles = menuCols[0] ?? []
        if (JSON.stringify(providerTitles) !== JSON.stringify(expectedProviders)) {
          fail(`ticket-76 order: provider column ${JSON.stringify(providerTitles)} != expected ${JSON.stringify(expectedProviders)}`)
        }
        const located = (await win.webContents.executeJavaScript(
          `(() => {
            const rows = [...(document.querySelector('.cmp-popover .cmp-cascade-col')?.querySelectorAll('.cmp-menu-row') ?? [])]
            return {
              checked: rows.findIndex((r) => r.querySelector('.cmp-menu-check') !== null),
              selected: rows.findIndex((r) => r.classList.contains('cmp-menu-row-selected'))
            }
          })()`
        ).catch(() => null)) as { checked: number; selected: number } | null
        const fallback = projectNewTaskCatalog(authReport).piFallback
        if (fallback === null) fail('ticket-76: the chip default resolved but the report has no configured provider')
        const expectedCurrent = authReport.providers.find((p) => p.providerId === fallback?.providerId)?.name
        if (located === null) fail('ticket-76: the provider column never rendered rows for the highlight check')
        if (located.checked < 0 || located.selected < 0 || located.checked !== located.selected) {
          fail(`ticket-76: the current provider is not located+highlighted (checked=${located.checked}, selected=${located.selected})`)
        }
        if (providerTitles[located.checked] !== expectedCurrent) {
          fail(`ticket-76: the check-marked provider ${JSON.stringify(providerTitles[located.checked])} != current ${JSON.stringify(expectedCurrent)}`)
        }
        log('empty_state_menu_provider_order_ok', `${expectedProviders.join(',')}`)
        log('empty_state_menu_locate_ok', `${expectedCurrent} at row ${located.checked}`)
      }

      // ③ Pick a model from the menu. With ≥2 models in the active provider
      // (the chained default's own, so credentials exist) pick the second
      // row — a REAL override — and wait for the chip to change; otherwise
      // re-pick the check-marked default row. The chip label then carries
      // the picked model id.
      const pickRow = (index: number | 'checked'): string =>
        `(() => {
          const cols = document.querySelectorAll('.cmp-popover .cmp-cascade-col')
          const rows = [...(cols[1]?.querySelectorAll('.cmp-menu-row') ?? [])]
          const row = ${index === 'checked' ? 'rows.find((r) => r.querySelector(\'.cmp-menu-check\'))' : `rows[${index}]`}
          if (!(row instanceof HTMLElement)) return false
          row.click()
          return true
        })()`
      const override = modelRows.length >= 2
      const pickJs = override ? pickRow(1) : pickRow('checked')
      if (!(await win.webContents.executeJavaScript(pickJs).catch(() => false))) {
        fail('the model menu never offered a pickable row')
      }
      let afterLabel = chipLabel
      for (let waited = 0; waited < 5_000 && override; waited += 100) {
        afterLabel = (await win.webContents.executeJavaScript(composerChipLabelJs(modelPrefix)).catch(() => '')) as string
        if (afterLabel !== chipLabel) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (override && afterLabel === chipLabel) fail('the model pick never changed the chip')
      if (!afterLabel.startsWith(modelPrefix)) fail('the model pick lost the chip label')
      pickedModelId = afterLabel.slice(modelPrefix.length).trim()
      if (pickedModelId === '') fail('the picked model id is empty')
      log('empty_state_model_pick_ok', `model=${pickedModelId}${override ? ' (override)' : ' (default re-pick)'}`)

      // ④ The thinking menu: only the picked model's OWN levels (the probe
      // catalog carries each model's supported levels; the SDK clamps the
      // rest away at create time). Pick the FIRST row — supported by
      // construction, so the ride is assertable without knowing the model.
      if (!(await win.webContents.executeJavaScript(composerChipClickJs('Thinking:')).catch(() => false))) {
        fail('the thinking chip is missing for the empty-state stage')
      }
      let levelRows: string[] = []
      for (let waited = 0; waited < 5_000; waited += 100) {
        levelRows = (await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.cmp-popover .cmp-menu-list .cmp-menu-row .cmp-menu-title')].map((n) => n.textContent ?? '')`
        ).catch(() => [])) as string[]
        if (levelRows.length > 0) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (levelRows.length < 1 || levelRows.length > 7) {
        fail(`the empty-state thinking menu lists ${levelRows.length} levels, expected 1..7`)
      }
      log('empty_state_thinking_levels_ok', levelRows.join(' '))
      const firstLevel = levelRows[0]!
      const pickFirstLevel = `(() => {
        const rows = [...document.querySelectorAll('.cmp-popover .cmp-menu-list .cmp-menu-row')]
        const row = rows.find((r) => (r.querySelector('.cmp-menu-title')?.textContent ?? '') === ${JSON.stringify(firstLevel)})
        if (!(row instanceof HTMLElement)) return false
        row.click()
        return true
      })()`
      if (!(await win.webContents.executeJavaScript(pickFirstLevel).catch(() => false))) {
        fail(`the thinking menu never offered ${firstLevel}`)
      }
      let thinkingLabel = ''
      for (let waited = 0; waited < 5_000; waited += 100) {
        thinkingLabel = (await win.webContents.executeJavaScript(composerChipLabelJs('Thinking:')).catch(() => '')) as string
        if (thinkingLabel === `Thinking: ${firstLevel}`) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (thinkingLabel !== `Thinking: ${firstLevel}`) fail('the empty-state thinking pick never reached the chip')
      log('empty_state_thinking_pick_ok', `level=${firstLevel}`)

      // ④b (ticket 80): the access chip joined the empty-state pick chain.
      // Untouched, it shows the gate's own fallback tier tagged "default";
      // picking Read Only reflects on the chip AT ONCE (the local pick —
      // the old passthrough dropped the command silently in the empty
      // state) and rides create_session's defaults.
      const accessPrefix = 'Access mode:'
      let accessLabel = ''
      for (let waited = 0; waited < 5_000; waited += 100) {
        accessLabel = (await win.webContents.executeJavaScript(composerChipLabelJs(accessPrefix)).catch(() => '')) as string
        if (accessLabel.startsWith(accessPrefix)) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (accessLabel !== 'Access mode: Standard') {
        fail(`the empty-state access chip should show the gate's Standard fallback, got ${JSON.stringify(accessLabel)}`)
      }
      const accessTagged = (await win.webContents.executeJavaScript(
        `document.querySelector('.cmp-chip[aria-label^="${accessPrefix}"] .cmp-chip-default')?.textContent ?? ''`
      ).catch(() => '')) as string
      if (accessTagged !== 'default') fail('the untouched access chip does not carry the default tag')
      log('empty_state_access_default_ok', accessLabel)
      if (!(await win.webContents.executeJavaScript(composerChipClickJs(accessPrefix)).catch(() => false))) {
        fail('the access chip never opened the access menu in the empty state')
      }
      if (!(await win.webContents.executeJavaScript(pickAccessRowJs('Read Only')).catch(() => false))) {
        fail('the empty-state access menu never offered Read Only')
      }
      let accessAfter = ''
      for (let waited = 0; waited < 5_000; waited += 100) {
        accessAfter = (await win.webContents.executeJavaScript(composerChipLabelJs(accessPrefix)).catch(() => '')) as string
        if (accessAfter === 'Access mode: Read Only') break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (accessAfter !== 'Access mode: Read Only') fail(`the access pick never reached the chip (got ${JSON.stringify(accessAfter)})`)
      const accessTagGone = (await win.webContents.executeJavaScript(
        `document.querySelector('.cmp-chip[aria-label^="${accessPrefix}"] .cmp-chip-default')?.textContent ?? ''`
      ).catch(() => '')) as string
      if (accessTagGone !== '') fail('the default tag survived an explicit access pick')
      log('empty_state_access_pick_ok', 'tier=read-only')

      // ⑤ Send from the empty state: the session is created from HERE, with
      // the picks riding the defaults and the prompt riding the pending
      // chain. The smoke's pick-directory short-circuit answers the folder
      // picker (no chip project exists in the isolated store).
      if (!(await win.webContents.executeJavaScript(composerTypeJs('Count slowly from one to twenty, one number per sentence.')).catch(() => false))) {
        fail('composer textarea missing for the empty-state send')
      }
      await new Promise((r) => setTimeout(r, 300))
      await win.webContents.executeJavaScript(composerKeyJs('Enter'))
    }

    // The empty-state send created the session; assert the pick arrived.
    // All waiters go up BEFORE anything resolves: composer_state follows
    // session_created back-to-back from the same host tick (announce), so a
    // late waiter would miss it.
    const agentStarted = waitFor((e) => e.type === 'agent_start', 'agent_start (pending prompt)')
    // Round-1 stream bookkeeping, armed BEFORE the session can exist: the
    // pending prompt starts streaming the moment session_created lands,
    // while this stage is still walking the access-probe waits — a fast
    // model can push its whole short reply PAST this point before any
    // waiter in the round-1 block would arm, and the waiter model can never
    // match an event that already flowed through (the 2026-09-16 run where
    // the text_delta wait starved against a completed turn). The observer
    // counts from the first event regardless of arming order.
    let roundOneDeltas = 0
    let roundOneEnded = false
    const onRoundOneStream = (e: Scoped): void => {
      if (e.type === 'text_delta') roundOneDeltas++
      if (e.type === 'agent_end') roundOneEnded = true
    }
    observers.push(onRoundOneStream)
    const composerState = waitFor((e) => e.type === 'composer_state', 'composer_state (empty-state defaults)')
    const created = (await waitFor((e) => e.type === 'session_created', 'session_created (empty-state send)')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    log('session_created', `sessionId=${created.sessionId} model=${created.model ?? '?'}`)
    if (created.model === null || created.model !== pickedModelId) {
      fail(`the empty-state model pick did not ride into the session (${created.model ?? 'null'} ≠ ${pickedModelId ?? '?'})`)
    }
    log('empty_state_pick_rides_ok', `model=${created.model}`)
    const composer = (await composerState) as Extract<Scoped, { type: 'composer_state' }>
    if (composer.thinkingLevel === null) fail('the session opened with no thinking level')
    // The picked level came FROM the picked model's supported list, so the
    // session must open exactly there — the menu list itself must equal the
    // session's host-pushed levels (same model, same source order).
    if (composer.thinkingLevel !== composer.availableLevels[0]) {
      fail(
        `the empty-state thinking pick did not ride into the session (${String(
          composer.thinkingLevel
        )} ≠ first supported ${String(composer.availableLevels[0])})`
      )
    }
    log(
      'empty_state_thinking_rides_ok',
      `thinking=${String(composer.thinkingLevel)} levels=${composer.availableLevels.join(',')}`
    )
    // Ticket 80: the access pick rides create_session's defaults — the
    // created session's gate opens on the picked tier with NO
    // set_access_mode command ever sent.
    if (composer.accessMode !== 'read-only') {
      fail(`the empty-state access pick did not ride into the session (got ${String(composer.accessMode)})`)
    }
    log('empty_state_access_rides_ok', 'tier=read-only')
    // The session view's own chip projects the picked tier (composer_state →
    // chat state → the same chip the in-session menus read).
    const inSessionAccess = await waitForProbe(
      win,
      `document.querySelector('.cmp-chip[aria-label^="Access mode:"]')?.getAttribute('aria-label') === 'Access mode: Read Only'`,
      5_000
    )
    if (!inSessionAccess) fail('the created session view never showed the picked tier on its access chip')
    log('empty_state_access_session_chip_ok', 'tier=read-only')
    // Restored to standard right after so every later stage runs on the
    // same baseline as before.
    supervisor.handleParentCommand({ type: 'set_access_mode', mode: 'standard' })
    const restored = (await waitFor((e) => e.type === 'access_mode_changed', 'access_mode_changed (smoke restore)')) as Extract<
      Scoped,
      { type: 'access_mode_changed' }
    >
    if (restored.mode !== 'standard') fail(`the smoke access restore failed (got ${restored.mode})`)
    log('empty_state_access_restore_ok', 'tier=standard')

    // Round 1: the pending prompt starts the run; abort mid-flight —
    // unless the fast first reply already settled inside the access-probe
    // window (the observer above saw it), in which case there is nothing
    // left to abort and the settle IS the round's outcome.
    await agentStarted
    log('agent_start')

    for (let waited = 0; waited < STEP_TIMEOUT_MS && roundOneDeltas < ABORT_AFTER_DELTAS && !roundOneEnded; waited += 100) {
      await new Promise((r) => setTimeout(r, 100))
    }
    if (roundOneDeltas < ABORT_AFTER_DELTAS && !roundOneEnded) {
      fail(`round 1 streamed only ${roundOneDeltas} delta(s) and never settled`)
    }
    if (roundOneEnded) {
      log('turn_settled_pre_abort', `deltas=${roundOneDeltas} — the fast first reply finished inside the probe window`)
    } else {
      log('deltas_collected', `count=${roundOneDeltas}`)
      supervisor.handleParentCommand({ type: 'abort_turn' })
    }
    // The settle, order-proof: the agent_end may already have flown by when
    // the abort was decided, so a waiter here could starve the same way.
    for (let waited = 0; waited < STEP_TIMEOUT_MS && !roundOneEnded; waited += 100) {
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!roundOneEnded) fail('round 1 never settled after the abort')
    observers.splice(observers.indexOf(onRoundOneStream), 1)
    log('aborted_ok')

    // Round 2: a full turn completes.
    supervisor.handleParentCommand({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end round 2')
    log('second_turn_ok')

    // The renderer loop must be alive too: preload bridge → reducer → DOM.
    await withWindow(getWindow, async (win) => {
      const rendered = await waitForDom(win)
      if (!rendered) fail('renderer never rendered the streamed exchange into the DOM')
      log('renderer_dom_ok')
    })

    // Ticket 04: the session index must reach the sidebar — the session this
    // smoke just created (same store the TUI writes) appears as a Task row.
    await withWindow(getWindow, async (win) => {
      const listed = await waitForSidebarRows(win)
      if (!listed) fail('sidebar never listed the session created by this smoke')
      log('sidebar_index_ok')
    })

    // ---- ticket 44: the user bubble's persistent Copy — same action-row
    // family as the assistant's (icon + label + ✓ feedback), no Fork (fork
    // anchors to assistant entries), and the clipboard receives the message's
    // exact raw text. REAL pasteboard assertion: the window is focused for
    // real first (navigator.clipboard rejects while unfocused — the visual
    // harness stubs it, this stage must not) and main reads it back. ----
    log('user_copy_start')
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      // The last user block is round 2's bubble — its exact prompt text.
      const USER_PROMPT = 'Reply with exactly: PICODE_SMOKE_OK'
      const lastBlock = (body: string): string => `(() => {
        const blocks = document.querySelectorAll('.chat-thread > .msg-user-block')
        const block = blocks[blocks.length - 1]
        if (!(block instanceof HTMLElement)) return null
        ${body}
      })()`

      // ① Both settled turns carry the persistent row, and the user row's
      // shape is Copy + Edit (ticket 79 joined the row; Copy stays FIRST so
      // the click below keeps copying): exactly two buttons, no Fork.
      if (!(await waitForProbe(win, `document.querySelectorAll('.chat-thread > .msg-user-block').length >= 2`, 10_000))) {
        fail('ticket-44 stage: the user message blocks never rendered')
      }
      const btnCount = (await js(lastBlock(`return block.querySelectorAll('.msg-action-btn').length`))) as number | null
      if (btnCount !== 2) {
        fail(`ticket-44 stage: the user action row must carry exactly two buttons (Copy + ticket-79 Edit), saw ${String(btnCount)}`)
      }
      log('user_copy_row_shape_ok')

      // ② Real clipboard round-trip: focus the window for real, park a
      // sentinel, click Copy, then poll the pasteboard from main until the
      // sentinel is replaced by the message's raw text.
      win.show()
      win.focus()
      app.focus({ steal: true })
      let focused = false
      for (let waited = 0; waited < 10_000 && !focused; waited += 100) {
        focused = (await js('document.hasFocus()')) === true
        if (!focused) {
          // macOS 15 denies a focus steal while the user is actively typing
          // in another app and coalesces activation requests — re-request
          // every poll tick so the steal lands the moment that interaction
          // pauses (ticket-47 harness-robustness class: smoke-mode only,
          // the assertion itself is untouched).
          if (!win.isFocused()) app.focus({ steal: true })
          await new Promise((r) => setTimeout(r, 100))
        }
      }
      if (!focused) fail('ticket-44 stage: the window never took focus for the real-clipboard click')
      const previous = await clipboard.readText()
      try {
        await clipboard.writeText('PICODE_CLIPBOARD_SENTINEL_44')
        const clicked = (await js(
          lastBlock(`const btn = block.querySelector('.msg-action-btn')\n        if (!(btn instanceof HTMLElement)) return false\n        btn.click()\n        return true`)
        )) as boolean
        if (!clicked) fail('ticket-44 stage: the user row copy button is missing')
        let got = ''
        for (let waited = 0; waited < 5_000; waited += 100) {
          got = await clipboard.readText()
          if (got === USER_PROMPT) break
          await new Promise((r) => setTimeout(r, 100))
        }
        if (got !== USER_PROMPT) {
          fail(`ticket-44 stage: clipboard never carried the raw user text (got ${JSON.stringify(got)})`)
        }
        log('user_copy_clipboard_ok')

        // ③ ✓ feedback identical to the assistant row: check icon + Copied.
        const copied = (await js(
          lastBlock(
            `return block.querySelector('.msg-action-copied') !== null && block.querySelector('.msg-action-btn span')?.textContent === 'Copied'`
          )
        )) as boolean
        if (!copied) fail('ticket-44 stage: the Copied feedback never showed on the user row')
        log('user_copy_feedback_ok')
      } finally {
        await clipboard.writeText(previous) // leave the operator's pasteboard as found
      }
    })
    log('user_copy_done')

    // ---- ticket 38: retired slash built-ins — the `/` menu drops the six
    // duplicated commands, and typing them by hand raises a pointer toast
    // with ZERO session traffic (no user_message, no agent round) ----
    log('slash_gate_start')
    await withWindow(getWindow, async (win) => {
      /** Toast line present? */
      const toastProbe = (needle: string): string =>
        `[...document.querySelectorAll('.toast-message')].some((n) => (n.textContent ?? '').includes(${JSON.stringify(needle)}))`

      // ① The `/` menu: the six retired built-ins are gone, /compact stays.
      if (!(await win.webContents.executeJavaScript(composerTypeJs('/')).catch(() => false))) {
        fail('composer textarea missing for the slash-gate stage')
      }
      let menuNames: string[] = []
      for (let waited = 0; waited < 5_000; waited += 100) {
        menuNames = (await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.cmp-popover .cmp-cmd-name')].map((n) => n.textContent ?? '')`
        ).catch(() => [])) as string[]
        if (menuNames.length > 0) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (menuNames.length === 0) fail('the / menu never opened for the slash-gate stage')
      for (const retired of ['/new', '/tree', '/name', '/copy', '/model', '/thinking']) {
        if (menuNames.includes(retired)) fail(`retired ${retired} still listed in the / menu`)
      }
      if (!menuNames.includes('/compact')) fail('/compact missing from the / menu')
      log('slash_menu_retired_ok', `rows=${menuNames.join(' ')}`)

      // ② Bare retired command: gated with the pointer toast. Escape first so
      // the Enter lands on the composer's dispatch, not a fuzzy menu row.
      // The stage-local observer (ticket-25 negative-assertion precedent)
      // watches from BEFORE the first gated send: no user_message may reach
      // any session while the toasts are up (③ checks after both sends).
      let leaked = 0
      const onLeak = (event: Scoped): void => {
        if (event.type === 'user_message') leaked++
      }
      observers.push(onLeak)
      const gateCase = async (typed: string, needle: string): Promise<void> => {
        await win.webContents.executeJavaScript(composerKeyJs('Escape'))
        if (!(await win.webContents.executeJavaScript(composerTypeJs(typed)).catch(() => false))) {
          fail(`composer textarea missing while typing ${typed}`)
        }
        await new Promise((r) => setTimeout(r, 300))
        await win.webContents.executeJavaScript(composerKeyJs('Escape'))
        // The Escape's setMenu(null) must COMMIT before Enter lands: a
        // back-to-back Enter reads the pre-commit closure where the menu is
        // still open and flatMenuKey turns the keystroke into a row pick
        // (row 0 = /compact → a real compaction, no pointer toast — the
        // 2026-09-16 double failure, raced again 2026-09-17 under heavy
        // machine load where the fixed 300ms gap lost). One PROBED gap
        // instead of a fixed sleep: poll until the popover is actually
        // gone before Enter (ticket-83 run-hardening, disclosed).
        if (!(await waitForProbe(win, `document.querySelector('.cmp-popover') === null`, 3_000))) {
          fail(`the / menu never closed after the Escape while gating ${typed}`)
        }
        await win.webContents.executeJavaScript(composerKeyJs('Enter'))
        const toasted = await waitForProbe(win, toastProbe(needle), 5_000)
        if (!toasted) {
          const diag = (await win.webContents.executeJavaScript(
            `JSON.stringify({
              value: document.querySelector('.composer-input')?.value ?? null,
              toasts: [...document.querySelectorAll('.toast-message')].map((n) => n.textContent ?? ''),
              menu: document.querySelectorAll('.cmp-popover .cmp-menu-row').length,
              sendBtn: document.querySelector('.cmp-send') !== null,
              stopBtn: document.querySelector('.cmp-stop') !== null
            })`
          ).catch(() => 'diag-failed')) as string
          fail(`typing ${typed} never raised the pointer toast (${needle}) — ${diag}`)
        }
      }
      await gateCase('/model', '/model — use the Select Model picker')
      log('slash_gate_toast_ok')
      await gateCase('/name my task', '/name — use the Rename task button in the chat header')
      log('slash_gate_args_toast_ok')

      // ③ The window has passed: assert zero session traffic across both
      // gated sends.
      await new Promise((r) => setTimeout(r, 2_500))
      observers.splice(observers.indexOf(onLeak), 1)
      if (leaked > 0) fail(`gated slash commands leaked ${leaked} message(s) into the session`)
      log('slash_gate_zero_send_ok')

      // Leave the composer clean for the later stages.
      await win.webContents.executeJavaScript(composerClearJs)
    })
    log('slash_gate_done')

    // ---- ticket 68: the trigger surface — a multi-line `/` report never
    // haunts the composer with a menu (open only while the caret sits in
    // the leading token), a mid-text @ never opens the file menu (same
    // table), zero matches render NO menu at all, and Enter on a zero-match
    // /skill:... sends the raw text straight through to the SDK (the
    // retired-slash gate must stay silent — the turn it starts dies with
    // the SIGKILL in the crash-isolation stage right after). ----
    log('menu_surface_start')
    // Ticket 70 run-hardening: the live model sometimes answers the unknown
    // /skill:zzzqqq by trying to LOOK IT UP with a mutating tool — the
    // approval gate then holds the turn open forever and the menu-keyboard
    // stage's idle wait starves. One-shot auto-deny: the FIRST gate ask on
    // this turn is denied through the same session_command the pill UI
    // sends (a deny terminates the turn, so the composer goes idle either
    // way); the watch disarms on the turn's agent_end or the host's death,
    // long before the ticket-25 stage's own gates must stay pending.
    let gateWatch = true
    const onGateAsk = (event: Scoped): void => {
      if (!gateWatch) return
      if (event.type === 'approval_required') {
        gateWatch = false
        log('menu_surface_gate_auto_deny', `tool=${event.toolName}`)
        supervisor.handleParentCommand({
          type: 'session_command',
          sessionId: event.sessionId,
          command: {
            type: 'deny_tool',
            toolCallId: event.toolCallId,
            reason: 'smoke auto-deny: the zero-match turn must not stall the menu stages on a hallucinated tool call'
          }
        })
      } else if (event.type === 'agent_end' || event.type === 'host_exit') {
        gateWatch = false
      }
    }
    observers.push(onGateAsk)
    await withWindow(getWindow, async (win) => {
      // The text menus' row classes are unique to them (the chip menus
      // share .cmp-menu-list, so that class proves nothing here).
      const textMenuOpenJs =
        `document.querySelector('.cmp-popover .cmp-cmd-name') !== null || document.querySelector('.cmp-popover .cmp-file-row') !== null`

      // ① The leading token still opens the menu (positive trigger).
      if (!(await win.webContents.executeJavaScript(composerTypeJs('/')).catch(() => false))) {
        fail('composer textarea missing for the menu-surface stage')
      }
      let opened = false
      for (let waited = 0; waited < 5_000; waited += 100) {
        if ((await win.webContents.executeJavaScript(textMenuOpenJs).catch(() => false))) {
          opened = true
          break
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      if (!opened) fail('typing "/" never opened the slash menu (ticket 68 stage)')
      log('menu_surface_leading_token_ok')

      // ①b Shift+Enter with the menu open must NEVER pick a row or send —
      // it inserts a newline (the native insert a real keydown produces;
      // the synthetic event can't, so the honest proxy is: value unchanged,
      // zero session traffic, menu still on the same token). The pre-fix
      // handler picked row 0 here — visible as a rewritten composer.
      let shiftSent = 0
      const onShiftSend = (event: Scoped): void => {
        if (event.type === 'user_message') shiftSent++
      }
      observers.push(onShiftSend)
      if (!(await win.webContents.executeJavaScript(composerKeyJs('Enter', { shiftKey: true })).catch(() => false))) {
        fail('composer textarea missing for the Shift+Enter probe')
      }
      await new Promise((r) => setTimeout(r, 500))
      observers.splice(observers.indexOf(onShiftSend), 1)
      const shiftValue = (await win.webContents.executeJavaScript(
        `document.querySelector('.composer-input')?.value ?? 'missing'`
      ).catch(() => 'probe-failed')) as string
      if (shiftValue !== '/') fail(`Shift+Enter with the menu open rewrote the composer: ${JSON.stringify(shiftValue)}`)
      if (shiftSent > 0) fail(`Shift+Enter with the menu open sent ${shiftSent} message(s)`)
      if (!(await win.webContents.executeJavaScript(textMenuOpenJs).catch(() => true))) {
        fail('the slash menu vanished on Shift+Enter before any newline landed')
      }
      log('menu_surface_shift_enter_ok')

      // ② Typing the multi-line report: the first space closes the menu and
      // no later line ever brings it back (pi16-slash-menu-multiline).
      for (const line of ['/Report title', '/Report title\nbody line', '/Report title\nbody line\n/three']) {
        if (!(await win.webContents.executeJavaScript(composerTypeJs(line)).catch(() => false))) {
          fail(`composer textarea missing while typing the report line ${JSON.stringify(line)}`)
        }
        await new Promise((r) => setTimeout(r, 300))
        if (await win.webContents.executeJavaScript(textMenuOpenJs).catch(() => true)) {
          fail(`the text menu is still rendered for ${JSON.stringify(line)}`)
        }
      }
      log('menu_surface_multiline_ok')

      // ③ A mid-text @ never opens the file menu (slash and @ share one
      // trigger table — leading token only).
      if (!(await win.webContents.executeJavaScript(composerTypeJs('see @src for details')).catch(() => false))) {
        fail('composer textarea missing for the mid-text @ probe')
      }
      await new Promise((r) => setTimeout(r, 300))
      if (await win.webContents.executeJavaScript(textMenuOpenJs).catch(() => true)) {
        fail('the file menu opened for a mid-text @ trigger')
      }
      await win.webContents.executeJavaScript(composerClearJs)
      log('menu_surface_at_midtext_ok')

      // ④ Zero matches render no menu; Enter sends the raw text — the SDK
      // passes the unknown command through untouched.
      const zeroMatch = '/skill:zzzqqq'
      const zeroSent = waitFor(
        (e) => e.type === 'user_message' && e.text === zeroMatch,
        'zero-match slash command delivered'
      )
      if (!(await win.webContents.executeJavaScript(composerTypeJs(zeroMatch)).catch(() => false))) {
        fail('composer textarea missing for the zero-match probe')
      }
      await new Promise((r) => setTimeout(r, 500))
      if (await win.webContents.executeJavaScript(textMenuOpenJs).catch(() => true)) {
        fail('a menu rendered for a zero-match /skill: query')
      }
      await win.webContents.executeJavaScript(composerKeyJs('Enter'))
      await zeroSent
      await new Promise((r) => setTimeout(r, 1_500))
      const noToast = await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.toast-message')].every((n) => !(n.textContent ?? '').includes('/skill'))`
      ).catch(() => false)
      if (!noToast) fail('the zero-match send raised a retired-slash toast')
      const cleared = (await win.webContents.executeJavaScript(
        `document.querySelector('.composer-input')?.value ?? 'missing'`
      ).catch(() => 'probe-failed')) as string
      if (cleared !== '') fail(`the zero-match send left text in the composer: ${JSON.stringify(cleared)}`)
      log('menu_surface_zero_match_send_ok')
    })
    log('menu_surface_done')

    // ---- ticket 69: ONE keyboard rule + scroll follow. The text menus
    // (keys intercepted at the textarea) and the chip menus (keys inside
    // the focused popover) must behave identically: both route through the
    // same shared flatMenuKey — ends CLAMP (the old text-menu intercept had
    // an unbounded ArrowDown; the popovers wrapped around), Enter picks,
    // Escape closes — and the selected row always stays inside the visible
    // list (MenuRow scrollIntoView, pi16-menu-no-scroll). ----
    log('menu_keyboard_start')
    await withWindow(getWindow, async (win) => {
      const js = (code: string): Promise<unknown> => win.webContents.executeJavaScript(code)
      // The menu-surface stage's zero-match send started a REAL turn that
      // streams through every probe below (its text deltas re-render the
      // composer while the menus are being walked). The keyboard probes
      // need a QUIET composer: wait for the turn to run out (the send
      // button returns) before driving anything.
      const idle = await waitForProbe(
        win,
        `document.querySelector('.composer .cmp-send') !== null`,
        90_000
      )
      if (!idle) fail('the menu-keyboard stage never saw the composer go idle (send button missing)')
      await new Promise((r) => setTimeout(r, 300))
      /** Selection state of a flat menu: row count + the aria-selected index. */
      const flatSelectionJs =
        `(() => {
          const rows = [...document.querySelectorAll('.cmp-popover .cmp-menu-row')]
          return { count: rows.length, selected: rows.findIndex((r) => r.getAttribute('aria-selected') === 'true') }
        })()`
      /** The aria-selected row must sit fully inside its scroll list's box
       * (the pi16-menu-no-scroll defect: the gray row pinned past the edge
       * with the list never moving). */
      const selectedVisibleJs =
        `(() => {
          const list = document.querySelector('.cmp-popover .cmp-menu-list')
          const sel = document.querySelector('.cmp-popover .cmp-menu-row[aria-selected="true"]')
          if (!(list instanceof HTMLElement) || !(sel instanceof HTMLElement)) return { ok: false }
          const l = list.getBoundingClientRect()
          const r = sel.getBoundingClientRect()
          return { ok: r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5 }
        })()`
      /** Dispatch a keydown inside the popover (React's root delegation
       * replays it into the menu's onKeyDown). */
      const listKeyJs = (selector: string, key: string): string =>
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return false
          el.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true, cancelable: true }))
          return true
        })()`
      const popoverGoneJs = `document.querySelector('.cmp-popover') === null`
      /** Poll the flat-menu selection until rows exist (menu mounted). */
      const waitRows = async (): Promise<{ count: number; selected: number }> => {
        let state = { count: 0, selected: -1 }
        for (let waited = 0; waited < 5_000; waited += 100) {
          state = (await js(flatSelectionJs).catch(() => state)) as typeof state
          if (state.count > 0) return state
          await new Promise((r) => setTimeout(r, 100))
        }
        return state
      }
      /** The decisive clamp probe, bottom end: walk to the last row, then
       * one MORE ArrowDown must leave the selection there (the wrap rule
       * would cycle it to row 0; the old unbounded ArrowDown would run
       * past the list). */
      const walkDownAndPin = async (menu: string, dispatchJs: string): Promise<{ count: number; selected: number }> => {
        let state = await waitRows()
        if (state.count === 0) return state
        for (let step = 0; step < state.count - 1; step++) {
          await js(dispatchJs)
          await new Promise((r) => setTimeout(r, 40))
        }
        state = (await js(flatSelectionJs)) as typeof state
        if (state.selected !== state.count - 1) fail(`the ${menu} walk rested at ${state.selected}/${state.count - 1}`)
        await js(dispatchJs)
        await new Promise((r) => setTimeout(r, 80))
        state = (await js(flatSelectionJs)) as typeof state
        if (state.selected !== state.count - 1) fail(`one more ArrowDown past the last row moved the ${menu} selection to ${state.selected} of ${state.count} (wrap, not clamp)`)
        return state
      }
      /** The decisive clamp probe, top end: walk back to row 0, then one
       * MORE ArrowUp must stay there (wrap would cycle to the last row). */
      const walkUpAndPin = async (menu: string, count: number, dispatchJs: string): Promise<void> => {
        for (let step = 0; step < count - 1; step++) {
          await js(dispatchJs)
          await new Promise((r) => setTimeout(r, 40))
        }
        const state = (await js(flatSelectionJs)) as { count: number; selected: number }
        if (state.selected !== 0) {
          const diag = (await js(
            `JSON.stringify({ popover: document.querySelector('.cmp-popover') !== null, rows: document.querySelectorAll('.cmp-popover .cmp-menu-row').length, value: document.querySelector('.composer-input')?.value ?? 'missing' })`
          ).catch(() => 'diag-failed')) as string
          fail(`the ${menu} walk up rested at ${state.selected} (count ${state.count}) — ${diag}`)
        }
        await js(dispatchJs)
        await new Promise((r) => setTimeout(r, 80))
        const pinned = (await js(flatSelectionJs)) as { count: number; selected: number }
        if (pinned.selected !== 0) fail(`one more ArrowUp on the first row moved the ${menu} selection to ${pinned.selected} (wrap, not clamp)`)
      }

      // ① The `/` text menu — keys intercepted at the textarea, routed by
      // the composer adapter into the shared flatMenuKey.
      if (!(await js(composerTypeJs('/')).catch(() => false))) fail('composer textarea missing for the menu-keyboard stage')
      const slashState = await walkDownAndPin('slash menu', composerKeyJs('ArrowDown'))
      if (slashState.count === 0) fail('the / menu never opened for the menu-keyboard stage')
      await walkUpAndPin('slash menu', slashState.count, composerKeyJs('ArrowUp'))
      const slashVisible = (await js(selectedVisibleJs).catch(() => ({ ok: false }))) as { ok: boolean }
      if (!slashVisible.ok) fail('the selected / menu row is outside the visible list (scroll follow broken)')
      log('menu_keyboard_text_menu_ok', `rows=${slashState.count}`)
      await js(composerKeyJs('Escape'))
      await new Promise((r) => setTimeout(r, 200))

      // ② The @ file menu — keyboard Enter picks through the composer's
      // ONE pick path (insertion, zero session traffic — the same
      // applyMention a row click lands in).
      let leaked = 0
      const onLeak = (event: Scoped): void => {
        if (event.type === 'user_message') leaked++
      }
      observers.push(onLeak)
      await js(composerClearJs)
      if (!(await js(composerTypeJs('@')).catch(() => false))) fail('composer textarea missing for the @ keyboard-pick probe')
      const fileState = await waitRows()
      if (fileState.count > 0) {
        await js(composerKeyJs('ArrowDown'))
        await new Promise((r) => setTimeout(r, 80))
        const picked = (await js(flatSelectionJs)) as typeof fileState
        const path = (await js(
          `[...document.querySelectorAll('.cmp-popover .cmp-menu-row')][${picked.selected}]?.textContent ?? ''`
        )) as string
        await js(composerKeyJs('Enter'))
        await new Promise((r) => setTimeout(r, 300))
        const value = (await js(`document.querySelector('.composer-input')?.value ?? 'missing'`)) as string
        if (value !== `${path} `) fail(`the keyboard Enter pick never inserted the mention (composer holds ${JSON.stringify(value)}, expected ${JSON.stringify(`${path} `)})`)
        if (!(await js(popoverGoneJs).catch(() => false))) fail('the @ menu stayed open after the keyboard pick')
        log('menu_keyboard_file_enter_pick_ok', `rows=${fileState.count}`)
      } else {
        log('menu_keyboard_file_enter_pick_skipped', 'no file candidates in the smoke cwd')
      }
      await js(composerClearJs)
      await new Promise((r) => setTimeout(r, 1_500))
      observers.splice(observers.indexOf(onLeak), 1)
      if (leaked > 0) fail(`the menu-keyboard stage leaked ${leaked} message(s) into the session`)

      // ③④⑤ The three chip menus — keys live INSIDE the focused popover
      // and flow through the same flatMenuKey: access (3 rows; keyboard
      // Enter picks the highlighted row — the menu opens ON the current
      // tier, so the pick is idempotent and leaves zero state change for
      // the stages after this one), thinking, model cascade (the provider
      // axis clamps through the same clampIndex).
      if (!(await js(composerChipClickJs('Access mode:')).catch(() => false))) fail('the access chip never opened the access menu')
      const accessState = await waitRows()
      if (accessState.count !== 3) fail(`the access menu lists ${accessState.count} rows, expected 3`)
      const pickedTitle = (await js(
        `document.querySelector('.cmp-popover .cmp-menu-row[aria-selected="true"] .cmp-menu-title')?.textContent ?? ''`
      )) as string
      if (pickedTitle === '') fail('the access menu has no highlighted row title to pick')
      await js(listKeyJs('.cmp-popover .cmp-menu-list', 'Enter'))
      await new Promise((r) => setTimeout(r, 300))
      if (!(await js(popoverGoneJs).catch(() => false))) fail('the access menu stayed open after the keyboard pick')
      // The pick carried the highlighted ROW (the current tier — the menu
      // opens on it): the chip keeps labeling that tier, and the popover
      // closing above proves the pick path ran at all.
      const accessPicked = await waitForProbe(
        win,
        `document.querySelector('.cmp-chip[aria-label^="Access mode:"]')?.getAttribute('aria-label') === 'Access mode: ' + ${JSON.stringify(pickedTitle)}`,
        5_000
      )
      if (!accessPicked) fail(`the access keyboard pick never landed on the highlighted tier (${pickedTitle})`)
      log('menu_keyboard_access_enter_pick_ok', `tier=${pickedTitle}`)

      if (!(await js(composerChipClickJs('Access mode:')).catch(() => false))) fail('the access chip never reopened the access menu')
      const accessWalk = await walkDownAndPin('access menu', listKeyJs('.cmp-popover .cmp-menu-list', 'ArrowDown'))
      const accessVisible = (await js(selectedVisibleJs).catch(() => ({ ok: false }))) as { ok: boolean }
      if (!accessVisible.ok) fail('the selected access row is outside the visible list')
      await js(listKeyJs('.cmp-popover .cmp-menu-list', 'Escape'))
      await new Promise((r) => setTimeout(r, 200))
      if (!(await js(popoverGoneJs).catch(() => false))) fail('Escape never closed the access menu')
      log('menu_keyboard_access_walk_ok', `rows=${accessWalk.count}`)

      if (!(await js(composerChipClickJs('Thinking:')).catch(() => false))) fail('the thinking chip never opened the thinking menu')
      const thinkingState = await walkDownAndPin('thinking menu', listKeyJs('.cmp-popover .cmp-menu-list', 'ArrowDown'))
      if (thinkingState.count === 0) fail('the thinking menu opened with no rows')
      await js(listKeyJs('.cmp-popover .cmp-menu-list', 'Escape'))
      await new Promise((r) => setTimeout(r, 200))
      log('menu_keyboard_thinking_walk_ok', `rows=${thinkingState.count}`)

      if (!(await js(composerChipClickJs('Model:')).catch(() => false))) fail('the model chip never opened the model menu')
      const cascadeStateJs =
        `(() => {
          const cols = [...document.querySelectorAll('.cmp-popover .cmp-cascade-col')]
          if (cols.length === 0) return null
          const sel = (col) => [...col.querySelectorAll('.cmp-menu-row')].findIndex((r) => r.getAttribute('aria-selected') === 'true')
          const cnt = (col) => col.querySelectorAll('.cmp-menu-row').length
          return { providers: cnt(cols[0]), providerSel: sel(cols[0]), models: cnt(cols[1]), modelSel: sel(cols[1]) }
        })()`
      let cascade = { providers: 0, providerSel: -1, models: 0, modelSel: -1 }
      for (let waited = 0; waited < 5_000; waited += 100) {
        const state = (await js(cascadeStateJs).catch(() => null)) as typeof cascade | null
        if (state !== null && state.providers > 0) {
          cascade = state
          break
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      if (cascade.providers === 0) fail('the model menu never listed providers')
      for (let step = 0; step < cascade.providers - 1; step++) {
        await js(listKeyJs('.cmp-popover .cmp-cascade', 'ArrowRight'))
        await new Promise((r) => setTimeout(r, 40))
      }
      cascade = (await js(cascadeStateJs)) as typeof cascade
      if (cascade.providerSel !== cascade.providers - 1) fail(`the provider walk rested at ${cascade.providerSel} of ${cascade.providers}`)
      await js(listKeyJs('.cmp-popover .cmp-cascade', 'ArrowRight'))
      await new Promise((r) => setTimeout(r, 80))
      cascade = (await js(cascadeStateJs)) as typeof cascade
      if (cascade.providerSel !== cascade.providers - 1) fail(`ArrowRight past the last provider rests at ${cascade.providerSel} of ${cascade.providers} (wrap, not clamp)`)
      log('menu_keyboard_model_providers_ok', `providers=${cascade.providers}`)
      await js(listKeyJs('.cmp-popover .cmp-cascade', 'Escape'))
      await new Promise((r) => setTimeout(r, 200))
      if (!(await js(popoverGoneJs).catch(() => false))) fail('Escape never closed the model menu')
      log('menu_keyboard_done')
      // The armed window is over either way (agent_end disarmed it; the
      // host_exit path covers a killed host) — drop the observer for real.
      observers.splice(observers.indexOf(onGateAsk), 1)
    })

    // ---- ticket 70: the chip-popover toggle race. The menu-keyboard
    // stage's chip clicks go through click(), which fires NO mousedown —
    // exactly why the race could hide here while every real mouse press
    // hit it: the popover's document-level mousedown outside-close closed
    // the menu, React re-rendered with menu === null, and the chip's click
    // toggle reopened it ("click the chip to close" bounced it right
    // back). After the fix the owning chip is exempt from the outside
    // close, so for EACH of the three chips (access/model/thinking):
    // opening works, the mousedown half of a second press does NOT close
    // (exempt), and the completing click does (toggle) — the decisive
    // mid-press probe. Plus the two neighbors: a click inside the popover
    // still picks (the selected row — idempotent, zero state change) and a
    // real outside press still closes for good. ----
    log('chip_toggle_start')
    await withWindow(getWindow, async (win) => {
      const js = (code: string): Promise<unknown> => win.webContents.executeJavaScript(code)
      const popoverPresentJs = `document.querySelector('.cmp-popover') !== null`
      const waitPopover = async (want: boolean): Promise<void> => {
        if (!(await waitForProbe(win, want ? popoverPresentJs : `!(${popoverPresentJs})`, 5_000))) {
          fail(`the chip menu should be ${want ? 'open' : 'closed'} but never settled`)
        }
      }
      // The decisive mid-press probe: after the mousedown half of a press
      // on the OWNING chip, the menu must still be there (pre-70 it was
      // already closed at this point — the click then reopened it).
      for (const aria of ['Access mode:', 'Model:', 'Thinking:']) {
        if (!(await js(composerChipPressJs(aria)).catch(() => false))) fail(`the ${aria} chip is missing for the chip-toggle stage`)
        await waitPopover(true)
        if (!(await js(composerChipDownJs(aria)).catch(() => false))) fail(`the ${aria} chip is missing mid-press`)
        await new Promise((r) => setTimeout(r, 250))
        if (!(await js(popoverPresentJs).catch(() => false))) fail(`the ${aria} popover closed on the mousedown half of the owning chip's press (the pre-70 race is back)`)
        await js(composerChipPressCompletionJs(aria))
        await waitPopover(false)
        log('chip_toggle_press_closes', aria)
      }

      // A click INSIDE the popover never closes via the outside path and
      // still picks: open the access menu, mousedown its selected row (the
      // current tier — the menu opens on it), then complete the click. The
      // pick is idempotent (zero state change) and closes via the pick path.
      if (!(await js(composerChipPressJs('Access mode:')).catch(() => false))) fail('the access chip is missing for the inside-click probe')
      await waitPopover(true)
      const rowDown = await js(
        `(() => {
          const row = document.querySelector('.cmp-popover .cmp-menu-row[aria-selected="true"]')
          if (!(row instanceof HTMLElement)) return false
          const r = row.getBoundingClientRect()
          row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
          return true
        })()`
      ).catch(() => false)
      if (!rowDown) fail('the access menu has no selected row to press')
      await new Promise((r) => setTimeout(r, 250))
      if (!(await js(popoverPresentJs).catch(() => false))) fail('the access popover closed on a mousedown INSIDE it (outside-close leaked inward)')
      const before = (await js(composerChipLabelJs('Access mode:'))) as string
      await js(
        `(() => {
          const row = document.querySelector('.cmp-popover .cmp-menu-row[aria-selected="true"]')
          if (!(row instanceof HTMLElement)) return false
          const r = row.getBoundingClientRect()
          for (const type of ['mouseup', 'click']) {
            row.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
          }
          return true
        })()`
      )
      await waitPopover(false)
      const after = (await js(composerChipLabelJs('Access mode:'))) as string
      if (before !== after) fail(`the idempotent access pick moved the tier (${before} → ${after})`)
      log('chip_toggle_inside_click_picks_ok')

      // Neighbor chips remain real outside clicks: with the access menu
      // open, a full press on the model chip closes access AND opens model
      // (mousedown closes the old menu, the click toggles the new one).
      if (!(await js(composerChipPressJs('Access mode:')).catch(() => false))) fail('the access chip is missing for the cross-chip probe')
      await waitPopover(true)
      if (!(await js(composerChipPressJs('Model:')).catch(() => false))) fail('the model chip is missing for the cross-chip probe')
      if (!(await waitForProbe(win, `document.querySelector('.cmp-popover .cmp-access-row') === null`, 5_000))) fail('the access menu survived a press on the model chip')
      if (!(await waitForProbe(win, `document.querySelector('.cmp-popover .cmp-cascade') !== null`, 5_000))) fail('the model menu never opened from the cross-chip press')
      // And the model chip presses its OWN menu closed (exemption again).
      await js(composerChipPressJs('Model:'))
      await waitPopover(false)
      log('chip_toggle_cross_chip_ok')

      // A real outside press closes for good: open, then a full press on
      // document.body (outside popover and chip alike), re-checked after a
      // beat so a late reopen cannot hide.
      if (!(await js(composerChipPressJs('Access mode:')).catch(() => false))) fail('the access chip is missing for the outside-close probe')
      await waitPopover(true)
      await js(
        `(() => {
          const r = document.body.getBoundingClientRect()
          for (const type of ['mousedown', 'mouseup', 'click']) {
            document.body.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
          }
          return true
        })()`
      )
      await waitPopover(false)
      await new Promise((r) => setTimeout(r, 400))
      if (!(await js(`!(${popoverPresentJs})`).catch(() => false))) fail('the access popover came back after a real outside press')
      log('chip_toggle_outside_close_ok')
      log('chip_toggle_done')
    })

    // Crash isolation: SIGKILL the host; supervisor must report it unclean —
    // and scoped to exactly the session that died (ticket 20).
    const pid = supervisor.hostPid
    if (!pid) fail('no host pid to kill')
    process.kill(pid, 'SIGKILL')
    const exitEvent = (await waitFor(
      (e) => e.type === 'host_exit' && e.sessionId === created.sessionId,
      'host_exit'
    )) as Extract<Scoped, { type: 'host_exit' }>
    if (exitEvent.clean) fail('host_exit should be unclean after SIGKILL')
    log('host_exit', `session=${exitEvent.sessionId} code=${exitEvent.code} signal=${exitEvent.signal ?? '-'}`)

    // Rebuild on the same cwd, give it one real turn (a fresh session file is
    // only written on the first assistant response), then exercise ticket 04's
    // Live Follow.
    supervisor.createSession(cwd)
    const rebuilt = (await waitFor((e) => e.type === 'session_created', 'rebuild session_created')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    log('rebuild_ok')

    supervisor.handleParentCommand({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end rebuild turn')
    log('rebuild_turn_ok')

    // Round 3: open a third session so the rebuilt one becomes inactive —
    // Live Follow targets sessions running elsewhere, never the active one.
    // A warm turn gives it a session file on disk, so its row exists in the
    // sidebar: the ticket-28 selection assertions click it to exit Follow.
    supervisor.createSession(cwd)
    const round3 = (await waitFor((e) => e.type === 'session_created', 'round 3 session_created')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    supervisor.handleParentCommand({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end round 3 warm turn')
    const round3SessionFile = round3.sessionFile
    if (!round3SessionFile) fail('round 3 session did not announce its file')
    log('round3_ok', round3SessionFile)

    // Registry semantics (ticket 20) keep EVERY host alive — including the
    // rebuilt session's. The follow stage needs a session that is NOT hosted
    // in this app (the α world's precondition: switching killed it), so the
    // smoke SIGKILLs the rebuilt host before following its file. Its death
    // must be scoped to that session alone.
    const rebuiltPid = supervisor.pidForSession(rebuilt.sessionId)
    if (!rebuiltPid) fail('rebuilt host pid missing')
    process.kill(rebuiltPid, 'SIGKILL')
    await waitFor(
      (e) => e.type === 'host_exit' && e.sessionId === rebuilt.sessionId,
      'rebuilt host_exit before follow stage'
    )
    log('rebuilt_host_killed', rebuilt.sessionId)

    // Live Follow: simulate the TUI appending to the (now host-less) session
    // file, open it from the sidebar, and watch the line appear read-only.
    // The row is addressed by data-file so real sessions on this machine
    // (also live within the 120s window) can never steal the click.
    if (!rebuilt.sessionFile) fail('rebuilt session did not report its file')
    const followedFile: string = rebuilt.sessionFile
    const appended = await appendSimulatedTuiTurn(followedFile)
    if (!appended) fail('could not find the leaf entry of the rebuilt session')
    const rowSelector = `[data-file="${followedFile}"]`
    await withWindow(getWindow, async (win) => {
      // The live dot proves the refreshed index (fresh mtime) reached the DOM.
      const live = await waitForProbe(win, `document.querySelector('${rowSelector} .sb-live-dot') !== null`, 10_000)
      if (!live) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            rowExists: document.querySelector('${rowSelector}') !== null,
            rowText: document.querySelector('${rowSelector}')?.textContent ?? null,
            rowDots: document.querySelectorAll('${rowSelector} .sb-live-dot').length,
            dotRows: document.querySelectorAll('.sb-task .sb-live-dot').length,
            activeRow: document.querySelector('.sb-task-active')?.getAttribute('data-file') ?? null,
            rowClasses: document.querySelector('${rowSelector}')?.className ?? null
          })`,
        ).catch(() => 'unavailable')) as string
        fail(`appended session never showed live state; DOM: ${diag}`)
      }
      log('follow_live_state_ok')
      const opened = await clickSelector(win, rowSelector)
      if (!opened) fail('clicking the live session row never opened the Live Follow view')
      log('follow_view_opened')
      const streamed = await waitForProbe(
        win,
        `document.querySelector('.follow-badge') !== null &&
         document.body.textContent.includes('${TUI_MARKER}')`,
        10_000
      )
      if (!streamed) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            badge: document.querySelector('.follow-badge')?.textContent ?? null,
            dotRows: document.querySelectorAll('.sb-task .sb-live-dot').length,
            taskCount: document.querySelectorAll('.sb-task').length,
            markerInBody: document.body.textContent.includes('${TUI_MARKER}'),
            userMsgs: document.querySelectorAll('.msg-user').length
          })`,
        ).catch(() => 'unavailable')) as string
        fail(`follow view did not stream the TUI turn; DOM: ${diag}`)
      }
      log('follow_streamed_ok')

      // Ticket 28: selection follows the view. The followed row carries the
      // selected styling while the focused row (round 3) reverts to plain —
      // and the followed row KEEPS its green dot: selection and running
      // state are decoupled.
      if (!round3SessionFile) fail('round 3 session did not report its file')
      const focusedRow = `[data-file="${round3SessionFile}"]`
      const selected = await waitForProbe(
        win,
        `(() => {
          const followed = document.querySelector('${rowSelector}')
          const focused = document.querySelector('${focusedRow}')
          if (!followed || !focused) return false
          return (
            followed.classList.contains('sb-task-active') &&
            followed.querySelector('.sb-live-dot') !== null &&
            !focused.classList.contains('sb-task-active')
          )
        })()`,
        10_000
      )
      if (!selected) fail('followed row never took the selected styling (ticket 28 selection follows the view)')
      log('follow_selection_ok')

      // Clicking the focused row again exits Follow: the highlight returns
      // to it and the follow view closes; clicking the followed row re-opens
      // the view with the followed row selected again.
      const exited = await clickSelector(win, focusedRow)
      if (!exited) fail('round 3 row never appeared to click for the follow exit')
      const backOnFocused = await waitForProbe(
        win,
        `(() => {
          const followed = document.querySelector('${rowSelector}')
          const focused = document.querySelector('${focusedRow}')
          return (
            document.querySelector('.follow-badge') === null &&
            focused !== null && focused.classList.contains('sb-task-active') &&
            followed !== null && !followed.classList.contains('sb-task-active')
          )
        })()`,
        10_000
      )
      if (!backOnFocused) fail('clicking the focused row did not exit Follow and restore its highlight (ticket 28)')
      log('follow_exit_ok')
      const reopened = await clickSelector(win, rowSelector)
      if (!reopened) fail('followed row never appeared to click for the re-follow')
      const reselected = await waitForProbe(
        win,
        `(() => {
          const followed = document.querySelector('${rowSelector}')
          return (
            document.querySelector('.follow-badge') !== null &&
            followed !== null && followed.classList.contains('sb-task-active')
          )
        })()`,
        10_000
      )
      if (!reselected) fail('re-opening the follow view did not restore the followed row selection (ticket 28)')
      log('follow_reselected_ok')
    })

    // Ticket 24 ①: structured rendering inside the follow view. The appended
    // turn carries thinking + tool traffic; the follow badge must stay and
    // the SAME turn architecture as the chat view must appear (ticket 23:
    // folded containers first) — while the session is STILL live (fresh
    // mtime), so no Open button yet.
    const structured = await appendSimulatedStructuredTurn(followedFile)
    if (!structured) fail('could not append the simulated structured turn')
    await withWindow(getWindow, async (win) => {
      // Ticket 23 gate, follow edition: the structured turn renders as a
      // FOLDED container — the pre-answer work (the first thinking) stays
      // hidden until the container is opened. Ticket 56: the rows AFTER the
      // turn's last text block — the settled tool result, the trailing
      // no-text thinking, the failed tool — join the always-visible
      // after-answer segment below the answer (ZCode assistantFollowingRows
      // shape), so they show even while the fold is closed.
      const folded = await waitForProbe(
        win,
        `document.querySelector('.follow-badge') !== null &&
         document.body.textContent.includes('${STRUCTURED_MARKER}') &&
         document.querySelectorAll('.turn-container').length >= 1 &&
         document.querySelectorAll('.turn-container-open').length === 0 &&
         document.querySelectorAll('.turn-container .thinking-row').length === 0 &&
         document.querySelectorAll('.turn-after-answer .tool-card').length === 2 &&
         document.querySelectorAll('.turn-after-answer .tool-card-error').length === 1 &&
         document.querySelectorAll('.turn-after-answer .thinking-row').length === 1`,
        10_000
      )
      if (!folded) fail('follow view never rendered the structured turn as a folded container')
      await openAllTurnContainers(win)
      const rendered = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row').length >= 2 &&
         document.querySelectorAll('.tool-card').length >= 2`,
        10_000
      )
      if (!rendered) fail('follow view never rendered the structured TUI turn')
      // Inner rows closed by default; exactly one error card; followed
      // thinking has no duration label (the file does not record durations).
      const shaped = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row-open').length === 0 &&
         document.querySelectorAll('.tool-card-open').length === 0 &&
         document.querySelectorAll('.tool-card-error').length === 1 &&
         document.querySelectorAll('.thinking-row .thinking-row-duration').length === 0`,
        5_000
      )
      if (!shaped) fail('follow view transcript is not collapsed/error-marked/degraded')
      // Negative sampling: poll for the button's APPEARANCE for 3s; seeing
      // none while the session is live is the assertion.
      const openAppeared = await waitForProbe(win, `document.querySelector('.follow-open-btn') !== null`, 3_000)
      if (openAppeared) fail('Open button showed while the followed session was still live')
      log('follow_structured_ok')
    })

    // Ticket 24 ② (reject path): backdate the followed file's mtime so the
    // session reads as quiet (>120s), then poke a DIFFERENT session file so
    // the index emits an event and the App re-renders — Open must appear.
    // The TUI then wakes up again; the click's fresh-scan re-check must
    // reject the takeover with a toast and keep the follow view open.
    if (!created.sessionFile) fail('first session did not report its file')
    const pokeFile: string = created.sessionFile
    backdateMtime(followedFile)
    await appendSimulatedTuiTurn(pokeFile)
    await withWindow(getWindow, async (win) => {
      const openShown = await waitForProbe(win, `document.querySelector('.follow-open-btn') !== null`, 15_000)
      if (!openShown) fail('Open never appeared after the followed session went quiet')
      log('follow_open_shown')
      // Wake the other end between render and click — a few-ms window before
      // the next index poll would hide the button again.
      await appendSimulatedTuiTurn(followedFile)
      const clicked = await clickSelector(win, '.follow-open-btn')
      if (!clicked) fail('Open button vanished before the takeover click could land')
      const rejected = await waitForProbe(
        win,
        `document.body.textContent.includes('${FOLLOW_TAKEOVER_REJECTED_TOAST}')`,
        3_000
      )
      if (!rejected) fail('takeover click on a live session was not rejected with a toast')
      const stillFollowing = await waitForProbe(win, `document.querySelector('.follow-badge') !== null`, 2_000)
      if (!stillFollowing) fail('follow view closed even though the takeover was rejected')
      log('follow_open_rejected_ok')
    })

    // Ticket 24 ② (accept path): quiet again → Open → resume. This resume IS
    // the ticket-14 structured replay, driven end-to-end through the renderer:
    // session_created(resumed) + structured history_loaded, the follow view
    // hands over to the chat view, and the replayed transcript renders
    // isomorphic to live — collapsed thinking rows, settled tool cards (the
    // failed one in the error style), degraded thinking durations.
    backdateMtime(followedFile)
    await appendSimulatedTuiTurn(pokeFile)
    const resumedPromise = waitFor((e) => e.type === 'session_created' && e.resumed === true, 'takeover session_created')
    const replayPromise = waitFor((e) => e.type === 'history_loaded', 'takeover history_loaded')
    await withWindow(getWindow, async (win) => {
      const openShown = await waitForProbe(win, `document.querySelector('.follow-open-btn') !== null`, 15_000)
      if (!openShown) fail('Open never re-appeared for the takeover resume')
      const clicked = await clickSelector(win, '.follow-open-btn')
      if (!clicked) fail('takeover Open click failed')
    })
    await resumedPromise
    log('takeover_resumed_ok')
    const replayed = (await replayPromise) as Extract<Scoped, { type: 'history_loaded' }>
    const replayItems = replayed.items
    if (!Array.isArray(replayItems) || replayItems.length < 5) {
      fail(`replayed history too small: ${replayItems?.length}`)
    }
    if (!replayItems.some((i) => i.role === 'user' && i.text.includes(STRUCTURED_MARKER))) {
      fail('replayed history must carry the simulated structured-turn user message')
    }
    if (!replayItems.some((i) => i.role === 'assistant' && i.parts.some((p) => p.kind === 'thinking'))) {
      fail('replayed history must carry thinking parts (ticket 14)')
    }
    if (!replayItems.some((i) => i.role === 'tool' && i.isError === true)) {
      fail('replayed history must carry the failed tool call (ticket 14)')
    }
    log('replay_payload_ok', `${replayItems.length} structured items`)
    await withWindow(getWindow, async (win) => {
      // Ticket 23: replayed turns render as FOLDED "Worked · Ns ›" containers
      // — pre-answer work stays hidden until a container is opened. Ticket
      // 56: post-answer rows (the settled tool, the trailing thinking, the
      // failed tool) render in the after-answer segment below the answer
      // even while the fold is closed.
      const folded = await waitForProbe(
        win,
        `document.querySelectorAll('.turn-container').length >= 1 &&
         document.querySelectorAll('.turn-container-open').length === 0 &&
         document.querySelectorAll('.turn-container .thinking-row').length === 0 &&
         document.querySelectorAll('.turn-after-answer .tool-card').length === 2 &&
         document.querySelectorAll('.turn-after-answer .thinking-row').length === 1`,
        10_000
      )
      if (!folded) fail('replayed turns did not render collapsed (ticket 23 memory rule)')
      await openAllTurnContainers(win)
      const rendered = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row').length >= 2 &&
         document.querySelectorAll('.tool-card').length >= 2`,
        10_000
      )
      if (!rendered) fail('replayed thinking rows / tool cards never reached the DOM')
      // Inner rows closed by default; exactly one error card; replayed
      // thinking has no duration label (the file does not record durations);
      // a skill-driven marker row would have rendered inside too.
      const shaped = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row-open').length === 0 &&
         document.querySelectorAll('.tool-card-open').length === 0 &&
         document.querySelectorAll('.tool-card-error').length === 1 &&
         document.querySelectorAll('.thinking-row .thinking-row-duration').length === 0`,
        5_000
      )
      if (!shaped) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            turns: document.querySelectorAll('.turn-container').length,
            turnsOpen: document.querySelectorAll('.turn-container-open').length,
            thinkingRows: document.querySelectorAll('.thinking-row').length,
            thinkingOpen: document.querySelectorAll('.thinking-row-open').length,
            thinkingDurations: document.querySelectorAll('.thinking-row .thinking-row-duration').length,
            toolCards: document.querySelectorAll('.tool-card').length,
            toolOpen: document.querySelectorAll('.tool-card-open').length,
            toolError: document.querySelectorAll('.tool-card-error').length
          })`
        ).catch(() => 'unavailable')) as string
        fail(`replayed transcript is not collapsed/error-marked/degraded; DOM: ${diag}`)
      }
      // Ticket 24: the follow view must be gone — the takeover auto-switched
      // to the chat view (checked last, after the collapse-gate audit).
      const switched = await waitForProbe(win, `document.querySelector('.follow-badge') === null`, 10_000)
      if (!switched) fail('follow view never handed over to the resumed session view')
      log('replay_dom_ok')
    })

    // Ticket 17: the new-task empty state. ⌘N must open the chip empty state
    // (no system folder dialog), the chip preselects the active session's
    // project, the dropdown exposes search + recent workspaces + the
    // "Open folder…" entry, and the first send creates the session in the
    // chip's project with the typed message delivered via the pending chain.
    const NEWTASK_MARKER = 'PICODE_NEWTASK_FIRST_MSG'
    const started = waitFor(
      (e) => e.type === 'session_created' && e.cwd === cwd,
      'newtask session_created'
    ) as Promise<Extract<Scoped, { type: 'session_created' }>>
    const firstPrompt = waitFor(
      (e) => e.type === 'user_message' && e.text.includes(NEWTASK_MARKER),
      'newtask first prompt delivered'
    )
    await withWindow(getWindow, async (win) => {
      // ⌘N → the chip empty state replaces the open session view. The
      // event carries the PHYSICAL code (ticket 27): the resolver reads
      // code + modifiers, never the derived character.
      await win.webContents.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true }))`
      )
      const chipShown = await waitForProbe(
        win,
        `document.querySelector('.empty-state') !== null && document.querySelector('.newtask-chip') !== null`,
        10_000
      )
      if (!chipShown) fail('⌘N never opened the new-task empty state with the project chip')
      // The chip preselects the ACTIVE session's project (= this smoke's cwd).
      const chipLabel = (await win.webContents.executeJavaScript(
        `document.querySelector('.newtask-chip span')?.textContent ?? ''`
      )) as string
      const expectedProject = cwd.split('/').filter(Boolean).pop() ?? cwd
      if (!chipLabel.includes(expectedProject)) {
        fail(`project chip shows "${chipLabel}" instead of the active session's project (${expectedProject})`)
      }
      log('newtask_chip_default_ok', chipLabel)
      // Dropdown: search box + recent workspaces (current one checked) +
      // the bottom "Open folder…" entry.
      await clickSelector(win, '.newtask-chip')
      const dropdown = await waitForProbe(
        win,
        `document.querySelector('.newtask-pop .newtask-search input') !== null &&
         document.querySelector('.newtask-pop .newtask-openfolder') !== null &&
         document.body.textContent.includes('Open folder…') &&
         document.querySelector('.newtask-pop .newtask-row-current') !== null`,
        5_000
      )
      if (!dropdown) fail('chip dropdown never showed search + current-checked workspace + Open folder…')
      log('newtask_dropdown_ok')
      // Close the dropdown, then type the first message and send it.
      await win.webContents.executeJavaScript(
        `document.querySelector('.newtask-pop .newtask-search input')
           ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
      )
      const typed = await win.webContents.executeJavaScript(
        `(async () => {
          const ta = document.querySelector('.empty-state textarea.composer-input')
          if (!ta) return false
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, '${NEWTASK_MARKER}: start me in the chip project')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 100))
          ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true
        })()`
      )
      if (!typed) fail('could not type into the empty-state composer')
    })
    const createdNow = await started
    log('newtask_session_created', `sessionId=${createdNow.sessionId}`)
    await firstPrompt
    log('newtask_first_prompt_ok')
    // Stop the agent turn the marker message started, then finish clean.
    supervisor.handleParentCommand({ type: 'abort_turn' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end after newtask abort')
    log('newtask_turn_aborted_ok')

    // ---- ticket 20: multi-active sessions (registry semantics) ----
    log('multi_session_start')
    supervisor.createSession(cwd)
    const ms1 = (await waitFor((e) => e.type === 'session_created', 'multi session_created 1')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    supervisor.createSession(cwd)
    const ms2 = (await waitFor((e) => e.type === 'session_created', 'multi session_created 2')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    if (ms1.sessionId === ms2.sessionId) fail('distinct sessions must announce distinct ids')
    const ms1Pid = supervisor.pidForSession(ms1.sessionId)
    if (!ms1Pid) fail('multi session 1 host pid missing')
    if (!ms1.sessionFile || !ms2.sessionFile) fail('multi sessions did not report their files')

    // Session 2 gets a quick settled turn so its file exists: after this it is
    // the "in-app idle" row (fresh mtime, but its dot slot stays EMPTY — an
    // in-app session never shows the TUI green dot).
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms2.sessionId,
      command: { type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms2.sessionId, 'multi agent_end 2')

    // Session 1 gets a warm-up turn so ITS file exists too (the sidebar row
    // must be present while the next turn streams).
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: { type: 'prompt', text: `Reply with exactly: ${MULTI_MARKER}` }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms1.sessionId, 'multi warm agent_end 1')
    const ms1SizeWarm = statSync(ms1.sessionFile).size

    // Session 1 starts a LONG streaming run. The dot probe below starts in
    // the same instant as agent_start — the run state is guaranteed until
    // the model finishes, long after the probe's first poll.
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: {
        type: 'prompt',
        text: `${MULTI_MARKER}: count from 1 to 150. Output each number on its own line, one number per line. Do not summarize and do not stop early. Do not use any tools — write the numbers directly in your reply text.`
      }
    })
    await waitFor((e) => e.type === 'agent_start' && e.sessionId === ms1.sessionId, 'multi agent_start 1')

    // Sidebar dot states while session 1 runs: run-here for session 1, empty
    // fixed slot for the in-app idle session 2 (fresh mtime but never the
    // TUI green dot).
    await withWindow(getWindow, async (win) => {
      const row2 = `[data-file="${ms2.sessionFile}"]`
      const dots = await waitForProbe(
        win,
        `(() => {
          const row1 = document.querySelector('[data-file="${ms1.sessionFile}"]')
          const row2 = document.querySelector('${row2}')
          if (!row1 || !row2) return false
          return (
            row1.querySelector('.sb-run-dot') !== null &&
            row1.querySelector('.sb-live-dot') === null &&
            row2.querySelector('.sb-run-dot') === null &&
            row2.querySelector('.sb-live-dot') === null &&
            row2.querySelector('.sb-dot-slot') !== null
          )
        })()`,
        10_000
      )
      if (!dots) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            row1: document.querySelector('[data-file="${ms1.sessionFile}"]')?.className ?? null,
            row1Run: document.querySelectorAll('[data-file="${ms1.sessionFile}"] .sb-run-dot').length,
            row1Live: document.querySelectorAll('[data-file="${ms1.sessionFile}"] .sb-live-dot').length,
            row2: document.querySelector('${row2}')?.className ?? null,
            row2Slot: document.querySelectorAll('${row2} .sb-dot-slot').length,
            row2Live: document.querySelectorAll('${row2} .sb-live-dot').length,
            slots: document.querySelectorAll('.sb-dot-slot').length,
            runDots: document.querySelectorAll('.sb-run-dot').length,
            liveDots: document.querySelectorAll('.sb-live-dot').length,
            rows: document.querySelectorAll('.sb-task').length,
            dbg: document.documentElement.dataset['picodeDebug'] ?? null
          })`
        ).catch(() => 'unavailable')) as string
        fail(`sidebar dots: running-here/idle slot states wrong (ticket 20 fixed slot); DOM: ${diag}`)
      }
      log('multi_dot_states_ok')
    })

    // A THIRD session opens while session 1 streams — pure focus switch, the
    // run keeps going in the background (nothing is terminated).
    supervisor.createSession(cwd)
    await waitFor((e) => e.type === 'session_created', 'multi session_created 3')
    await waitFor(
      (e) => e.type === 'text_delta' && e.sessionId === ms1.sessionId,
      'background text_delta after session 3 exists'
    )
    // The background session's file KEEPS GROWING while nothing renders it —
    // the run-start user message is already appended beyond the warm turn.
    const ms1SizeDuring = statSync(ms1.sessionFile).size
    if (ms1SizeDuring <= ms1SizeWarm) fail('background session file did not grow while streaming')
    log('multi_background_streaming_ok')

    // Ticket 28: selection follows the view — session 1 keeps its animated
    // dot while running in the background but its row reverts to a plain
    // background (selection and running state are decoupled; session 3 has
    // no row yet — a fresh session file is only written on the first turn).
    await withWindow(getWindow, async (win) => {
      const decoupled = await waitForProbe(
        win,
        `(() => {
          const running = document.querySelector('[data-file="${ms1.sessionFile}"]')
          return running !== null &&
            running.querySelector('.sb-run-dot') !== null &&
            !running.classList.contains('sb-task-active')
        })()`,
        10_000
      )
      if (!decoupled) fail('background running row stayed selected — selection must follow the view (ticket 28)')
      log('multi_selection_decoupled_ok')
    })

    // Switch BACK to session 1 through its sidebar row: pure focus change —
    // same host process (same pid, no session_created), view remounts caught
    // up with NO duplicate entries, and the live stream resumes on screen.
    await withWindow(getWindow, async (win) => {
      const row1 = `[data-file="${ms1.sessionFile}"]`
      const clicked = await clickSelector(win, row1)
      if (!clicked) fail('sidebar row of the background session never appeared to click')
      const caught = await waitForProbe(
        win,
        `document.querySelector('.follow-badge') === null &&
         document.querySelectorAll('.msg-user').length === 2 && // warm-up + count turns; duplicates would inflate
         document.body.textContent.includes('${MULTI_MARKER}') &&
         document.querySelector('.msg-assistant') !== null`,
        10_000
      )
      if (!caught) fail('switching back to the background session did not show its caught-up transcript')
    })
    if (supervisor.pidForSession(ms1.sessionId) !== ms1Pid) {
      fail('switching back respawned the host — registry semantics broken')
    }
    await waitFor(
      (e) => e.type === 'text_delta' && e.sessionId === ms1.sessionId,
      'text_delta after refocus (stream resumed)'
    )
    log('multi_refocus_ok')

    // Targeted abort settles session 1's run; session 1 stays usable.
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: { type: 'abort_turn' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms1.sessionId, 'multi agent_end 1 after abort')
    log('multi_abort_ok')

    // ---- ticket 28: unread dot — a background turn sets it, focus clears it ----
    // Session 1 stays focused while the idle session 2 runs a LONG background
    // turn: growth past its watermark sets unread, the animated dot masks it
    // while the run is in flight, and once the turn settles the indigo dot
    // shows; clicking the row (focus switch) clears unread again.
    log('unread_start')
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms2.sessionId,
      command: {
        type: 'prompt',
        text: 'Count from 51 to 150. Output each number on its own line, one number per line. Do not summarize and do not stop early.'
      }
    })
    await waitFor((e) => e.type === 'agent_start' && e.sessionId === ms2.sessionId, 'unread agent_start ms2')
    if (!ms2.sessionFile) fail('multi session 2 did not report its file')
    const ms2Row = `[data-file="${ms2.sessionFile}"]`
    await withWindow(getWindow, async (win) => {
      const masked = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('${ms2Row}')
          return row !== null &&
            row.querySelector('.sb-run-dot') !== null &&
            row.querySelector('.sb-unread-dot') === null
        })()`,
        10_000
      )
      if (!masked) fail('unread was not masked by the animated dot while the background run was in flight (ticket 28)')
      log('unread_masked_ok')
    })
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms2.sessionId,
      command: { type: 'abort_turn' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms2.sessionId, 'unread agent_end ms2')
    await withWindow(getWindow, async (win) => {
      const lit = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('${ms2Row}')
          const focused = document.querySelector('[data-file="${ms1.sessionFile}"]')
          return row !== null &&
            row.querySelector('.sb-unread-dot') !== null &&
            row.querySelector('.sb-run-dot') === null &&
            focused !== null && focused.querySelector('.sb-unread-dot') === null &&
            focused.classList.contains('sb-task-active')
        })()`,
        10_000
      )
      if (!lit) fail('the settled background turn never lit the indigo unread dot (ticket 28)')
      log('unread_lit_ok')
      const clicked = await clickSelector(win, ms2Row)
      if (!clicked) fail('unread session row never appeared to click')
      const cleared = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('${ms2Row}')
          return row !== null && row.querySelector('.sb-unread-dot') === null
        })()`,
        10_000
      )
      if (!cleared) fail('focusing the session never cleared its unread dot (ticket 28)')
      log('unread_cleared_ok')
    })

    // Crash isolation, session-scoped: SIGKILL session 2's host — ONLY that
    // session reports an exit; session 1 keeps working.
    const ms2Pid = supervisor.pidForSession(ms2.sessionId)
    if (!ms2Pid) fail('multi session 2 host pid missing')
    let tripwireFired = false
    void waitFor((e) => e.type === 'host_exit' && e.sessionId === ms1.sessionId, 'tripwire').then(() => {
      tripwireFired = true
    })
    process.kill(ms2Pid, 'SIGKILL')
    const ms2Exit = (await waitFor(
      (e) => e.type === 'host_exit' && e.sessionId === ms2.sessionId,
      'multi session 2 host_exit'
    )) as Extract<Scoped, { type: 'host_exit' }>
    if (ms2Exit.clean) fail('session 2 host_exit should be unclean after SIGKILL')
    if (tripwireFired) fail('session 1 was affected by session 2’s crash (isolation broken)')
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: { type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms1.sessionId, 'multi agent_end 1 after isolation')
    log('multi_crash_isolation_ok')

    // ---- ticket 25: background approval — pill parks, badge lights, notification knocks ----
    log('bg_approval_start')
    // A fresh session becomes the foreground view; session 1 (host still
    // alive from the multi stage, gate rules empty) becomes the background
    // session the gate fires in.
    supervisor.createSession(cwd)
    await waitFor((e) => e.type === 'session_created', 'bg foreground session_created')
    const bgId = ms1.sessionId
    if (!ms1.sessionFile) fail('bg session did not report its file')
    const bgFile: string = ms1.sessionFile

    // Stage-local observation: the suspension and remember assertions need
    // to SEE that an event never came, not just wait for ones that must.
    let bgApprovalRequired = 0
    let bgApprovedResolved = false
    let bgDeniedReason: string | null = null
    let bgAgentEnded = 0
    observers.push((event) => {
      if (event.sessionId !== bgId) return
      if (event.type === 'approval_required') bgApprovalRequired += 1
      if (event.type === 'approval_resolved') {
        if (event.approved) bgApprovedResolved = true
        else bgDeniedReason = event.reason
      }
      if (event.type === 'agent_end') bgAgentEnded += 1
    })

    // The background session runs a gated tool call while the view is on
    // the fresh session: the pill must park INSIDE the background session.
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: bgId,
      command: { type: 'prompt', text: `Use the bash tool to run exactly: echo ${BG_APPROVAL_MARKER}` }
    })
    const bgAsk = (await waitFor(
      (e) => e.type === 'approval_required' && e.sessionId === bgId && e.toolName === 'bash',
      'bg approval_required'
    )) as Extract<Scoped, { type: 'approval_required' }>
    log('bg_approval_required', `tool=${bgAsk.toolName} call=${bgAsk.toolCallId}`)

    // The agent is SUSPENDED at the gate: no agent_end may arrive while the
    // pill waits — and nothing approves it on the user's behalf.
    await new Promise((r) => setTimeout(r, 2000))
    if (bgAgentEnded > 0) fail('the agent run ended while parked at the approval gate — the pill must suspend the run')
    log('bg_agent_suspended_ok')

    // Sidebar: the orange badge replaces the animated dot on the background
    // row, and the pill does NOT reach the DOM (the view is elsewhere — it
    // lives in the session's registry state).
    await withWindow(getWindow, async (win) => {
      const badge = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('[data-file="${bgFile}"]')
          if (!row) return false
          return row.querySelector('.sb-await-dot') !== null &&
                 row.querySelector('.sb-run-dot') === null &&
                 document.querySelectorAll('.approval-pill-pending').length === 0
        })()`,
        10_000
      )
      if (!badge) fail('background approval never lit the sidebar orange badge (or leaked the pill into the DOM)')
      log('bg_badge_ok')
    })

    // The notification pipeline asked for THIS session's gate hit...
    let notice: ApprovalNotice | undefined
    for (let waited = 0; waited < 10_000; waited += 100) {
      notice = approvalNotices.find((n) => n.sessionId === bgId && n.toolName === 'bash')
      if (notice !== undefined) break
      await new Promise((r) => setTimeout(r, 100))
    }
    if (notice === undefined) fail('no approval notification was requested for the background session')
    log('bg_notification_ok', `title=${notice.title ?? '-'}`)

    // ...and its click path foregrounds the window and focuses the session:
    // the parked pill appears, ready for the same controls a foreground
    // approval always had.
    focusSessionFromNotification(getWindow, bgId)
    await withWindow(getWindow, async (win) => {
      const focused = await waitForProbe(
        win,
        `document.querySelector('[data-file="${bgFile}"]')?.classList.contains('sb-task-active') === true`,
        5_000
      )
      if (!focused) fail('notification click did not focus the background session')
      const pill = await waitForProbe(win, `document.querySelector('.approval-pill-pending[data-tool="bash"]') !== null`, 5_000)
      if (!pill) fail('the refocused session does not render its parked pending pill')
      log('bg_jump_ok')
    })

    // Approve & Remember through the pill's own button — the exact control
    // path a foreground approval uses (sendFocused → session_command). The
    // ack waiters exist BEFORE the click (same anti-race rule as below).
    const approveAck = waitFor(
      (e) => e.type === 'approval_resolved' && e.sessionId === bgId && e.approved === true,
      'bg approval_resolved (approve)'
    )
    const approveToolEnd = waitFor((e) => e.type === 'tool_end' && e.sessionId === bgId, 'bg tool ran after approve')
    const approveEnded = waitFor((e) => e.type === 'agent_end' && e.sessionId === bgId, 'bg agent_end after approve')
    await withWindow(getWindow, async (win) => {
      const clicked = (await win.webContents
        .executeJavaScript(`(() => {
          const pill = document.querySelector('.approval-pill-pending[data-tool="bash"]')
          if (!pill) return false
          const btn = [...pill.querySelectorAll('button')].find((b) => b.textContent?.includes('Remember'))
          if (!btn) return false
          btn.click()
          return true
        })()`)
        .catch(() => false)) as boolean
      if (!clicked) fail('Approve & Remember button not found on the parked pill')
    })
    await approveAck
    await approveToolEnd
    await approveEnded
    if (!bgApprovedResolved) fail('approval_resolved(approve) never reached the stream')
    log('bg_approve_remember_ok')

    // The remember rule sticks under the current tier: the NEXT bash call
    // must not ask again (the gate decides before execution, so any second
    // ask would fire before this agent_end — the wait would hang).
    const asksBeforeRemember = bgApprovalRequired
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: bgId,
      command: { type: 'prompt', text: `Use the bash tool to run exactly: echo ${BG_REMEMBER_MARKER}` }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === bgId, 'bg agent_end (remembered round)')
    if (bgApprovalRequired !== asksBeforeRemember) fail('remembered bash asked again — the approve+remember rule did not stick')
    log('bg_remember_ok')

    // Deny path in the refocused session: write is NOT remembered, so the
    // gate asks again; denying through the pill UI must terminate the round,
    // round-trip the reason, and update the transcript (no file written).
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: bgId,
      command: {
        type: 'prompt',
        text: `Use the write tool to create a file named picode-deny-probe.txt whose content is exactly: ${BG_DENY_MARKER}. Then confirm.`
      }
    })
    const denyAsk = (await waitFor(
      (e) => e.type === 'approval_required' && e.sessionId === bgId && e.toolName === 'write',
      'bg deny approval_required'
    )) as Extract<Scoped, { type: 'approval_required' }>
    log('bg_deny_ask', `call=${denyAsk.toolCallId}`)
    // The ack waiters exist BEFORE the UI click: the renderer→host→renderer
    // round-trip races the DOM script's own return (the host resolves the
    // moment Deny is clicked, while executeJavaScript is still unwinding).
    const denyAck = waitFor(
      (e) => e.type === 'approval_resolved' && e.sessionId === bgId && e.approved === false,
      'bg approval_resolved (deny)'
    )
    const denyEnded = waitFor((e) => e.type === 'agent_end' && e.sessionId === bgId, 'bg agent_end after deny (turn terminated)')
    await withWindow(getWindow, async (win) => {
      // The pill must be on screen first — the smoke's event waiter and the
      // renderer's React commit race, so poll before driving the UI.
      const pillShown = await waitForProbe(win, `document.querySelector('.approval-pill-pending[data-tool="write"]') !== null`, 10_000)
      if (!pillShown) fail('the write pill never rendered after the deny ask')
      const denied = (await win.webContents
        .executeJavaScript(`(async () => {
          const pill = document.querySelector('.approval-pill-pending[data-tool="write"]')
          if (!pill) return 'no-pill'
          const opener = [...pill.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Deny…')
          if (!opener) return 'no-opener'
          opener.click()
          await new Promise((r) => setTimeout(r, 150))
          const input = pill.querySelector('.approval-pill-reason-input')
          if (!input) return 'no-input'
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, '${BG_DENY_REASON}')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          const denyBtn = [...pill.querySelectorAll('.approval-pill-deny button')].find((b) => b.textContent?.trim() === 'Deny')
          if (!denyBtn || denyBtn.disabled) return 'no-confirm'
          denyBtn.click()
          return true
        })()`)
        .catch(() => 'js-error')) as string | boolean
      if (denied !== true) fail(`could not deny through the parked pill UI (${String(denied)})`)
    })
    const denyResolved = (await denyAck) as Extract<Scoped, { type: 'approval_resolved' }>
    if (denyResolved.reason !== BG_DENY_REASON) fail(`deny reason did not round-trip: ${denyResolved.reason}`)
    await denyEnded
    if (bgDeniedReason !== BG_DENY_REASON) fail('deny ack never reached the stream')
    if (existsSync(path.join(cwd, 'picode-deny-probe.txt'))) fail('the denied write tool executed anyway')
    await withWindow(getWindow, async (win) => {
      // The settled turn auto-folds (ticket 23) and a folded container
      // unmounts its inner rows — the denied pill only exists while the turn
      // streams or the container is open, so open the folds before probing
      // (otherwise this assertion is a first-poll race against the fold).
      await openAllTurnContainers(win)
      const shown = await waitForProbe(
        win,
        `(() => {
          const pill = document.querySelector('.approval-pill-denied[data-tool="write"]')
          return pill !== null && pill.textContent.includes('${BG_DENY_REASON}')
        })()`,
        5_000
      )
      if (!shown) fail('the denied pill did not surface the denial reason in the transcript')
      log('bg_deny_ok')
    })
    log('bg_approval_done')

    // ---- ticket 27: keymap remap — ⌘B sidebar / ⌥⌘B side panel / ⌘J
    // terminal / ⌥⌘J bridge (physical event.code judgment) ----
    log('keymap_start')
    await withWindow(getWindow, async (win) => {
      // R1 keycap tooltips: the four titlebar toggles advertise chords only.
      const tipsRaw = (await win.webContents.executeJavaScript(
        `JSON.stringify({
          sidebar: document.querySelector('button[aria-label="Show sidebar"], button[aria-label="Hide sidebar"]')?.dataset.tipShortcut ?? null,
          sidePanel: document.querySelector('button[aria-label="Open side panel"], button[aria-label="Close side panel"]')?.dataset.tipShortcut ?? null,
          terminal: document.querySelector('button[aria-label="Toggle terminal"]')?.dataset.tipShortcut ?? null,
          bridge: document.querySelector('button[aria-label="Toggle agent bridge"]')?.dataset.tipShortcut ?? null
        })`
      ).catch(() => 'unavailable')) as string
      const tips = JSON.parse(tipsRaw) as Record<string, string | null>
      if (tips.sidebar !== '⌘B' || tips.sidePanel !== '⌥⌘B' || tips.terminal !== '⌘J' || tips.bridge !== '⌥⌘J') {
        fail(`titlebar keycap tooltips wrong: ${JSON.stringify(tips)}`)
      }
      log('keymap_tooltips_ok')

      // Physical-key judgment: the synthetic events carry ONLY code +
      // modifiers — exactly the fields the resolver reads (⌥⌘ rewrites the
      // derived character on macOS, so key-based events would never match).
      const press = (code: string, alt: boolean): Promise<unknown> =>
        win.webContents.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', altKey: ${alt}, metaKey: true, bubbles: true }))`
        )
      /** Sidebar / side-panel open state (ticket 40): panes stay mounted
      * while closed — the closed end state is the [data-closed] attribute
      * (size 0 + opacity 0 + pointer-events none), not absence. */
      const paneOpen = (selector: string): string =>
        `(() => { const el = document.querySelector('${selector}'); return el !== null && !el.hasAttribute('data-closed') })()`
      /** Dock state string: closed | terminal | bridge | unknown. */
      const DOCK_STATE = `(() => {
        const dock = document.querySelector('.terminal-dock')
        if (!dock || dock.hasAttribute('data-closed')) return 'closed'
        const panels = Array.from(document.querySelectorAll('.dock-panel'))
        if (panels[0]?.style.display !== 'none') return 'terminal'
        if (panels[1]?.style.display !== 'none') return 'bridge'
        return 'unknown'
      })()`

      // ⌘B flips the sidebar (open↔closed) from whatever state earlier
      // stages left it in.
      const sidebarBefore = (await win.webContents.executeJavaScript(paneOpen('.sidebar'))) as boolean
      await press('KeyB', false)
      const sidebarFlipped = await waitForProbe(
        win,
        `(${sidebarBefore} ? !(${paneOpen('.sidebar')}) : ${paneOpen('.sidebar')})`,
        5_000
      )
      if (!sidebarFlipped) fail(`⌘B never toggled the sidebar (was open: ${sidebarBefore})`)
      log('keymap_cmd_b_sidebar_ok')

      // ⌥⌘B flips the side panel the same way.
      const panelBefore = (await win.webContents.executeJavaScript(paneOpen('.side-panel'))) as boolean
      await press('KeyB', true)
      const panelFlipped = await waitForProbe(
        win,
        `(${panelBefore} ? !(${paneOpen('.side-panel')}) : ${paneOpen('.side-panel')})`,
        5_000
      )
      if (!panelFlipped) fail(`⌥⌘B never toggled the side panel (was open: ${panelBefore})`)
      log('keymap_alt_cmd_b_panel_ok')

      // ⌘J opens the dock showing the terminal / closes it when showing.
      const dockBefore = (await win.webContents.executeJavaScript(DOCK_STATE)) as string
      await press('KeyJ', false)
      const dockAfterJ = await waitForProbe(
        win,
        `${DOCK_STATE} === '${dockBefore === 'terminal' ? 'closed' : 'terminal'}'`,
        5_000
      )
      if (!dockAfterJ) fail(`⌘J dock state went ${dockBefore} → unexpected (expected the toggle)`)
      log('keymap_cmd_j_terminal_ok')

      // ⌥⌘J shows the bridge (from terminal/closed), second press closes.
      await press('KeyJ', true)
      const dockBridge = await waitForProbe(win, `${DOCK_STATE} === 'bridge'`, 5_000)
      if (!dockBridge) fail('⌥⌘J never showed the bridge panel')
      log('keymap_alt_cmd_j_bridge_ok')
      await press('KeyJ', true)
      const dockClosed = await waitForProbe(win, `${DOCK_STATE} === 'closed'`, 5_000)
      if (!dockClosed) fail('second ⌥⌘J never closed the dock')
      log('keymap_bridge_toggle_off_ok')
      // Leave the dock as found: reopen if this stage found it open.
      if (dockBefore !== 'closed') {
        await press('KeyJ', dockBefore === 'bridge')
        await waitForProbe(win, `${DOCK_STATE} === '${dockBefore}'`, 5_000)
      }

      // ---- ticket 40: pane open/close motion — end-state sizes + the
      // transition grammar must be in place after the four-key toggles.
      // Each pane's end-state size must equal its App-projected open/close
      // variable (the animated target), and the computed transition must
      // carry size + opacity (+ visibility) at the calibrated 200ms ease-out.
      const motionProbe = `(() => {
        const pane = (sel, sizeProp) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const cs = getComputedStyle(el)
          return {
            closed: el.hasAttribute('data-closed'),
            size: el.getBoundingClientRect()[sizeProp],
            target: parseFloat(cs.getPropertyValue(sel === '.terminal-dock' ? '--dock-h' : sel === '.sidebar' ? '--sidebar-w' : '--panel-w')),
            transitionProperty: cs.transitionProperty,
            transitionDuration: cs.transitionDuration,
            transitionTimingFunction: cs.transitionTimingFunction,
            opacity: Number(cs.opacity),
            pointerEvents: cs.pointerEvents,
            visibility: cs.visibility
          }
        }
        return JSON.stringify({
          sidebar: pane('.sidebar', 'width'),
          panel: pane('.side-panel', 'width'),
          dock: pane('.terminal-dock', 'height')
        })
      })()`
      // The open/close transition takes 200ms — wait for every pane's real
      // size AND opacity to settle on their end states before asserting
      // (subpixel size can land a frame before the opacity fade ends).
      const motionSettled = await waitForProbe(
        win,
        `(() => { const m = JSON.parse((${motionProbe}));
          return [m.sidebar, m.panel, m.dock].every((p) => p !== null && Math.abs(p.size - p.target) < 0.5 && (p.closed ? p.opacity === 0 : p.opacity === 1)) })()`,
        5_000
      )
      if (!motionSettled) fail('ticket 40: pane sizes never settled on their projected targets after the four-key toggles')
      const motion = JSON.parse((await win.webContents.executeJavaScript(motionProbe)) as string) as Record<
        string,
        {
          closed: boolean
          size: number
          target: number
          transitionProperty: string
          transitionDuration: string
          transitionTimingFunction: string
          opacity: number
          pointerEvents: string
          visibility: string
        }
      >
      for (const [name, pane] of Object.entries(motion)) {
        const sizeProp = name === 'dock' ? 'height' : 'width'
        if (!pane.transitionProperty.includes(sizeProp) || !pane.transitionProperty.includes('opacity') || !pane.transitionProperty.includes('visibility')) {
          fail(`ticket 40: ${name} transition grammar missing size/opacity/visibility: ${pane.transitionProperty}`)
        }
        if (!pane.transitionDuration.split(', ').every((d) => d === '0.2s')) {
          fail(`ticket 40: ${name} transition duration is not the calibrated 200ms: ${pane.transitionDuration}`)
        }
        if (!pane.transitionTimingFunction.split(', ').every((t) => t.includes('ease-out'))) {
          fail(`ticket 40: ${name} transition timing is not ease-out: ${pane.transitionTimingFunction}`)
        }
        if (pane.closed) {
          // Closed end state: size 0 + opacity 0 + pointer-events none.
          if (Math.round(pane.size) !== 0 || pane.opacity !== 0 || pane.pointerEvents !== 'none') {
            fail(`ticket 40: closed ${name} end state wrong (size ${pane.size}, opacity ${pane.opacity}, pointer-events ${pane.pointerEvents})`)
          }
        } else if (pane.opacity !== 1) {
          fail(`ticket 40: open ${name} must be fully opaque at rest: ${pane.opacity}`)
        }
      }
      log('keymap_pane_motion_ok', `sidebar=${motion.sidebar.size}px panel=${motion.panel.size}px dock=${motion.dock.size}px`)
    })
    log('keymap_done')

    // ---- ticket 31: preview multi-tab — per-file tabs, the management
    // dropdown, and recently closed persistence across a renderer restart ----
    log('panel_tabs_start')
    const panelSeed = seedPanelWorkspace()
    try {
      await withWindow(getWindow, async (win) => {
        // A focused session anchored at the seeded git workspace gives the
        // Review tab real deep-linkable rows.
        supervisor.createSession(panelSeed)
        const seeded = (await waitFor(
          (e) => e.type === 'session_created' && e.cwd === panelSeed,
          'panel session_created'
        )) as Extract<Scoped, { type: 'session_created' }>
        log('panel_session_ok', `sessionId=${seeded.sessionId}`)

        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        /** Panel open state (ticket 40: panes stay mounted while closed —
        * the [data-closed] attribute is the closed end state); open with
        * ⌥⌘B when needed. */
        const panelOpen = `(() => { const p = document.querySelector('.side-panel'); return p !== null && !p.hasAttribute('data-closed') })()`
        if (!((await js(panelOpen)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true }))`)
          await waitForProbe(win, panelOpen, 5_000)
        }

        // Open the Review tab through the picker when it is not open.
        const reviewInStrip = `( !!Array.from(document.querySelectorAll('.panel-tab-label span')).find((el) => el.textContent === 'Review') )`
        if (!((await js(reviewInStrip)) as boolean)) {
          await js(`document.querySelector('.panel-add-tab')?.click(); true`)
          for (let waited = 0; waited < 5_000; waited += 100) {
            const picked = (await js(
              `(() => { const card = document.querySelector('.panel-tab-card[aria-label="Open Review tab"]'); if (card instanceof HTMLElement) { card.click(); return true } return false })()`
            )) as boolean
            if (picked) break
            await new Promise((r) => setTimeout(r, 100))
          }
        }
        await waitForProbe(win, `(document.querySelector('.review-tree-file') !== null)`, 15_000)
        log('panel_review_tree_ok')

        /** Click the deep-link chip of the nth changed file row. */
        const clickChip = (row: number): string =>
          `(() => { const rows = document.querySelectorAll('.review-tree-file'); const chip = rows[${row}]?.querySelector('.review-tree-open'); if (chip instanceof HTMLElement) { chip.click(); return true } return false })()`
        /** Number of tabs in the strip. */
        const TAB_COUNT = `document.querySelectorAll('.panel-tab-label span').length`
        const tabLabels = async (): Promise<string[]> =>
          JSON.parse((await js(
            `JSON.stringify(Array.from(document.querySelectorAll('.panel-tab-label span')).map((el) => el.textContent))`
          )) as string) as string[]
        /** Click the strip tab whose label matches, or its close button. */
        const tabWithLabel = (label: string, action: 'activate' | 'close'): string =>
          `(() => {
            for (const tabEl of document.querySelectorAll('.panel-tab')) {
              if (tabEl.querySelector('.panel-tab-label span')?.textContent !== '${label}') continue
              const target = tabEl.querySelector('${action === 'activate' ? '.panel-tab-label' : '.panel-tab-close'}')
              if (target instanceof HTMLElement) { target.click(); return true }
            }
            return false
          })()`

        // Deep-link 1: the first changed file becomes its own tab
        // (strip was [Review] → [Review, file]).
        if (!(await waitForProbe(win, clickChip(0), 5_000))) fail('the first review deep-link chip never rendered')
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 2`, 5_000))) fail('the first deep link never opened its own file tab')
        log('panel_file_tab_one_ok')

        // In-tab navigation (operator feedback): clicking a crumb INSIDE the
        // preview moves THIS tab to the destination in place — the strip
        // never grows; only sidebar deep links open tabs.
        const dirLabel = path.basename(panelSeed)
        // The crumb lives in the ACTIVE tab's BODY (the strip tab carries no
        // content) — select via the body that is not hidden.
        await js(
          `(() => { const crumb = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) button.preview-crumb'); if (crumb instanceof HTMLElement) { crumb.click(); return true } return false })()`
        )
        await waitForProbe(
          win,
          `( (${TAB_COUNT}) === 2 && document.querySelector('.panel-tab-active .panel-tab-label span')?.textContent === '${dirLabel}' )`,
          8_000
        )
        log('panel_retarget_in_place_ok', dirLabel)

        // Deep-link 2: a second file opens a SECOND tab — no replacement.
        if (!(await waitForProbe(win, clickChip(1), 5_000))) fail('the second review deep-link chip never rendered')
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 3`, 5_000))) fail('the second deep link did not open a second file tab')
        const labels = await tabLabels()
        const fileLabels = labels.slice(1)
        if (fileLabels.length !== 2 || new Set(fileLabels).size !== 2) {
          fail(`expected Review + two distinct file tabs, saw ${labels.join(',')}`)
        }
        log('panel_file_tab_two_ok', labels.join(','))

        // The second deep link left its tab active; switching must not
        // disturb the other file tab.
        await waitForProbe(win, tabWithLabel(fileLabels[0]!, 'activate'), 5_000)
        const switched = (await js(
          `document.querySelector('.panel-tab-active .panel-tab-label span')?.textContent`
        )) as string
        if (switched !== fileLabels[0]) fail(`activation went to '${switched}', expected '${fileLabels[0]}'`)

        // Closing one file tab leaves the other untouched
        // ([Review, alpha, beta] → close alpha → [Review, beta]).
        if (!(await waitForProbe(win, tabWithLabel(fileLabels[0]!, 'close'), 5_000))) fail('the file tab to close never rendered')
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 2`, 5_000))) fail('closing a file tab did not remove it from the strip')
        if (!((await tabLabels()).includes(fileLabels[1]!))) fail('closing one file tab killed the other')
        log('panel_close_independent_ok')

        // The management dropdown: sections + the closed file under Recently
        // Closed Tabs.
        await js(`document.querySelector('button[aria-label="Manage tabs"]')?.click(); true`)
        await waitForProbe(win, `(document.querySelector('.panel-tab-menu') !== null)`, 5_000)
        const menuHasRecent = `( !!Array.from(document.querySelectorAll('.panel-menu-row .panel-menu-row-label')).find((el) => el.textContent === '${fileLabels[0]}') )`
        if (!((await js(`( document.querySelector('.panel-tab-menu-section')?.textContent === 'Open Tabs' && ${menuHasRecent} )`)) as boolean)) {
          fail('tab dropdown does not show Open Tabs + the recently closed entry')
        }
        log('panel_dropdown_ok')

        // Search: query the closed file's name, then Enter reopens it.
        const typeQuery = (q: string): string =>
          `(() => {
            const input = document.querySelector('.panel-tab-menu-search input')
            if (!(input instanceof HTMLInputElement)) return false
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
            setter.call(input, '${q}')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`
        await waitForProbe(win, typeQuery(fileLabels[0]!), 5_000)
        await waitForProbe(win, `(document.querySelector('.panel-tab-menu-count') !== null)`, 5_000)
        const countShown = (await js(
          `document.querySelector('.panel-tab-menu-count')?.textContent ?? ''`
        )) as string
        if (!/^1\/1$/.test(countShown)) fail(`search match counter read '${countShown}', expected 1/1`)
        await js(
          `document.querySelector('.panel-tab-menu-search input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); true`
        )
        await js(
          `document.querySelector('.panel-tab-menu-search input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`
        )
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 3`, 5_000))) fail('search+Enter never reopened the recently closed tab')
        log('panel_search_reopen_ok')

        // Close it again, then prove the preference round-trip: the closed
        // entry must reach the persisted preferences document.
        await waitForProbe(win, tabWithLabel(fileLabels[0]!, 'close'), 5_000)
        let closedJson = ''
        for (let waited = 0; waited < 10_000 && !closedJson.includes(fileLabels[0]!); waited += 200) {
          closedJson = (await js(
            `window.picode.settings.get().then((s) => JSON.stringify(s.preferences.recentlyClosedTabs)).catch(() => 'err')`
          )) as string
          if (closedJson.includes(fileLabels[0]!)) break
          await new Promise((r) => setTimeout(r, 200))
        }
        if (!closedJson.includes(fileLabels[0]!)) fail(`recently closed never reached preferences: ${closedJson}`)
        log('panel_preferences_ok')

        // RESTART: a renderer reload re-hydrates the persisted history —
        // the recently closed entry must survive and reopen from scratch.
        await win.webContents.reload()
        await waitForProbe(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
        await new Promise((r) => setTimeout(r, 500))
        // Press-until-open: the fresh renderer's keymap listener may not
        // be attached when the marker first flips (ticket 40: the panel is
        // always mounted — open state is the absence of [data-closed]).
        await waitForProbe(
          win,
          `(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true }))
            const p = document.querySelector('.side-panel')
            return p !== null && !p.hasAttribute('data-closed')
          })()`,
          5_000
        )
        await js(`document.querySelector('button[aria-label="Manage tabs"]')?.click(); true`)
        await waitForProbe(win, `(document.querySelector('.panel-tab-menu') !== null)`, 5_000)
        await waitForProbe(win, menuHasRecent, 10_000)
        log('panel_restart_keep_ok')

        // Click the persisted entry: it returns as a live tab.
        const clickRecent = `(() => {
          for (const rowEl of document.querySelectorAll('.panel-menu-row')) {
            if (rowEl.querySelector('.panel-menu-row-label')?.textContent !== '${fileLabels[0]}') continue
            const main = rowEl.querySelector('.panel-menu-row-main')
            if (main instanceof HTMLElement) { main.click(); return true }
          }
          return false
        })()`
        await waitForProbe(win, clickRecent, 5_000)
        await waitForProbe(
          win,
          `( !!Array.from(document.querySelectorAll('.panel-tab-label span')).find((el) => el.textContent === '${fileLabels[0]}') )`,
          5_000
        )
        log('panel_reopen_after_restart_ok')

        // Leave a clean preference store behind (the stage's own entries).
        await js(`window.picode.settings.set({ recentlyClosedTabs: [] }); true`)
      })
    } finally {
      rmSync(panelSeed, { recursive: true, force: true })
    }
    log('panel_tabs_done')

    // ---- ticket 86: zero-tabs auto-collapse — closing the LAST panel tab
    // collapses the panel instead of lingering as an open empty picker
    // shell. Runs right after the ticket-31 panel stage (panel open, a
    // file tab from that stage still up) and is written state-agnostic:
    //   ① close every open tab; the close that empties the strip must flip
    //     the shell to [data-closed] with NO visible picker left behind.
    //   ② ⌥⌘B reopens onto the zero-tab picker page; the Review card opens
    //     a real tab (seeded git workspace → review tree), a review
    //     deep-link chip opens a second file tab, and closing the FILE tab
    //     (not the last) must keep the panel open — ordinary closes never
    //     collapse; only the last one does.
    //   ③ ⌥⌘B reopens again; the closed file comes back from the ⌄ menu's
    //     Recently Closed section (tab + open panel).
    //   ④ from the collapsed zero-tab state a sidebar context-menu deep
    //     link (View call trace) must auto-expand the panel — the
    //     regression guard: a deep-linked tab BODY renders even inside the
    //     closed (visibility-hidden) pane, so only the open shell state
    //     proves the re-expansion really happened.
    // One settle turn (the multi-stage precedent: the sidebar row needs the
    // session file on disk) + a seeded workspace; the recently closed
    // preference is cleaned up and the panel is left closed.
    log('panel_collapse_86_start')
    const seed86 = seedPanelWorkspace()
    try {
      await withWindow(getWindow, async (win) => {
        supervisor.createSession(seed86)
        const seeded86 = (await waitFor(
          (e) => e.type === 'session_created' && e.cwd === seed86,
          'panel-86 session_created'
        )) as Extract<Scoped, { type: 'session_created' }>
        if (!seeded86.sessionFile) fail('ticket-86 stage: the seeded session did not report its file')
        // The sidebar row must exist for the leg-④ deep link — the multi
        // stage's precedent: a settle turn puts the file on disk so the
        // index lists the session.
        supervisor.handleParentCommand({
          type: 'session_command',
          sessionId: seeded86.sessionId,
          command: { type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' }
        })
        await waitFor((e) => e.type === 'agent_end' && e.sessionId === seeded86.sessionId, 'panel-86 settle agent_end')
        log('panel_86_session_ok', seeded86.sessionId)

        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        // Ticket 40: the panel stays mounted while closed — [data-closed]
        // is the closed end state, so the open/closed probe reads the
        // attribute, not element absence.
        const PANEL_OPEN_86 = `(() => { const p = document.querySelector('.side-panel'); return p !== null && !p.hasAttribute('data-closed') })()`
        const PANEL_CLOSED_86 = `(() => { const p = document.querySelector('.side-panel'); return p !== null && p.hasAttribute('data-closed') })()`
        const TAB_COUNT_86 = `document.querySelectorAll('.panel-tab-label span').length`
        // The picker page shown by an OPEN, actually-visible shell.
        // (getClientRects is useless here: a visibility:hidden pane keeps
        // its layout boxes, so rects stay non-empty — the computed shell
        // state is the truth.) This is the "empty shell residue" probe.
        const PICKER_SHOWN_86 = `(() => {
          const panel = document.querySelector('.side-panel')
          const picker = document.querySelector('.panel-empty')
          if (!panel || !picker) return false
          if (panel.hasAttribute('data-closed')) return false
          const cs = getComputedStyle(panel)
          return cs.visibility === 'visible' && cs.opacity !== '0' && panel.offsetWidth > 0
        })()`
        const CLOSE_FIRST_TAB_86 = `(() => {
          const closeBtn = document.querySelector('.panel-tab .panel-tab-close')
          if (closeBtn instanceof HTMLElement) { closeBtn.click(); return true }
          return false
        })()`
        /** Press-until-open with toggle-race protection: a SYNCHRONOUS
         * dispatch+check inside one evaluate reads the PRE-dispatch DOM
         * (React schedules the re-render as a macro task), reports false,
         * and the next poll re-dispatches into a toggle ping-pong. So:
         * press, give the commit ≥400ms to land, re-check, and press again
         * only while the panel is still closed (covers the fresh-renderer
         * case where the keymap listener is not attached yet). */
        const pressPanelOpen86 = async (): Promise<boolean> => {
          const deadline = Date.now() + 10_000
          let lastPress = -Infinity
          while (Date.now() < deadline) {
            if (((await js(PANEL_OPEN_86)) as boolean) === true) return true
            if (Date.now() - lastPress >= 400) {
              await js(
                `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true })); true`
              )
              lastPress = Date.now()
            }
            await new Promise((r) => setTimeout(r, 100))
          }
          return false
        }

        // ① Close whatever the earlier stages left open, one tab per
        // click; the strip must shrink stepwise and the LAST close must
        // auto-collapse the shell with no picker residue.
        for (let guard = 0; guard < 8; guard++) {
          const count = (await js(TAB_COUNT_86)) as number
          if (count === 0) break
          if (!(await waitForProbe(win, CLOSE_FIRST_TAB_86, 5_000))) {
            fail('ticket-86 stage: no strip tab close button ever rendered')
          }
          await waitForProbe(win, `(${TAB_COUNT_86}) === ${count - 1}`, 5_000)
        }
        if (((await js(TAB_COUNT_86)) as number) !== 0) fail('ticket-86 stage: the strip never emptied')
        if (!(await waitForProbe(win, PANEL_CLOSED_86, 5_000))) {
          fail('ticket-86 stage: closing the last tab never collapsed the panel (auto-collapse broken)')
        }
        if (((await js(PICKER_SHOWN_86)) as boolean) === true) {
          fail('ticket-86 stage: the collapsed panel still shows the empty picker shell')
        }
        log('panel_86_autocollapse_ok')

        // ② Reopen onto the zero-tab picker page; the Review card must open
        // a real tab over the seeded workspace.
        if (!(await pressPanelOpen86())) fail('ticket-86 stage: ⌥⌘B never reopened the collapsed panel')
        if (!(await waitForProbe(win, PICKER_SHOWN_86, 5_000))) {
          fail('ticket-86 stage: reopening with zero tabs never showed the picker page')
        }
        log('panel_86_reopen_picker_ok')
        await js(`document.querySelector('.panel-tab-card[aria-label="Open Review tab"]')?.click(); true`)
        if (!(await waitForProbe(win, `document.querySelector('.review-tree-file') !== null`, 15_000))) {
          fail('ticket-86 stage: the Review tab never rendered the seeded workspace tree')
        }

        // A review deep-link chip opens a second tab; closing the FILE tab
        // (not the last) must keep the panel open.
        const CLICK_CHIP_86 = `(() => {
          const chip = document.querySelector('.review-tree-file .review-tree-open')
          if (chip instanceof HTMLElement) { chip.click(); return true }
          return false
        })()`
        if (!(await waitForProbe(win, CLICK_CHIP_86, 5_000))) fail('ticket-86 stage: the review deep-link chip never rendered')
        if (!(await waitForProbe(win, `(${TAB_COUNT_86}) === 2`, 5_000))) {
          fail('ticket-86 stage: the review deep link never opened its file tab')
        }
        const CLOSE_FILE_TAB_86 = `(() => {
          for (const tabEl of document.querySelectorAll('.panel-tab')) {
            if (tabEl.querySelector('.panel-tab-label span')?.textContent === 'Review') continue
            const target = tabEl.querySelector('.panel-tab-close')
            if (target instanceof HTMLElement) { target.click(); return true }
          }
          return false
        })()`
        if (!(await waitForProbe(win, CLOSE_FILE_TAB_86, 5_000))) fail('ticket-86 stage: the file tab close button never rendered')
        await waitForProbe(win, `(${TAB_COUNT_86}) === 1`, 5_000)
        if (((await js(PANEL_OPEN_86)) as boolean) !== true) {
          fail('ticket-86 stage: closing a NON-last tab collapsed the panel (over-trigger)')
        }
        log('panel_86_partial_close_ok')

        // The remaining tab is the last one: closing it collapses again.
        if (!(await waitForProbe(win, CLOSE_FIRST_TAB_86, 5_000))) fail('ticket-86 stage: the last tab close never rendered')
        if (!(await waitForProbe(win, PANEL_CLOSED_86, 5_000))) {
          fail('ticket-86 stage: the second last-close never collapsed the panel')
        }
        log('panel_86_autocollapse_again_ok')

        // ③ Reopen; the closed file must come back from the ⌄ menu's
        // Recently Closed section (rows with a close time) as a live tab.
        if (!(await pressPanelOpen86())) fail('ticket-86 stage: ⌥⌘B never reopened the panel for the menu leg')
        await js(`document.querySelector('button[aria-label="Manage tabs"]')?.click(); true`)
        if (!(await waitForProbe(win, `document.querySelector('.panel-tab-menu') !== null`, 5_000))) {
          fail('ticket-86 stage: the tab menu never opened for the recently closed leg')
        }
        const CLICK_RECENT_86 = `(() => {
          const row = Array.from(document.querySelectorAll('.panel-menu-row')).find((el) => el.querySelector('.panel-menu-row-time') !== null)
          const main = row?.querySelector('.panel-menu-row-main')
          if (main instanceof HTMLElement) { main.click(); return true }
          return false
        })()`
        if (!(await waitForProbe(win, CLICK_RECENT_86, 5_000))) {
          fail('ticket-86 stage: no recently closed entry ever rendered in the tab menu')
        }
        if (!(await waitForProbe(win, `(${TAB_COUNT_86}) === 1`, 5_000))) {
          fail('ticket-86 stage: the recently closed tab never reopened from the menu')
        }
        if (((await js(PANEL_OPEN_86)) as boolean) !== true) {
          fail('ticket-86 stage: reopening from the menu left the panel closed')
        }
        log('panel_86_recent_reopen_ok')

        // ④ Deep link from the collapsed zero-tab state: close the tab
        // (last → collapse), then View call trace from the seeded
        // session's sidebar row.
        if (!(await waitForProbe(win, CLOSE_FIRST_TAB_86, 5_000))) fail('ticket-86 stage: the pre-deeplink close never rendered')
        if (!(await waitForProbe(win, PANEL_CLOSED_86, 5_000))) {
          fail('ticket-86 stage: the pre-deeplink last-close never collapsed the panel')
        }
        const OPEN_TRACE_MENU_86 = `(() => {
          const row = document.querySelector('[data-file="${seeded86.sessionFile}"]')
          if (!(row instanceof Element)) return false
          // The seeded project's group sits at the bottom of a long sidebar —
          // a contextmenu dispatched at an off-screen rect opens nothing.
          row.scrollIntoView({ block: 'center' })
          const r = row.getBoundingClientRect()
          row.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true,
            clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
          }))
          return true
        })(); true`
        if (!(await waitForProbe(win, OPEN_TRACE_MENU_86 + ` && document.querySelector('.sb-context-menu') !== null`, 15_000))) {
          const sidebar86 = (await js(
            `JSON.stringify({ taskRows: document.querySelectorAll('.sb-task').length, files: Array.from(document.querySelectorAll('[data-file]')).slice(0, 30).map((el) => el.getAttribute('data-file')) })`
          )) as string
          fail(`ticket-86 stage: the sidebar context menu never opened for View call trace; sidebar: ${sidebar86}`)
        }
        await js(
          `[...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'View call trace')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
        )
        if (!(await waitForProbe(win, PANEL_OPEN_86, 10_000))) {
          fail('ticket-86 stage: the trace deep link never auto-expanded the collapsed panel')
        }
        if (!(await waitForProbe(win, `document.querySelector('.side-panel .trace-view') !== null`, 10_000))) {
          fail('ticket-86 stage: the trace tab body never rendered after the deep link')
        }
        log('panel_86_deeplink_expand_ok')

        // Leave the shell clean for the later stages: close the trace tab
        // (last → auto-collapses again) and drop the stage's history
        // entries from the persisted preferences.
        await waitForProbe(win, CLOSE_FIRST_TAB_86, 5_000)
        await waitForProbe(win, PANEL_CLOSED_86, 5_000)
        await js(`window.picode.settings.set({ recentlyClosedTabs: [] }); true`)
      })
    } finally {
      rmSync(seed86, { recursive: true, force: true })
    }
    log('panel_collapse_86_done')

    // ---- ticket 88: preview dual view — svg/html rendered+source, png
    // direct display. Real fixture files in a throwaway directory; the
    // sidebar group's "View files" browser deep-links rows into preview
    // tabs. Assertions: html opens RENDERED in the sandboxed iframe
    // (allow-scripts ONLY — the fixture's inline script posts a probe
    // proving it RAN while require/process/window.picode are all undefined
    // inside the frame, and contentDocument is null from this side); the
    // relative css/img load against the file's directory; svg opens as a
    // static img data-URL; png displays directly with NO segmented control;
    // markdown dual-state and the binary refusal zero-regress. No model
    // call; the composer is left untouched. ----
    log('preview_dual_88_start')
    {
      const PNG_88 = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAIAAAD3UuoiAAAAF0lEQVR4nGPwr/lPFcQwatCoQaMG4UMAAIsDX/fiMDsAAAAASUVORK5CYII=',
        'base64'
      )
      const seed88 = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-preview88-'))
      writeFileSync(
        path.join(seed88, 'report.html'),
        `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>PICODE88 report</title>\n<link rel="stylesheet" href="report.css">\n</head>\n<body>\n<h1 class="p88-head">PENDING</h1>\n<img id="p88-img" alt="dot" src="dot.png">\n<script>\n  (function () {\n    var img = document.getElementById('p88-img')\n    var probe = {\n      probe: 'picode-88',\n      ran: true,\n      node: typeof require,\n      proc: typeof process,\n      picode: typeof window.picode,\n      title: document.title,\n      css: getComputedStyle(document.body).backgroundColor,\n      img: img !== null && img.naturalWidth > 0\n    }\n    try { parent.postMessage(JSON.stringify(probe), '*') } catch (e) {}\n    var head = document.querySelector('.p88-head')\n    if (head) head.textContent = 'PICODE88_SCRIPT_RAN'\n  })()\n</script>\n</body>\n</html>\n`
      )
      writeFileSync(path.join(seed88, 'report.css'), 'body { background-color: rgb(255, 240, 224); font-family: sans-serif; }\n.p88-head { color: #b45309; }\n')
      writeFileSync(path.join(seed88, 'dot.png'), PNG_88)
      writeFileSync(
        path.join(seed88, 'diagram.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect x="2" y="2" width="156" height="76" rx="10" fill="#eef2ff" stroke="#4f7cff" stroke-width="2"/><text x="80" y="46" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#1e3a8a">PICODE88 SVG</text></svg>\n'
      )
      writeFileSync(path.join(seed88, 'notes.md'), '# PICODE88 notes\n\nSome **bold** and `code`.\n')
      writeFileSync(path.join(seed88, 'logo.bin'), Buffer.from([0x00, 0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]))
      // Git-seed like the panel stage: one committed seed file, the fixtures
      // UNTRACKED — the Review tab lists them (untracked = whole-file adds)
      // and the preview chips deep-link the preview tabs without any
      // session-index/sidebar dependency.
      const git88 = (args: string[]): string => execFileSync('git', args, { cwd: seed88, stdio: 'pipe' }).toString()
      git88(['-c', 'user.email=smoke@picode.local', '-c', 'user.name=PiCode Smoke', '-c', 'commit.gpgsign=false', 'init', '-q'])
      writeFileSync(path.join(seed88, 'seed.txt'), 'seed\n')
      // Add ONLY the seed file — the fixtures must stay untracked so the
      // Review tree lists them (whole-file adds).
      git88(['-c', 'user.email=smoke@picode.local', '-c', 'user.name=PiCode Smoke', '-c', 'commit.gpgsign=false', 'add', 'seed.txt'])
      git88(['-c', 'user.email=smoke@picode.local', '-c', 'user.name=PiCode Smoke', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'seed'])
      try {
        supervisor.createSession(seed88)
        await waitFor((e) => e.type === 'session_created' && e.cwd === seed88, 'preview-88 session_created')
        log('preview_88_session_ok')

        await withWindow(getWindow, async (win) => {
          const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
          const ACTIVE = `.panel-tab-body:not(.panel-tab-body-hidden)`
          const tabOpen = (name: string): string =>
            `[...document.querySelectorAll('.panel-tab-label span')].some((el) => el.textContent === '${name}')`
          const clickSegment = (want: 'Rendered' | 'Source'): string =>
            `(() => {\n              const body = document.querySelector('${ACTIVE}')\n              for (const button of body?.querySelectorAll('.review-segmented button') ?? []) {\n                if (!(button.textContent ?? '').includes('${want}')) continue\n                if (button.getAttribute('aria-selected') !== 'true') button.click()\n                return true\n              }\n              return false\n            })()`
          /** The Review tab's preview chip for the fixture row with this
           * name (ticket-31 deep link precedent). */
          const clickReviewChip = (name: string): string =>
            `(() => {\n              for (const row of document.querySelectorAll('.review-tree-file')) {\n                if (row.querySelector('.review-tree-name')?.textContent !== '${name}') continue\n                const chip = row.querySelector('.review-tree-open')\n                if (chip instanceof HTMLElement) { chip.click(); return true }\n                return false\n              }\n              return false\n            })()`

          // Reopen the side panel (the 86 stage left it collapsed) and open
          // the Review tab over the seeded workspace: zero tabs → the picker
          // page shows immediately, one click on the Review card.
          const panelOpen = `(() => { const p = document.querySelector('.side-panel'); return p !== null && !p.hasAttribute('data-closed') })()`
          if (!((await js(panelOpen)) as boolean)) {
            await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true }))`)
            if (!(await waitForProbe(win, panelOpen, 10_000))) {
              fail('ticket-88 stage: ⌥⌘B never reopened the collapsed panel')
            }
          }
          await waitForProbe(win, `document.querySelector('.panel-tab-card[aria-label="Open Review tab"]') !== null`, 10_000)
          await js(`document.querySelector('.panel-tab-card[aria-label="Open Review tab"]')?.click(); true`)
          if (!(await waitForProbe(win, `document.querySelectorAll('.review-tree-file').length >= 5`, 20_000))) {
            const diag = (await js(
              `JSON.stringify({\n                tabs: [...document.querySelectorAll('.panel-tab-label span')].map((el) => el.textContent),\n                reviewView: document.querySelector('.review-view') !== null,\n                reviewTreeRows: document.querySelectorAll('.review-tree-file').length,\n                reviewEmpty: document.querySelector('.review-empty')?.textContent ?? null,\n                reviewToolbar: document.querySelector('.review-toolbar')?.textContent?.slice(0, 80) ?? null\n              })`
            ).catch(() => 'unavailable')) as string
            fail(`ticket-88 stage: the Review tree never listed the untracked fixtures; review: ${diag}`)
          }
          log('preview_88_review_tree_ok')

          // Arm the frame-message collector BEFORE the html preview loads.
          await js(`window.__p88msgs = []; window.addEventListener('message', (e) => { window.__p88msgs.push(String(e.data)) }); true`)

          /** Open one fixture from the Review tree and wait for its tab. */
          const openFixture = async (name: string): Promise<void> => {
            if (!(await waitForProbe(win, clickReviewChip(name), 10_000))) {
              fail(`ticket-88 stage: the ${name} row never rendered its preview chip`)
            }
            if (!(await waitForProbe(win, tabOpen(name), 10_000))) {
              fail(`ticket-88 stage: ${name} never deep-linked into a preview tab`)
            }
          }

          // ① HTML: default RENDERED inside the sandboxed iframe.
          await openFixture('report.html')
          const frameOk = await waitForProbe(
            win,
            `(() => {\n              const frame = document.querySelector('${ACTIVE} .preview-html-frame')\n              return frame !== null\n                && frame.getAttribute('sandbox') === 'allow-scripts'\n                && (frame.getAttribute('src') ?? '').startsWith('preview-file://local/')\n                && frame.contentDocument === null\n            })()`,
            10_000
          )
          if (!frameOk) {
            fail('ticket-88 stage: the html iframe is missing or violates the sandbox contract (sandbox/src/contentDocument)')
          }
          const probeArrived = await waitForProbe(
            win,
            `(window.__p88msgs ?? []).some((m) => String(m).includes('"probe":"picode-88"'))`,
            10_000
          )
          if (!probeArrived) fail('ticket-88 stage: the in-frame probe never posted a message (inline script did not run?)')
          const probe = JSON.parse(
            ((await js(`(window.__p88msgs ?? []).find((m) => String(m).includes('"probe":"picode-88"'))`)) as string) ?? '{}'
          ) as Record<string, unknown>
          if (probe['ran'] !== true) fail('ticket-88 stage: the frame inline script did not run')
          if (probe['node'] !== 'undefined' || probe['proc'] !== 'undefined' || probe['picode'] !== 'undefined') {
            fail(`ticket-88 stage: the frame sees host/app globals: ${JSON.stringify(probe)}`)
          }
          if (probe['css'] !== 'rgb(255, 240, 224)' || probe['img'] !== true) {
            fail(`ticket-88 stage: relative resources failed (css=${String(probe['css'])} img=${String(probe['img'])})`)
          }
          log('preview_88_html_ok', JSON.stringify(probe))

          // Source state: iframe gone, code + wrap toggle present; back to rendered.
          if (!(await js(clickSegment('Source')))) fail('ticket-88 stage: the html Source segment never rendered')
          if (
            !(await waitForProbe(
              win,
              `document.querySelector('${ACTIVE} .preview-html-frame') === null\n               && document.querySelector('${ACTIVE} .code-view') !== null\n               && document.querySelector('.preview-wrap-toggle') !== null`,
              10_000
            ))
          ) {
            fail('ticket-88 stage: html Source never showed code with the wrap toggle')
          }
          if (!(await js(clickSegment('Rendered')))) fail('ticket-88 stage: the html Rendered segment never rendered')
          await waitForProbe(win, `document.querySelector('${ACTIVE} .preview-html-frame') !== null`, 10_000)
          log('preview_88_html_source_ok')

          // ② SVG: default RENDERED as a static img data-URL; Source shows markup.
          await openFixture('diagram.svg')
          if (
            !(await waitForProbe(
              win,
              `(() => { const img = document.querySelector('${ACTIVE} .preview-media img'); return img !== null && (img.getAttribute('src') ?? '').startsWith('data:image/svg+xml;base64,') })()`,
              10_000
            ))
          ) {
            fail('ticket-88 stage: the svg never rendered as an img data-URL by default')
          }
          if (
            !(await waitForProbe(
              win,
              `document.querySelector('${ACTIVE} .review-segmented') !== null && document.querySelector('.preview-wrap-toggle') === null`,
              5_000
            ))
          ) {
            fail('ticket-88 stage: svg rendered state must show the segmented control and hide the wrap toggle')
          }
          if (!(await js(clickSegment('Source')))) fail('ticket-88 stage: the svg Source segment never rendered')
          if (!(await waitForProbe(win, `document.querySelector('${ACTIVE} .code-view') !== null`, 10_000))) {
            fail('ticket-88 stage: svg Source never showed the markup')
          }
          if (!(await js(clickSegment('Rendered')))) fail('ticket-88 stage: the svg Rendered segment never rendered')
          log('preview_88_svg_ok')

          // ③ PNG: direct display, single state — no segmented, no wrap toggle.
          await openFixture('dot.png')
          if (
            !(await waitForProbe(
              win,
              `(() => { const img = document.querySelector('${ACTIVE} .preview-media img'); return img !== null && (img.getAttribute('src') ?? '').startsWith('data:image/png;base64,') })()`,
              10_000
            ))
          ) {
            fail('ticket-88 stage: the png never displayed from its data URL')
          }
          if (
            !(await waitForProbe(
              win,
              `document.querySelector('${ACTIVE} .review-segmented') === null && document.querySelector('.preview-wrap-toggle') === null`,
              5_000
            ))
          ) {
            fail('ticket-88 stage: png must be single-state — no segmented control, no wrap toggle')
          }
          log('preview_88_png_ok')

          // ④ markdown dual-state zero-regression.
          await openFixture('notes.md')
          if (!(await waitForProbe(win, `document.querySelector('${ACTIVE} .preview-md') !== null`, 10_000))) {
            fail('ticket-88 stage: markdown never opened rendered (regression)')
          }
          if (!(await js(clickSegment('Source')))) fail('ticket-88 stage: the markdown Source segment never rendered')
          if (!(await waitForProbe(win, `document.querySelector('${ACTIVE} .code-view') !== null`, 10_000))) {
            fail('ticket-88 stage: markdown Source never showed the code view')
          }
          if (!(await js(clickSegment('Rendered')))) fail('ticket-88 stage: the markdown Rendered segment never rendered')
          log('preview_88_markdown_ok')

          // ⑤ binary refusal zero-regression (non-image binary).
          await openFixture('logo.bin')
          if (
            !(await waitForProbe(
              win,
              `(() => {\n                const body = document.querySelector('${ACTIVE}')\n                return body?.textContent?.includes('Binary file') === true\n                  && body.querySelector('.preview-media img') === null\n                  && body.querySelector('.review-segmented') === null\n              })()`,
              10_000
            ))
          ) {
            fail('ticket-88 stage: the binary notice never showed for logo.bin (regression)')
          }
          log('preview_88_binary_ok')

          // Leave the shell clean for the later stages: close every panel
          // tab (the stage's five file tabs and the Review tab alike — the
          // 86 stage re-opens the panel from zero itself).
          for (;;) {
            const count = (await js(`document.querySelectorAll('.panel-tab-label span').length`)) as number
            if (count === 0) break
            if (!(await waitForProbe(win, `(() => { const b = document.querySelector('.panel-tab .panel-tab-close'); if (b instanceof HTMLElement) { b.click(); return true } return false })()`, 5_000))) {
              break
            }
            await new Promise((r) => setTimeout(r, 200))
          }
        })
      } finally {
        rmSync(seed88, { recursive: true, force: true })
      }
    }
    log('preview_dual_88_done')

    // ---- ticket 35: session-row context menu + archive ----
    // The archive target is ms2: its host was SIGKILLed in the crash-isolation
    // stage, so the row is settled (no host, no run, no gate) and nothing is
    // lost by hiding it. The stage: hover reveals the archive button in the
    // dot slot (REAL input — the CSS :hover gate follows real moves only),
    // clicking it hides the row from both sidebar views, the trash button
    // swaps to the archive view where one click restores the row, and the
    // right-click menu shows the nine entries in ZCode order with the copy
    // actions firing the read-only context-action IPC (main's bounded log is
    // the assertion surface).
    log('context_menu_start')
    if (!ms2.sessionFile) fail('ticket-35 stage: multi session 2 did not report its file')
    const archiveRowSel = `[data-file="${ms2.sessionFile}"]`
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      if (!(await waitForProbe(win, `document.querySelector('${archiveRowSel}') !== null`, 10_000))) {
        fail('ticket-35 stage: the archive target row never reached the sidebar')
      }

      // Hover the row: the archive button must fade into the dot slot.
      const rowPoint = (await js(`(() => {
        const row = document.querySelector('${archiveRowSel}')
        if (!(row instanceof Element)) return null
        const r = row.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)) as { x: number; y: number } | null
      if (!rowPoint) fail('ticket-35 stage: could not locate the archive target row')
      win.webContents.sendInputEvent({ type: 'mouseMove', x: rowPoint.x, y: rowPoint.y })
      await new Promise((r) => setTimeout(r, 150))
      win.webContents.sendInputEvent({ type: 'mouseMove', x: rowPoint.x, y: rowPoint.y })
      const hoverOk = await waitForProbe(
        win,
        `(() => {
          const btn = document.querySelector('${archiveRowSel} .sb-arch-btn')
          if (!btn) return false
          const s = getComputedStyle(btn)
          return s.visibility === 'visible' && Number(s.opacity) > 0.9
        })()`,
        5_000
      )
      if (!hoverOk) fail('hover never revealed the archive button in the dot slot (ticket 35)')

      // Archive through the hover button: the row leaves both sidebar views
      // and the toast confirms where to undo it.
      await js(
        `document.querySelector('${archiveRowSel} .sb-arch-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const gone = await waitForProbe(win, `document.querySelector('${archiveRowSel}') === null`, 10_000)
      if (!gone) fail('archiving never removed the row from the sidebar lists (ticket 35)')
      if (!(await waitForProbe(win, `document.body.textContent.includes('Task archived')`, 3_000))) {
        fail('archiving never confirmed with a toast (ticket 35)')
      }
      log('archive_hidden_ok')

      // The trash button swaps the sidebar into the archive view; the
      // archived row is listed there with a one-click restore.
      if (!(await waitForProbe(win, `document.querySelector('button[aria-label="Archived tasks"]') !== null`, 5_000))) {
        fail('ticket-35 stage: the trash button is missing')
      }
      await js(
        `document.querySelector('button[aria-label="Archived tasks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.sb-archived') !== null`, 5_000))) {
        fail('the trash button never opened the archive view (ticket 35)')
      }
      if (!(await waitForProbe(win, `document.querySelector('.sb-archived ${archiveRowSel}') !== null`, 5_000))) {
        fail('the archived row is not listed in the archive view')
      }
      log('archive_view_ok')

      // One-click restore: the row leaves the archive list; back on the task
      // list it is present again.
      await js(
        `document.querySelector('.sb-archived ${archiveRowSel} .sb-restore-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.sb-archived ${archiveRowSel}') === null`, 10_000))) {
        fail('restore never removed the row from the archive view (ticket 35)')
      }
      await js(
        `document.querySelector('button[aria-label="Back to tasks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.sb-task${archiveRowSel}') !== null`, 10_000))) {
        fail('the restored row never returned to the task list (ticket 35)')
      }
      log('archive_restore_ok')

      // Right-click the row: the nine-item menu, three groups, ZCode order.
      await js(`(() => {
        const row = document.querySelector('${archiveRowSel}')
        if (!(row instanceof Element)) return
        const r = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true,
          clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
        }))
      })(); true`)
      if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') !== null`, 5_000))) {
        fail('right-click never opened the session context menu (ticket 35)')
      }
      const menuShape = (await js(`(() => {
        const menu = document.querySelector('.sb-context-menu')
        if (!menu) return null
        return {
          groups: menu.querySelectorAll('.sb-context-group').length,
          items: [...menu.querySelectorAll('.sb-context-item')].map((el) => el.textContent)
        }
      })()`)) as { groups: number; items: string[] } | null
      if (!menuShape) fail('the context menu vanished before it could be inspected')
      if (menuShape.groups !== 3) fail(`context menu should have three groups, saw ${menuShape.groups}`)
      const expectedItems = [
        'Pin task', 'Rename task', 'Archive task', 'Mark as Unread',
        'Reveal in Finder', 'Copy task path', 'Copy session file path', 'Copy session ID',
        'View call trace'
      ]
      if (JSON.stringify(menuShape.items) !== JSON.stringify(expectedItems)) {
        fail(`context menu items/order wrong: ${menuShape.items.join(' | ')}`)
      }
      log('context_menu_items_ok')

      // Copy session ID → the read-only context-action IPC must fire (the
      // main-side bounded action log is the assertion surface).
      await js(
        `[...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'Copy session ID')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      let copyIdFired = false
      for (let waited = 0; waited < 5_000 && !copyIdFired; waited += 100) {
        copyIdFired = (actions?.log ?? []).some((a) => a.kind === 'copy' && a.text === ms2.sessionId)
        if (!copyIdFired) await new Promise((r) => setTimeout(r, 100))
      }
      if (!copyIdFired) fail('Copy session ID never fired the context-action IPC (ticket 35)')
      if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') === null`, 3_000))) {
        fail('the context menu stayed open after running an action')
      }
      log('context_menu_copy_id_ok')

      // Copy task path → the cwd payload round-trips through the same IPC.
      await js(`(() => {
        const row = document.querySelector('${archiveRowSel}')
        if (!(row instanceof Element)) return
        const r = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true,
          clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
        }))
      })(); true`)
      if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') !== null`, 5_000))) {
        fail('the context menu never re-opened for the task-path copy')
      }
      await js(
        `[...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'Copy task path')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      let copyCwdFired = false
      for (let waited = 0; waited < 5_000 && !copyCwdFired; waited += 100) {
        copyCwdFired = (actions?.log ?? []).some((a) => a.kind === 'copy' && a.text === cwd)
        if (!copyCwdFired) await new Promise((r) => setTimeout(r, 100))
      }
      if (!copyCwdFired) fail('Copy task path never fired the context-action IPC with the cwd (ticket 35)')
      log('context_menu_copy_cwd_ok')
    })
    log('context_menu_done')

    // ---- ticket 36: call-trace tab ----
    // Right-click the RICHEST session's row (ms1: warm turn + counting run
    // + the ticket-25 bash approval round + simulated TUI turns) and choose
    // View call trace. The tab opens in the side panel (identity = session
    // file), renders entries fully expanded with usage columns read from the
    // REAL file, refresh keeps them, close removes the tab. Read-only: the
    // host process is never involved.
    log('trace_start')
    if (!ms1.sessionFile) fail('ticket-36 stage: ms1 did not report its file')
    const traceFile: string = ms1.sessionFile
    const traceRowSel = `[data-file="${ms1.sessionFile}"]`
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const openMenu = `(() => {
        const row = document.querySelector('${traceRowSel}')
        if (!(row instanceof Element)) return false
        const r = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true,
          clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
        }))
        return true
      })(); true`
      if (!(await waitForProbe(win, openMenu + ` && document.querySelector('.sb-context-menu') !== null`, 10_000))) {
        fail('ticket-36 stage: the context menu never opened for View call trace')
      }
      await js(
        `[...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'View call trace')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      // The trace tab is open AND active inside the panel framework.
      const traceTabProbe = `(() => {
        const tabs = [...document.querySelectorAll('[data-panel-tab]')]
        return tabs.some((el) => (el.getAttribute('data-panel-tab') ?? '').startsWith('["trace"') && el.classList.contains('panel-tab-active'))
          && document.querySelector('.side-panel .trace-view') !== null
      })()`
      if (!(await waitForProbe(win, traceTabProbe, 10_000))) {
        fail('View call trace never opened an active Trace tab in the side panel (ticket 36)')
      }
      // Ticket 86 regression guard: the deep link must have AUTO-EXPANDED
      // the panel shell. The tab body renders even inside the closed
      // (visibility-hidden) pane, so the shell state is the only proof —
      // the preceding ticket-86 stage leaves the panel collapsed with zero
      // tabs, making this re-expansion non-vacuous.
      if (((await js(`(() => { const p = document.querySelector('.side-panel'); return p !== null && !p.hasAttribute('data-closed') })()`)) as boolean) !== true) {
        fail('ticket-36 stage: the trace deep link left the panel shell collapsed (ticket-86 re-expand regression)')
      }
      log('trace_tab_open_ok')

      // Entries: at least two model calls from ms1's real traffic, fully
      // expanded — both an Input and an Output section on screen, a usage
      // column (the SDK records usage on every settled call), and the bash
      // round's tool-call block with its tool-name chip.
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-call').length >= 2`, 10_000))) {
        fail('the trace list never rendered the model calls of the session (ticket 36)')
      }
      const shape = (await js(`(() => {
        const entries = [...document.querySelectorAll('.trace-call')]
        return {
          entries: entries.length,
          expanded: entries.filter((el) => el.querySelector('.trace-section') !== null).length,
          inputSections: document.querySelectorAll('.trace-section-label')?.length ?? 0,
          usageColumns: entries.filter((el) => el.querySelector('.trace-call-usage .trace-num') !== null).length,
          toolChips: [...document.querySelectorAll('.trace-kind-tool-call')].length,
          userBlocks: [...document.querySelectorAll('.trace-kind-user')].length,
          assistantBlocks: [...document.querySelectorAll('.trace-kind-assistant')].length,
          stats: document.querySelector('.trace-stats')?.textContent ?? '',
          title: document.querySelector('.trace-title')?.textContent ?? ''
        }
      })()`)) as {
        entries: number
        expanded: number
        inputSections: number
        usageColumns: number
        toolChips: number
        userBlocks: number
        assistantBlocks: number
        stats: string
        title: string
      } | null
      if (!shape) fail('the trace shape probe failed')
      if (shape.expanded !== shape.entries) fail(`trace entries must render expanded by default (${shape.expanded}/${shape.entries})`)
      if (shape.usageColumns < 1) fail('no entry shows a usage column — the IN/OUT derivation is missing (ticket 36)')
      if (shape.toolChips < 1) fail('the bash approval round is missing its tool-call block')
      if (shape.userBlocks < 1) fail('no user block in any input section')
      if (shape.assistantBlocks < 1) fail('no assistant block in any output section')
      if (!/^\d+ calls/.test(shape.stats)) fail(`header stats line wrong: "${shape.stats}"`)
      if (shape.title === '') fail('header title is empty')
      log('trace_entries_ok', `${shape.entries} entries, stats "${shape.stats.trim()}"`)

      // Refresh: the header's refresh button re-reads the file; entries stay.
      await js(`document.querySelector('button[aria-label="Refresh trace"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      await new Promise((r) => setTimeout(r, 300))
      const afterRefresh = (await js(`document.querySelectorAll('.trace-call').length`)) as number
      if (afterRefresh !== shape.entries) fail(`refresh changed the entry count (${shape.entries} → ${afterRefresh})`)
      log('trace_refresh_ok')

      // ---- ticket 37: live follow — growth refreshes WITHOUT refresh ----
      // Append one settled call (user + assistant, both carrying a unique
      // marker) to ms1's file, exactly like an other-end TUI write. The
      // trace tab must gain the entry through the follow push alone (host
      // re-derives on size change), with NO re-request.
      if (!(await appendTraceGrowthTurn(traceFile))) fail('ticket-37 stage: could not append the growth turn')
      const grown = await waitForProbe(
        win,
        `document.querySelectorAll('.trace-call').length === ${shape.entries + 1}`,
        10_000
      )
      if (!grown) fail(`trace live follow never delivered the appended call (${shape.entries} → ?)`) // poll cadence ~2s
      log('trace_growth_ok')

      // ---- ticket 37: search — count + ↑↓ navigation + hit highlight ----
      await js(
        `document.querySelector('button[aria-label="Search trace"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.trace-search-input') !== null`, 5_000))) {
        fail('the search button never opened the trace search bar (ticket 37)')
      }
      // The count reads 0/0 before typing (ZCode reference frame).
      if ((await js(`document.querySelector('.trace-search-count')?.textContent`)) !== '0/0') {
        fail('the empty search count must read 0/0')
      }
      const typeQuery = `(() => {
        const input = document.querySelector('.trace-search-input')
        if (!(input instanceof HTMLInputElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'PICODE_TRACE_GROWTH_37')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })(); true`
      if (!(await waitForProbe(
        win,
        typeQuery + ` && document.querySelector('.trace-search-count')?.textContent === '1/2'`,
        5_000
      ))) {
        fail('typing the growth marker never matched exactly 2 blocks with the count reading 1/2')
      }
      // ↓ navigation wraps to the second match; the hit block highlights.
      await js(`document.querySelector('button[aria-label="Next match"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(
        win,
        `document.querySelector('.trace-search-count')?.textContent === '2/2' && document.querySelectorAll('.trace-block-active').length === 1`,
        5_000
      ))) {
        fail('Next match never moved to 2/2 with a highlighted hit block (ticket 37)')
      }
      // ↑ wraps back around to the first match.
      await js(`document.querySelector('button[aria-label="Previous match"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelector('.trace-search-count')?.textContent === '1/2'`, 5_000))) {
        fail('Previous match never wrapped back to 1/2 (ticket 37)')
      }
      // × closes the bar and clears the highlight.
      await js(`document.querySelector('button[aria-label="Close search"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(
        win,
        `document.querySelector('.trace-search-input') === null && document.querySelectorAll('.trace-block-active').length === 0`,
        5_000
      ))) {
        fail('closing the search never removed the bar and the hit highlight (ticket 37)')
      }
      log('trace_search_ok')

      // ---- ticket 37: block-kind toggles (six switches, default all on) ----
      await js(`document.querySelector('button[aria-label="Block types"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-kind-row').length === 6`, 5_000))) {
        fail('the Block types button never opened the six-kind toggle panel (ticket 37)')
      }
      const userBlocksBefore = (await js(`document.querySelectorAll('.trace-list .trace-kind-user').length`)) as number
      if (userBlocksBefore < 1) fail('expected at least one user block before the toggle round')
      await js(
        `[...document.querySelectorAll('.trace-kind-row')].find((el) => el.textContent === 'User message')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-list .trace-kind-user').length === 0`, 5_000))) {
        fail('toggling User message off never removed the user blocks (ticket 37)')
      }
      await js(
        `[...document.querySelectorAll('.trace-kind-row')].find((el) => el.textContent === 'User message')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-list .trace-kind-user').length === ${userBlocksBefore}`, 5_000))) {
        fail('toggling User message back on never restored the user blocks (ticket 37)')
      }
      // Escape closes the panel.
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`)
      if (!(await waitForProbe(win, `document.querySelector('.trace-kind-menu') === null`, 5_000))) {
        fail('Escape never closed the block-type panel (ticket 37)')
      }
      log('trace_kind_toggles_ok')

      // ---- ticket 37: expand-all ↔ collapse-all ----
      // Collapse all: every block folds to its one-line row.
      await js(`document.querySelector('button[aria-label="Collapse all blocks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(
        win,
        `(() => { const all = document.querySelectorAll('.trace-block').length; const c = document.querySelectorAll('.trace-block-collapsed').length; return all > 0 && all === c })()`,
        5_000
      ))) {
        fail('Collapse all never folded every block (ticket 37)')
      }
      // Expand all (the button flips its label with the state).
      await js(`document.querySelector('button[aria-label="Expand all blocks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-block-collapsed').length === 0`, 5_000))) {
        fail('Expand all never unfolded every block (ticket 37)')
      }
      // A single block's chevron folds just that block.
      await js(
        `document.querySelector('.trace-block .trace-block-head')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-block-collapsed').length === 1`, 5_000))) {
        fail('a block head click never folded just that block (ticket 37)')
      }
      await js(
        `document.querySelector('.trace-block-collapsed .trace-block-head')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-block-collapsed').length === 0`, 5_000))) {
        fail('clicking the folded block head never re-expanded it (ticket 37)')
      }
      log('trace_expand_collapse_ok')

      // Close: the tab leaves the panel framework (recently closed tracks it).
      await js(`document.querySelector('.trace-view')?.closest('.side-panel')?.querySelector('button[aria-label="Close trace"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelector('.side-panel .trace-view') === null`, 5_000))) {
        fail('the trace close button never removed the tab (ticket 36)')
      }
      log('trace_close_ok')
    })
    log('trace_done')

    // ---- ticket 39: group fold + Show more pagination ----
    // A seeded 12-session project group (header + one user message each,
    // distinct ascending mtimes for deterministic order) drives the whole
    // shape table end to end: default five → +5 step → fold through the
    // group row → unfold restores the step → +5 reaches ALL with "Show
    // less" → one-click reset → fold/unfold again → restart (renderer
    // reload, the ticket-31 proxy) back at the default five. The caret must
    // be gone and the folded header must carry no count (Q9).
    log('group_fold_start')
    const foldProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-fold-'))
    const foldStore = process.env['PICODE_SESSION_DIR']
    if (!foldStore) fail('ticket-39 stage: PICODE_SESSION_DIR is not set')
    const FOLD_SEED_SESSIONS = 12
    try {
      // Seed the isolated SESSION STORE (the only place the index walks)
      // with header + one user message per file; the sessions' cwd is the
      // separate REAL project dir (basename = the group label).
      for (let i = 0; i < FOLD_SEED_SESSIONS; i++) {
        const stamp = new Date().toISOString()
        const lines = [
          JSON.stringify({ type: 'session', version: 3, id: `fold39-${i}`, timestamp: stamp, cwd: foldProject }),
          JSON.stringify({
            type: 'message',
            id: `fold39-${i}-u1`,
            parentId: null,
            timestamp: stamp,
            message: { role: 'user', content: [{ type: 'text', text: `PICODE_FOLD_39 task ${i + 1} of ${FOLD_SEED_SESSIONS}` }] }
          })
        ]
        const file = path.join(foldStore, `fold-${String(i).padStart(2, '0')}.jsonl`)
        writeFileSync(file, lines.join('\n') + '\n')
        // Distinct past mtimes: the group sorts newest-first, deterministically.
        const mtime = new Date(Date.now() - (FOLD_SEED_SESSIONS - i) * 60_000)
        utimesSync(file, mtime, mtime)
      }
      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        // The keymap stage may have left the sidebar closed — open with ⌘B
        // (press-until-present, the panel-stage pattern).
        const sidebarPresent = `(document.querySelector('.sidebar') !== null)`
        if (!((await js(sidebarPresent)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true })); true`)
          await waitForProbe(win, sidebarPresent, 5_000)
        }

        const projectName = path.basename(foldProject)
        /** The seeded group section, or null (the header's first span IS the
         * project label). Probes read `${rows}|${label}` so every step
         * asserts rows AND control label in one poll. */
        const groupExpr = `([...document.querySelectorAll('.sb-group')].find((g) => g.querySelector('.sb-group-header span')?.textContent === '${projectName}') ?? null)`
        const stateExpr = `(() => {
          const g = ${groupExpr}
          if (!g) return '-1|none'
          const m = g.querySelector('.sb-show-more')
          return g.querySelectorAll('.sb-task').length + '|' + (m ? (m.textContent ?? '').trim() : 'none')
        })()`
        const clickInGroup = (selector: string): string =>
          `(() => { const g = ${groupExpr}; const el = g?.querySelector('${selector}'); if (el instanceof HTMLElement) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`

        // Index poll (~2s) lists the seeded group at the DEFAULT shape.
        if (!(await waitForProbe(win, `${stateExpr} === '5|Show more'`, 15_000))) {
          fail(`the seeded fold group never reached the default shape (state: ${await js(stateExpr)})`)
        }
        log('fold_default_shape_ok')

        // Caret deleted (ticket 39): no group header in the sidebar carries one.
        const carets = (await js(`document.querySelectorAll('.sb-caret').length`)) as number
        if (carets !== 0) fail(`the group-header caret survived the ticket-39 deletion (${carets} left)`)
        log('fold_caret_gone_ok')

        // +5 step: Show more reveals five more, still "Show more" (10 of 12).
        await js(clickInGroup('.sb-show-more'))
        if (!(await waitForProbe(win, `${stateExpr} === '10|Show more'`, 5_000))) {
          fail(`Show more never stepped +5 (state: ${await js(stateExpr)})`)
        }
        log('fold_step_plus5_ok')

        // Fold through the group ROW: all rows hide, the pagination control
        // goes with them, and the header stays count-free (Q9).
        await js(clickInGroup('.sb-group-header'))
        if (!(await waitForProbe(win, `${stateExpr} === '0|none'`, 5_000))) {
          fail(`the group row click never folded the group (state: ${await js(stateExpr)})`)
        }
        const foldedHeader = (await js(
          `(() => { const g = ${groupExpr}; return g ? (g.querySelector('.sb-group-header')?.textContent ?? '').trim() : '' })()`
        )) as string
        if (foldedHeader !== projectName) fail(`the folded header carries extra text (count?): "${foldedHeader}"`)
        log('fold_folded_ok')

        // Unfold restores the PRE-FOLD shape: still the 10-row step.
        await js(clickInGroup('.sb-group-header'))
        if (!(await waitForProbe(win, `${stateExpr} === '10|Show more'`, 5_000))) {
          fail(`unfolding never restored the pre-fold shape (state: ${await js(stateExpr)})`)
        }
        log('fold_shape_restored_ok')

        // Second +5 reaches ALL 12 — the control flips to "Show less".
        await js(clickInGroup('.sb-show-more'))
        if (!(await waitForProbe(win, `${stateExpr} === '12|Show less'`, 5_000))) {
          fail(`full expansion never flipped the control to Show less (state: ${await js(stateExpr)})`)
        }
        log('fold_all_shown_ok')

        // Show less: ONE click back to the initial five.
        await js(clickInGroup('.sb-show-more'))
        if (!(await waitForProbe(win, `${stateExpr} === '5|Show more'`, 5_000))) {
          fail(`Show less never reset to the initial five in one click (state: ${await js(stateExpr)})`)
        }
        log('fold_show_less_reset_ok')

        // RESTART: shapes are memory-level (Q5) — a renderer reload, the
        // same restart proxy the ticket-31 stage uses, must return the
        // group to the default shape; a persisted preference would survive.
        await win.webContents.reload()
        await waitForProbe(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
        await new Promise((r) => setTimeout(r, 500))
        if (!(await waitForProbe(win, `${stateExpr} === '5|Show more'`, 15_000))) {
          fail(`after restart the fold group is not at the default shape (state: ${await js(stateExpr)})`)
        }
        log('fold_restart_default_ok')
      })
    } finally {
      rmSync(foldProject, { recursive: true, force: true })
    }
    log('group_fold_done')

    // ---- ticket 84: sidebar drag-reorder, end to end ----
    // Three seeded project groups drive the whole ticket: a session-row
    // drag within its own group (auto-enters Manual, dropdown check state),
    // a group drag by the grip handle (between groups), a gray-row drag
    // after the project dir dies, the sessions-dir red line (dragging only
    // ever writes the local preference — the store stays byte-identical),
    // the persisted arrangement read straight off the settings document,
    // and a renderer reload (the restart proxy) restoring it. Timeline and
    // pinned rows must never drag.
    log('sidebar_drag_start')
    const dragDirA = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-dragA-'))
    const dragDirB = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-dragB-'))
    const dragDirC = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-dragC-'))
    const dragStore = process.env['PICODE_SESSION_DIR']
    if (!dragStore) fail('ticket-84 stage: PICODE_SESSION_DIR is not set')
    try {
      // Six sessions across three cwds; distinct past mtimes fix the
      // Updated arrangement deterministically:
      //   groups B, A, C — within B [b1, b2], within A [a1, a2], within C [c1, c2]
      const dragSeeds: Array<{ id: string; cwd: string; ageMin: number }> = [
        { id: 'drag84-b1', cwd: dragDirB, ageMin: 1 },
        { id: 'drag84-a1', cwd: dragDirA, ageMin: 2 },
        { id: 'drag84-a2', cwd: dragDirA, ageMin: 3 },
        { id: 'drag84-b2', cwd: dragDirB, ageMin: 4 },
        { id: 'drag84-c1', cwd: dragDirC, ageMin: 5 },
        { id: 'drag84-c2', cwd: dragDirC, ageMin: 6 }
      ]
      for (const seed of dragSeeds) {
        const stamp = new Date().toISOString()
        const lines = [
          JSON.stringify({ type: 'session', version: 3, id: seed.id, timestamp: stamp, cwd: seed.cwd }),
          JSON.stringify({
            type: 'message',
            id: `${seed.id}-u1`,
            parentId: null,
            timestamp: stamp,
            message: { role: 'user', content: [{ type: 'text', text: `PICODE_DRAG_84 task ${seed.id}` }] }
          })
        ]
        const file = path.join(dragStore, `${seed.id}.jsonl`)
        writeFileSync(file, lines.join('\n') + '\n')
        const mtime = new Date(Date.now() - seed.ageMin * 60_000)
        utimesSync(file, mtime, mtime)
      }

      /** Byte fingerprint of the whole session store — the red-line probe:
        * reordering must never touch a session file. */
      const storeFingerprint = (): string =>
        readdirSync(dragStore)
          .sort()
          .map((name) => {
            const full = path.join(dragStore, name)
            if (!statSync(full).isFile()) return `${name}/`
            return `${name}:${createHash('sha256').update(readFileSync(full)).digest('hex').slice(0, 16)}`
          })
          .join('|')

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        const labelA = path.basename(dragDirA)
        const labelB = path.basename(dragDirB)
        const labelC = path.basename(dragDirC)

        // The keymap stage may have left the sidebar closed — open with ⌘B.
        if (!((await js(`document.querySelector('.sidebar') !== null`)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true })); true`)
          await waitForProbe(win, `document.querySelector('.sidebar') !== null`, 5_000)
        }

        const groupOrderExpr = `[...document.querySelectorAll('.sb-group .sb-group-header')].map((h) => h.querySelector('span')?.textContent ?? '')`
        const groupIndexOf = (label: string): string => `${groupOrderExpr}.indexOf('${label}')`
        const rowsInGroup = (label: string): string =>
          `(() => { const g = [...document.querySelectorAll('.sb-group')].find((x) => x.querySelector('.sb-group-header span')?.textContent === '${label}'); return g ? [...g.querySelectorAll('.sb-task')].map((r) => (r.dataset['file'] ?? '').split('/').pop() ?? '') : [] })()`

        /** One synthetic HTML5 drag: dragstart on the source, dragover +
          * drop on the target's top/bottom half, dragend on the source.
          * React's synthetic layer handles untrusted events fine; the
          * constructed DataTransfer satisfies the handlers. */
        const dragJs = (fromSel: string, toSel: string, half: 'top' | 'bottom'): string =>
          `(() => {
            const from = document.querySelector(${JSON.stringify(fromSel)})
            const to = document.querySelector(${JSON.stringify(toSel)})
            if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) return 'missing'
            const dt = new DataTransfer()
            const rect = to.getBoundingClientRect()
            const y = ${half === 'top' ? 'rect.top + 2' : 'rect.bottom - 2'}
            const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }
            from.dispatchEvent(new DragEvent('dragstart', opts))
            to.dispatchEvent(new DragEvent('dragover', opts))
            to.dispatchEvent(new DragEvent('drop', opts))
            from.dispatchEvent(new DragEvent('dragend', opts))
            return 'ok'
          })()`

        const openDropdownJs = `(() => { const b = document.querySelector('button[aria-label="Filter tasks"]'); if (b instanceof HTMLElement) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`
        const menuStateJs = `(() => [...document.querySelectorAll('.sb-filter-menu .sb-filter-menu-item')].map((n) => ({ label: n.querySelector('span')?.textContent ?? '', checked: n.getAttribute('aria-checked') === 'true' })))()`
        const clickMenuItemJs = (label: string): string =>
          `(() => { const item = [...document.querySelectorAll('.sb-filter-menu .sb-filter-menu-item')].find((n) => n.querySelector('span')?.textContent === '${label}'); if (item instanceof HTMLElement) { item.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })()`

        // Index poll: the three seeded groups render in the Updated RELATIVE
        // order (B before A before C — other stages' groups may interleave;
        // the fold-stage group shares the 1-minute mtime tier).
        const allGroupsUp = `(() => { const o = ${groupOrderExpr}; const b = o.indexOf('${labelB}'), a = o.indexOf('${labelA}'), c = o.indexOf('${labelC}'); return b !== -1 && a !== -1 && c !== -1 && b < a && a < c })()`
        if (!(await waitForProbe(win, allGroupsUp, 20_000))) {
          fail(`ticket-84 stage: the seeded groups never rendered in the Updated order (got ${String(await js(groupOrderExpr))})`)
        }
        const rowsA = (await js(rowsInGroup(labelA))) as string[]
        const rowsB = (await js(rowsInGroup(labelB))) as string[]
        if (JSON.stringify(rowsA) !== JSON.stringify(['drag84-a1.jsonl', 'drag84-a2.jsonl'])) {
          fail(`ticket-84 stage: group A rows must start [a1, a2] (got ${JSON.stringify(rowsA)})`)
        }
        if (JSON.stringify(rowsB) !== JSON.stringify(['drag84-b1.jsonl', 'drag84-b2.jsonl'])) {
          fail(`ticket-84 stage: group B rows must start [b1, b2] (got ${JSON.stringify(rowsB)})`)
        }
        // The Projects section label lost its grip (ticket 84: no section
        // reorder semantics) while every group row is drag-ready.
        const labelGrip = (await js(`document.querySelector('.sb-section-label-projects .sb-grip-handle') !== null`)) as boolean
        if (labelGrip) fail('ticket-84 stage: the Projects section label still carries a grip handle')

        const fingerprintBefore = storeFingerprint()

        // 1) Row drag within group A: a2 above a1 — the FIRST drag auto-
        //    enters Manual (persisted order + sort flip in one patch).
        if ((await js(dragJs('[data-file$="drag84-a2.jsonl"]', '[data-file$="drag84-a1.jsonl"]', 'top'))) !== 'ok') {
          fail('ticket-84 stage: the row drag targets went missing')
        }
        if (!(await waitForProbe(win, `${rowsInGroup(labelA)}.join(',') === 'drag84-a2.jsonl,drag84-a1.jsonl'`, 5_000))) {
          fail(`ticket-84 stage: the row drag never reordered group A (got ${String(await js(rowsInGroup(labelA)))})`)
        }
        log('sidebar_drag_row_ok')

        // 2) The dropdown: five items, Manual present and CHECKED (auto-
        //    entry), view still By project.
        await js(openDropdownJs)
        if (!(await waitForProbe(win, `document.querySelector('.sb-filter-menu') !== null`, 5_000))) {
          fail('ticket-84 stage: the filter dropdown never opened')
        }
        const menuState = (await js(menuStateJs)) as Array<{ label: string; checked: boolean }>
        if (JSON.stringify(menuState.map((i) => i.label)) !== JSON.stringify(['By project', 'Timeline', 'Updated', 'Created', 'Manual'])) {
          fail(`ticket-84 stage: the dropdown must carry the Manual item third in Sort by (got ${JSON.stringify(menuState)})`)
        }
        const checked = menuState.filter((i) => i.checked).map((i) => i.label).join(',')
        if (checked !== 'By project,Manual') {
          fail(`ticket-84 stage: after the first drag Manual must be checked alongside By project (got ${checked})`)
        }
        await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        if (!(await waitForProbe(win, `document.querySelector('.sb-filter-menu') === null`, 5_000))) {
          fail('ticket-84 stage: Escape never closed the filter dropdown')
        }
        log('sidebar_drag_manual_checked_ok')

        // 3) Group drag by the grip handle: group A above group B.
        if ((await js(dragJs(`[data-cwd="${dragDirA}"] .sb-grip-handle`, `[data-cwd="${dragDirB}"]`, 'top'))) !== 'ok') {
          fail('ticket-84 stage: the group drag targets went missing')
        }
        if (!(await waitForProbe(win, `${groupIndexOf(labelA)} < ${groupIndexOf(labelB)}`, 5_000))) {
          fail(`ticket-84 stage: the grip drag never moved group A above B (got ${String(await js(groupOrderExpr))})`)
        }
        log('sidebar_drag_group_ok')

        // 4) Gray rows drag too: delete group C's project dir, wait for the
        //    dimmed rows, then drag c2 above c1 within the dead group.
        rmSync(dragDirC, { recursive: true, force: true })
        if (!(await waitForProbe(win, `[...document.querySelectorAll('.sb-task-dimmed')].filter((r) => (r.dataset['file'] ?? '').endsWith('drag84-c1.jsonl')).length === 1`, 20_000))) {
          fail('ticket-84 stage: group C never turned gray after its project dir died')
        }
        if ((await js(dragJs('[data-file$="drag84-c2.jsonl"]', '[data-file$="drag84-c1.jsonl"]', 'top'))) !== 'ok') {
          fail('ticket-84 stage: the gray-row drag targets went missing')
        }
        if (!(await waitForProbe(win, `${rowsInGroup(labelC)}.join(',') === 'drag84-c2.jsonl,drag84-c1.jsonl'`, 5_000))) {
          fail(`ticket-84 stage: the gray-row drag never reordered group C (got ${String(await js(rowsInGroup(labelC)))})`)
        }
        log('sidebar_drag_dimmed_ok')

        // 5) THE RED LINE: the whole session store is byte-identical —
        //    reordering only ever wrote the local preference.
        if (storeFingerprint() !== fingerprintBefore) {
          fail('ticket-84 stage: RED LINE — a drag changed the sessions directory')
        }
        log('sidebar_drag_sessions_untouched_ok')

        // 6) Persistence: the settings document (throwaway smoke userData)
        //    carries the arrangement — read MAIN-side, the page cannot.
        //    Then a renderer reload (the restart proxy) must restore it.
        const settingsFile = path.join(os.tmpdir(), `picode-smoke-userdata-${process.pid}`, 'picode-settings.json')
        let persistedOk = false
        let persistedDump = 'unreadable'
        for (let i = 0; i < 50 && !persistedOk; i++) {
          await new Promise((r) => setTimeout(r, 100))
          try {
            const doc = JSON.parse(readFileSync(settingsFile, 'utf8')) as {
              preferences?: {
                sidebarSort?: string
                sidebarManualOrder?: { groups?: string[]; sessions?: Record<string, string[]> }
              }
            }
            const prefs = doc.preferences ?? {}
            const groups = prefs.sidebarManualOrder?.groups ?? []
            const rowsA = prefs.sidebarManualOrder?.sessions?.[dragDirA] ?? []
            persistedDump = `sort=${String(prefs.sidebarSort)} groups=${groups.length} rowsA=${rowsA.join(',')}`
            persistedOk =
              prefs.sidebarSort === 'manual' &&
              groups.includes(dragDirA) &&
              groups.includes(dragDirB) &&
              groups.indexOf(dragDirA) < groups.indexOf(dragDirB) &&
              rowsA.join(',') === 'drag84-a2,drag84-a1'
          } catch {
            // Document not written yet — retry.
          }
        }
        if (!persistedOk) {
          fail(`ticket-84 stage: the settings document never carried the manual arrangement (${persistedDump})`)
        }
        await win.webContents.reload()
        await waitForProbe(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
        await new Promise((r) => setTimeout(r, 500))
        const orderAfterRestart = `[...document.querySelectorAll('.sb-group .sb-group-header')].map((h) => h.querySelector('span')?.textContent ?? '')`
        const restartOk = `(() => { const o = ${orderAfterRestart}; return o.indexOf('${labelA}') !== -1 && o.indexOf('${labelA}') < o.indexOf('${labelB}') && ${rowsInGroup(labelA)}.join(',') === 'drag84-a2.jsonl,drag84-a1.jsonl' })()`
        if (!(await waitForProbe(win, restartOk, 20_000))) {
          fail(`ticket-84 stage: the manual arrangement did not survive the restart (order: ${String(await js(orderAfterRestart))}, rows: ${String(await js(rowsInGroup(labelA)))})`)
        }
        await js(openDropdownJs)
        if (!(await waitForProbe(win, `document.querySelector('.sb-filter-menu') !== null`, 5_000))) {
          fail('ticket-84 stage: the filter dropdown never reopened after the restart')
        }
        const checkedAfter = ((await js(menuStateJs)) as Array<{ label: string; checked: boolean }>)
          .filter((i) => i.checked)
          .map((i) => i.label)
          .join(',')
        if (checkedAfter !== 'By project,Manual') {
          fail(`ticket-84 stage: Manual must still be checked after the restart (got ${checkedAfter})`)
        }
        await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        log('sidebar_drag_restart_ok')

        // 7) Timeline never drags: zero draggable rows, zero groups. Back
        //    to By project afterwards.
        await js(openDropdownJs)
        if (!(await waitForProbe(win, `document.querySelector('.sb-filter-menu') !== null`, 5_000))) {
          fail('ticket-84 stage: the filter dropdown never opened for the timeline switch')
        }
        await js(clickMenuItemJs('Timeline'))
        if (!(await waitForProbe(win, `document.querySelectorAll('.sb-group').length === 0`, 5_000))) {
          fail('ticket-84 stage: the timeline switch never flattened the list')
        }
        const timelineDraggables = (await js(`[...document.querySelectorAll('.sb-task')].filter((r) => r.getAttribute('draggable') === 'true').length`)) as number
        if (timelineDraggables !== 0) {
          fail(`ticket-84 stage: timeline rows must never drag (${timelineDraggables} draggable)`)
        }
        await js(openDropdownJs)
        if (!(await waitForProbe(win, `document.querySelector('.sb-filter-menu') !== null`, 5_000))) {
          fail('ticket-84 stage: the filter dropdown never opened for the projects switch back')
        }
        await js(clickMenuItemJs('By project'))
        if (!(await waitForProbe(win, `document.querySelectorAll('.sb-group').length > 0`, 5_000))) {
          fail('ticket-84 stage: the projects switch back never restored the groups')
        }
        log('sidebar_drag_timeline_static_ok')

        // 8) Pinned rows never drag: pin b1 through its context menu, then
        //    assert the pinned row lost the draggable attribute (and unpin
        //    to leave later stages untouched).
        const rowCtxMenuJs = `(() => {
          const row = document.querySelector('[data-file$="drag84-b1.jsonl"]')
          if (!(row instanceof HTMLElement)) return 'missing'
          const rect = row.getBoundingClientRect()
          row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }))
          return 'ok'
        })()`
        const clickPinJs = `(() => { const item = document.querySelector('[data-menu-action="toggle-pin"]'); if (!(item instanceof HTMLElement)) return false; item.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`
        if ((await js(rowCtxMenuJs)) !== 'ok') fail('ticket-84 stage: the b1 row went missing for the pin dance')
        if (!(await waitForProbe(win, `document.querySelector('[data-menu-action="toggle-pin"]') !== null`, 5_000))) {
          fail('ticket-84 stage: the pin context menu never opened')
        }
        if (!((await js(clickPinJs)) as boolean)) fail('ticket-84 stage: the toggle-pin menu item never clicked')
        if (!(await waitForProbe(win, `(() => { const row = document.querySelector('[data-file$="drag84-b1.jsonl"]'); return row !== null && row.querySelector('.sb-pin-btn.sb-pin-on') !== null && row.getAttribute('draggable') !== 'true' })()`, 5_000))) {
          fail('ticket-84 stage: the pinned row must not be drag-enabled (draggable=true)')
        }
        if ((await js(rowCtxMenuJs)) !== 'ok') fail('ticket-84 stage: the b1 row went missing for the unpin dance')
        if (!(await waitForProbe(win, `document.querySelector('[data-menu-action="toggle-pin"]') !== null`, 5_000))) {
          fail('ticket-84 stage: the unpin context menu never opened')
        }
        if (!((await js(clickPinJs)) as boolean)) fail('ticket-84 stage: the toggle-pin menu item never clicked for the unpin')
        if (!(await waitForProbe(win, `(() => { const row = document.querySelector('[data-file$="drag84-b1.jsonl"]'); return row !== null && row.querySelector('.sb-pin-btn.sb-pin-on') === null })()`, 5_000))) {
          fail('ticket-84 stage: the unpin never restored the row')
        }
        log('sidebar_drag_pinned_static_ok')

        // Stage hygiene: hand the suite back the UPDATED sort. The drag
        // assertions are done; later stages seed NEW sessions into stored
        // groups and expect the auto arrangement (a new row lands at the
        // TOP of its group — under Manual it would append at the tail and
        // paginate behind the ticket-39 Show-more cut).
        await js(openDropdownJs)
        if (!(await waitForProbe(win, `document.querySelector('.sb-filter-menu') !== null`, 5_000))) {
          fail('ticket-84 stage: the filter dropdown never opened for the sort restore')
        }
        await js(clickMenuItemJs('Updated'))
        if (!(await waitForProbe(win, `document.querySelector('.sb-filter-menu') === null`, 5_000))) {
          fail('ticket-84 stage: the sort restore never closed the dropdown')
        }
        log('sidebar_drag_sort_restored_ok')
      })
    } finally {
      rmSync(dragDirA, { recursive: true, force: true })
      rmSync(dragDirB, { recursive: true, force: true })
      rmSync(dragDirC, { recursive: true, force: true })
    }
    log('sidebar_drag_done')

    // ---- ticket 42 × 54: the dead-cwd lifecycle, end to end ----
    // Three seeded sessions in an isolated store drive the whole stage:
    //  - DEAD: its project dir is deleted BEFORE the scan — the session is
    //    LISTED as a display-only gray row (ticket 54: dimmed + "cwd
    //    missing" meta), the click explains with a toast and spawns ZERO
    //    hosts, the row menu keeps only the harmless entries, ⌘K still
    //    excludes it (resume on a deleted cwd would crash the host), and its
    //    file stays byte-identical on disk;
    //  - ALIVE (control): real dir, first message carries the SDK's skill-
    //    injection prologue — the title must be the text AFTER the block;
    //  - LIVE: resumed in-app, then its project dir is deleted MID-RUN —
    //    the row stays listed (the ticket-42 exemption semantics) and the
    //    session view carries the persistent CWD banner (three facts, no
    //    dismiss button);
    //  - RECOVERY: both directories reappearing clears the flag on the next
    //    scan — the banner disappears and the gray row restores to normal
    //    without any manual step.
    log('dead_cwd_start')
    const cwdStore = process.env['PICODE_SESSION_DIR']
    if (!cwdStore) fail('ticket-42 stage: PICODE_SESSION_DIR is not set')
    const deadProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-dead42-'))
    const aliveProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-alive42-'))
    const liveProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-live42-'))
    const DEAD_MARKER = 'PICODE_42_DEAD unreachable task'
    const ALIVE_TITLE = 'PICODE_42_TITLE_ALIVE text'
    const LIVE_MARKER = 'PICODE_42_LIVE running task'
    try {
      const seed42 = (file: string, id: string, project: string, userText: string): void => {
        const stamp = new Date().toISOString()
        writeFileSync(
          file,
          [
            JSON.stringify({ type: 'session', version: 3, id, timestamp: stamp, cwd: project }),
            JSON.stringify({
              type: 'message',
              id: `${id}-u1`,
              parentId: null,
              timestamp: stamp,
              message: { role: 'user', content: [{ type: 'text', text: userText }] }
            })
          ].join('\n') + '\n'
        )
      }
      const deadFile = path.join(cwdStore, 'dead42.jsonl')
      seed42(deadFile, randomUUID(), deadProject, DEAD_MARKER)
      // The physical death happens BEFORE any scan sees the directory.
      rmSync(deadProject, { recursive: true, force: true })

      // The exact prologue the Pi SDK injects for a skill-driven turn
      // (agent-session.js), with the user's own text after a blank line.
      const skillPrologue = [
        '<skill name="implement" location="' + path.join(aliveProject, 'SKILL.md') + '">',
        'References are relative to ' + aliveProject + '.',
        '',
        'Implement the work described by the user.',
        '</skill>',
        '',
        ALIVE_TITLE
      ].join('\n')
      const aliveFile = path.join(cwdStore, 'alive42.jsonl')
      seed42(aliveFile, randomUUID(), aliveProject, skillPrologue)
      const liveFile = path.join(cwdStore, 'live42.jsonl')
      seed42(liveFile, randomUUID(), liveProject, LIVE_MARKER)

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        // The fold stage may have left the sidebar closed — open with ⌘B
        // (press-until-present, the panel-stage pattern).
        const sidebarPresent = `(document.querySelector('.sidebar') !== null)`
        if (!((await js(sidebarPresent)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true })); true`)
          await waitForProbe(win, sidebarPresent, 5_000)
        }

        // Index pickup, proven by the CONTROL row appearing.
        const aliveRow = `[data-file="${aliveFile}"]`
        if (!(await waitForProbe(win, `document.querySelector('${aliveRow}') !== null`, 15_000))) {
          fail('ticket-42 stage: the alive-cwd control row never reached the sidebar')
        }
        log('dead_cwd_control_listed_ok')

        // Same scan, the dead session: LISTED as a gray row (ticket 54) —
        // dimmed, with the "cwd missing" meta note.
        const deadRow = `[data-file="${deadFile}"]`
        if (!(await waitForProbe(win, `document.querySelector('${deadRow}.sb-task-dimmed') !== null`, 15_000))) {
          fail('ticket-54 stage: the dead-cwd session never reached the sidebar as a dimmed row')
        }
        const meta = (await js(`document.querySelector('${deadRow} .sb-task-cwd-meta')?.textContent ?? ''`)) as string
        if (meta !== 'cwd missing') fail(`ticket-54 stage: the gray row's meta must read "cwd missing" (got "${meta}")`)
        log('dead_cwd_gray_row_ok')

        // Click the gray row: an explanation toast ONLY — zero resume
        // (session_created count must stay at zero) and the view never
        // switches to the dead session.
        let deadSpawns = 0
        const onDeadSpawn = (e: Scoped): void => {
          if (e.type === 'session_created') deadSpawns++
        }
        observers.push(onDeadSpawn)
        await js(
          `document.querySelector('${deadRow}')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
        )
        const toastShown = await waitForProbe(
          win,
          `[...document.querySelectorAll('.toast-message')].some((n) => (n.textContent ?? '').includes(${JSON.stringify(CWD_MISSING_ROW_TOAST)}))`,
          5_000
        )
        if (!toastShown) fail('ticket-54 stage: the gray-row click never raised the explanation toast')
        await new Promise((r) => setTimeout(r, 2_500))
        observers.splice(observers.indexOf(onDeadSpawn), 1)
        if (deadSpawns > 0) fail(`ticket-54 stage: the gray-row click attempted ${deadSpawns} resume(s) — must be zero`)
        if (((await js(`document.querySelector('${deadRow}').classList.contains('sb-task-active')`)) as boolean)) {
          fail('ticket-54 stage: the gray-row click switched the view to the dead session')
        }
        log('dead_cwd_click_toast_ok')

        // Right-click the gray row: exactly the harmless entries, no
        // open-type action of any kind.
        await js(`(() => {
          const row = document.querySelector('${deadRow}')
          if (!(row instanceof Element)) return
          const r = row.getBoundingClientRect()
          row.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true,
            clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
          }))
        })(); true`)
        if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') !== null`, 5_000))) {
          fail('ticket-54 stage: right-click never opened the gray row menu')
        }
        const grayMenu = (await js(`[...document.querySelectorAll('.sb-context-item')].map((el) => el.textContent)`)) as string[]
        const expectedGrayMenu = ['Archive task', 'Copy task path', 'Copy session file path', 'Copy session ID']
        if (JSON.stringify(grayMenu) !== JSON.stringify(expectedGrayMenu)) {
          fail(`ticket-54 stage: the gray row menu must carry only the harmless entries (got ${JSON.stringify(grayMenu)})`)
        }
        await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        await waitForProbe(win, `document.querySelector('.sb-context-menu') === null`, 5_000)
        log('dead_cwd_gray_menu_ok')
        log('dead_cwd_hidden_ok')

        // The dead session's file is untouched — zero delete/migrate action.
        if (!existsSync(deadFile)) fail('ticket-42 stage: the dead-cwd session file vanished from disk')
        log('dead_cwd_file_untouched_ok')

        // Title derivation: the post-skill text, never the raw prologue.
        const title = (await js(`document.querySelector('${aliveRow} .sb-task-title')?.textContent ?? ''`)) as string
        if (title !== ALIVE_TITLE) fail(`ticket-42 stage: skill-prologue title not derived (got "${title}")`)
        log('dead_cwd_title_skip_ok')

        // ⌘K: the dead session is unreachable there either; the control is.
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', metaKey: true, bubbles: true })); true`)
        if (!(await waitForProbe(win, `document.querySelector('.palette-overlay') !== null`, 5_000))) {
          fail('ticket-42 stage: the ⌘K palette never opened')
        }
        const typeIntoPalette = (text: string): string =>
          `(() => {
            const input = document.querySelector('.palette-input')
            if (!input) return false
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            setter.call(input, '${text}')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`
        await js(typeIntoPalette('PICODE_42_DEAD'))
        if (!(await waitForProbe(win, `document.querySelectorAll('.palette-item').length === 0`, 3_000))) {
          fail('ticket-42 stage: the dead-cwd session is reachable from ⌘K')
        }
        log('dead_cwd_palette_hidden_ok')

        await js(typeIntoPalette('PICODE_42_TITLE_ALIVE'))
        if (!(await waitForProbe(win, `document.querySelectorAll('.palette-item').length === 1`, 3_000))) {
          fail('ticket-42 stage: the control session is not uniquely reachable from ⌘K')
        }
        log('dead_cwd_palette_control_ok')
        await js(`document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        if (!(await waitForProbe(win, `document.querySelector('.palette-overlay') === null`, 5_000))) {
          fail('ticket-42 stage: the ⌘K palette never closed')
        }

        // LIVE: resume the seeded session in-app (no prompt — the host
        // announces without one), then delete its cwd MID-RUN. The row must
        // survive the index tick that now sees a dead cwd.
        supervisor.handleParentCommand({ type: 'resume_session', sessionFile: liveFile, cwd: liveProject })
        await waitFor((e) => e.type === 'session_created' && e.sessionFile === liveFile, 'ticket-42 resume session_created')
        const liveRow = `[data-file="${liveFile}"]`
        if (!(await waitForProbe(win, `document.querySelector('${liveRow}') !== null`, 10_000))) {
          fail('ticket-42 stage: the resumed live session never reached the sidebar')
        }
        log('dead_cwd_live_resumed_ok')

        rmSync(liveProject, { recursive: true, force: true })
        await new Promise((r) => setTimeout(r, 3_500)) // > one 2s index tick
        if (!((await js(`document.querySelector('${liveRow}') !== null`)) as boolean)) {
          fail('ticket-42 stage: the in-app live session vanished when its cwd was deleted mid-run')
        }
        log('dead_cwd_live_exempt_ok')

        // ticket 54 — the CWD banner: the live session's view (the resume
        // auto-focused it) carries the persistent warning while the cwd is
        // gone: three facts, no dismiss button, anywhere in the banner.
        if (!(await waitForProbe(win, `document.querySelector('.cwd-banner') !== null`, 10_000))) {
          fail('ticket-54 stage: the CWD banner never appeared in the infected session view')
        }
        const bannerProbe = `(() => {
          const banner = document.querySelector('.cwd-banner')
          if (!banner) return null
          return {
            title: banner.querySelector('.cwd-banner-title')?.textContent ?? '',
            facts: [...banner.querySelectorAll('.cwd-banner-facts li')].map((n) => n.textContent),
            buttons: banner.querySelectorAll('button').length
          }
        })()`
        const banner = (await js(bannerProbe)) as { title: string; facts: string[]; buttons: number } | null
        if (banner === null) fail('ticket-54 stage: the CWD banner vanished before it could be inspected')
        if (banner.title !== 'Working directory missing') {
          fail(`ticket-54 stage: the banner title must read "Working directory missing" (got "${banner.title}")`)
        }
        const expectedFacts = [
          'The session keeps running.',
          'File tools will fail until the directory is restored.',
          'After the session exits, it cannot be reopened from that directory.'
        ]
        if (JSON.stringify(banner.facts) !== JSON.stringify(expectedFacts)) {
          fail(`ticket-54 stage: the banner must carry the three facts (got ${JSON.stringify(banner.facts)})`)
        }
        if (banner.buttons !== 0) fail(`ticket-54 stage: the banner must have NO dismiss button (saw ${banner.buttons})`)
        log('cwd_banner_shown_ok')

        // RECOVERY (banner): the directory reappearing clears the flag on
        // the next scan — the banner disappears with no manual step.
        mkdirSync(liveProject, { recursive: true })
        if (!(await waitForProbe(win, `document.querySelector('.cwd-banner') === null`, 10_000))) {
          fail('ticket-54 stage: the CWD banner never disappeared when the directory came back')
        }
        log('cwd_banner_recovered_ok')

        // RECOVERY (gray row): the dead row restores to a normal row the
        // same way — dimming and meta gone, no manual step.
        mkdirSync(deadProject, { recursive: true })
        if (!(await waitForProbe(
          win,
          `(() => { const row = document.querySelector('${deadRow}');
            return row !== null && !row.classList.contains('sb-task-dimmed') && row.querySelector('.sb-task-cwd-meta') === null })()`,
          10_000
        ))) {
          fail('ticket-54 stage: the gray row never restored to normal when its directory reappeared')
        }
        log('cwd_row_recovered_ok')

        // The restored row's menu is back to the FULL nine entries: the menu
        // rides the same render-time projection as the row, so recovery must
        // un-restrict it too — no stale harmless-only menu survives.
        await js(`(() => {
          const row = document.querySelector('${deadRow}')
          if (!(row instanceof Element)) return
          const r = row.getBoundingClientRect()
          row.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true,
            clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
          }))
        })(); true`)
        if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') !== null`, 5_000))) {
          fail('ticket-54 stage: right-click never opened the restored row menu')
        }
        const restoredMenu = (await js(`[...document.querySelectorAll('.sb-context-item')].map((el) => el.textContent)`)) as string[]
        const expectedRestoredMenu = [
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
        if (JSON.stringify(restoredMenu) !== JSON.stringify(expectedRestoredMenu)) {
          fail(`ticket-54 stage: the restored row menu must be the full nine entries (got ${JSON.stringify(restoredMenu)})`)
        }
        await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        await waitForProbe(win, `document.querySelector('.sb-context-menu') === null`, 5_000)
        log('cwd_menu_restored_ok')

        // The control row survived everything (no accidental over-filtering).
        if (!((await js(`document.querySelector('${aliveRow}') !== null`)) as boolean)) {
          fail('ticket-42 stage: the alive control row was wrongly filtered')
        }
      })
    } finally {
      rmSync(aliveProject, { recursive: true, force: true })
      rmSync(liveProject, { recursive: true, force: true })
      rmSync(deadProject, { recursive: true, force: true })
    }
    log('dead_cwd_done')

    // ---- ticket 43: history tree restyle — jump + fork don't regress ----
    // A seeded branched session (user → assistant+toolCall → toolResult →
    // assistant text, plus a second assistant branch off the user) drives
    // the restyled dropdown end to end: type labels and the [bash: …] tool
    // row render, the noise entries stay hidden, exactly one current tag —
    // then clicking the sibling branch row MOVES the leaf (session_tree
    // leafId + current tag follows) and the row-end fork creates a new
    // session (session_created, new file in the isolated store) without
    // touching the original.
    log('history_tree_start')
    const treeStore = process.env['PICODE_SESSION_DIR']
    if (!treeStore) fail('ticket-43 stage: PICODE_SESSION_DIR is not set')
    const treeProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-tree43-'))
    try {
      const stamp = new Date().toISOString()
      const treeFile = path.join(treeStore, 'tree43.jsonl')
      writeFileSync(
        treeFile,
        [
          JSON.stringify({ type: 'session', version: 3, id: 'tree43-fixed-id', timestamp: stamp, cwd: treeProject }),
          JSON.stringify({
            type: 'message', id: 't43-u1', parentId: null, timestamp: stamp,
            message: { role: 'user', content: [{ type: 'text', text: 'PICODE_TREE43 fork point' }] }
          }),
          JSON.stringify({
            type: 'message', id: 't43-a1', parentId: 't43-u1', timestamp: stamp,
            message: {
              role: 'assistant',
              content: [
                { type: 'toolCall', id: 't43-c1', name: 'bash', arguments: { command: 'rg -n rate src/gateway' } },
                { type: 'text', text: 'PICODE_TREE43 branch one' }
              ],
              stopReason: 'toolUse'
            }
          }),
          JSON.stringify({
            type: 'message', id: 't43-r1', parentId: 't43-a1', timestamp: stamp,
            message: {
              role: 'toolResult', toolCallId: 't43-c1', toolName: 'bash',
              content: [{ type: 'text', text: 'src/gateway/middleware.ts:41' }], isError: false
            }
          }),
          JSON.stringify({
            type: 'message', id: 't43-a3', parentId: 't43-u1', timestamp: stamp,
            message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_TREE43 branch two' }], stopReason: 'stop' }
          }),
          // Written LAST so the file-order leaf (Pi's restore rule) is a2.
          JSON.stringify({
            type: 'message', id: 't43-a2', parentId: 't43-r1', timestamp: stamp,
            message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_TREE43 leaf path end' }], stopReason: 'stop' }
          })
        ].join('\n') + '\n'
      )

      supervisor.handleParentCommand({ type: 'resume_session', sessionFile: treeFile, cwd: treeProject })
      await waitFor((e) => e.type === 'session_created' && e.sessionFile === treeFile, 'ticket-43 resume session_created')

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        if (!(await waitForProbe(win, `document.querySelector('.chat-view') !== null`, 10_000))) {
          fail('ticket-43 stage: the resumed session never reached the chat view')
        }

        // Open the History dropdown.
        await js(
          `[...document.querySelectorAll('.chat-topbar-btn')].find((el) => el.textContent?.includes('History'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
        )
        if (!(await waitForProbe(win, `document.querySelectorAll('.tree-row').length > 0`, 5_000))) {
          fail('ticket-43 stage: the tree rows never rendered')
        }

        // Display form: type labels, the tool row, noise hidden, one current.
        const form = (await js(`(() => {
          const texts = [...document.querySelectorAll('.tree-row .tree-row-text')].map((el) => el.textContent ?? '')
          const labels = [...document.querySelectorAll('.tree-row .tree-row-type')].map((el) => el.textContent ?? '')
          return {
            userLabels: labels.filter((l) => l === 'user:').length,
            assistantLabels: labels.filter((l) => l === 'assistant:').length,
            toolRows: texts.filter((t) => t.startsWith('[bash: ')).length,
            noise: texts.filter((t) => t.includes('model_change') || t.includes('toolResult')).length,
            currentTags: document.querySelectorAll('.tree-leaf-tag').length
          }
        })()`)) as { userLabels: number; assistantLabels: number; toolRows: number; noise: number; currentTags: number }
        if (form.userLabels < 1 || form.assistantLabels < 2) {
          fail(`ticket-43 stage: type labels missing (${JSON.stringify(form)})`)
        }
        if (form.toolRows !== 1) fail(`ticket-43 stage: expected exactly one tool row (${JSON.stringify(form)})`)
        if (form.noise !== 0) fail(`ticket-43 stage: noise leaked into the tree (${JSON.stringify(form)})`)
        if (form.currentTags !== 1) fail(`ticket-43 stage: expected exactly one current tag (${JSON.stringify(form)})`)
        log('history_tree_form_ok')

        // JUMP: click the sibling branch row — the leaf moves (session_tree
        // with the new leafId), and the current tag follows the row.
        const branchRow = `[...document.querySelectorAll('.tree-row')].find((el) => el.textContent?.includes('PICODE_TREE43 branch two'))`
        const jumpPromise = waitFor(
          (e) => e.type === 'session_tree' && e.tree.leafId === 't43-a3',
          'ticket-43 navigate session_tree'
        )
        await js(`${branchRow}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        await jumpPromise
        if (!(await waitForProbe(win, `(() => {
          const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent?.includes('PICODE_TREE43 branch two'))
          return row !== undefined && row.querySelector('.tree-leaf-tag') !== null
        })()`, 5_000))) {
          fail('ticket-43 stage: the current tag never followed the jump')
        }
        log('history_tree_jump_ok')

        // FORK: the row-end fork button on the OTHER branch's leaf row —
        // a new session appears (session_created with a NEW file), the
        // original file stays on disk with every branch.
        const forkPromise = waitFor(
          (e) => e.type === 'session_created' && typeof e.sessionFile === 'string' && e.sessionFile !== treeFile,
          'ticket-43 fork session_created'
        )
        await js(`(() => {
          const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent?.includes('PICODE_TREE43 leaf path end'))
          row?.querySelector('.tree-fork-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)
        const forked = await forkPromise
        if (forked.type !== 'session_created' || typeof forked.sessionFile !== 'string') {
          fail('ticket-43 stage: fork produced no session_created with a file')
        }
        if (!existsSync(forked.sessionFile)) fail('ticket-43 stage: the forked session file never landed in the store')
        if (!(await waitForProbe(win, `document.querySelector('[data-file="${forked.sessionFile}"]') !== null`, 10_000))) {
          fail('ticket-43 stage: the forked session never reached the sidebar')
        }
        if (!existsSync(treeFile)) fail('ticket-43 stage: the original session file vanished after the fork')
        log('history_tree_fork_ok')

        // Close the dropdown (Escape) — the panel must not linger over the
        // switched session.
        await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
      })
    } finally {
      rmSync(treeProject, { recursive: true, force: true })
    }
    log('history_tree_done')

    // ---- ticket 83: the History-button toggle race — the ticket-70 race's
    // second sighting, on the branch-history panel. TreePanel hung a
    // document-level mousedown outside-close that did NOT exempt the owning
    // History button: with the panel open, the mousedown half of a press on
    // the button closed it (the button sits outside the panel), React
    // re-rendered with treeOpen === false, and the button's click toggle
    // reopened it — "click again to close" bounced straight back open.
    // After the fix (the shared shouldCloseOnOutsideMousedown seam with the
    // button as the anchor) the decisive mid-press probe keeps the panel
    // mounted and the completing click does the one close; real outside
    // presses and Esc still close for good; presses inside the panel never
    // take the outside path. ----
    log('history_toggle_start')
    const toggleStore = process.env['PICODE_SESSION_DIR']
    if (!toggleStore) fail('ticket-83 stage: PICODE_SESSION_DIR is not set')
    const toggleProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-tree83-'))
    try {
      const stamp = new Date().toISOString()
      const toggleFile = path.join(toggleStore, 'tree83.jsonl')
      writeFileSync(
        toggleFile,
        [
          JSON.stringify({ type: 'session', version: 3, id: 'tree83-fixed-id', timestamp: stamp, cwd: toggleProject }),
          JSON.stringify({
            type: 'message', id: 't83-u1', parentId: null, timestamp: stamp,
            message: { role: 'user', content: [{ type: 'text', text: 'PICODE_TREE83 toggle fixture' }] }
          }),
          JSON.stringify({
            type: 'message', id: 't83-a1', parentId: 't83-u1', timestamp: stamp,
            message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_TREE83 reply' }], stopReason: 'stop' }
          }),
          // Written LAST so the file-order leaf is a2 — a1 is a mid-path
          // assistant row the row-press probe can navigate to (ticket 79:
          // navigating to a USER entry moves the leaf to its parent, so the
          // probe presses an assistant row — the ticket-43 proven path).
          JSON.stringify({
            type: 'message', id: 't83-a2', parentId: 't83-a1', timestamp: stamp,
            message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_TREE83 leaf path end' }], stopReason: 'stop' }
          })
        ].join('\n') + '\n'
      )

      supervisor.handleParentCommand({ type: 'resume_session', sessionFile: toggleFile, cwd: toggleProject })
      await waitFor((e) => e.type === 'session_created' && e.sessionFile === toggleFile, 'ticket-83 resume session_created')

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        if (!(await waitForProbe(win, `document.querySelector('.chat-view') !== null`, 10_000))) {
          fail('ticket-83 stage: the resumed session never reached the chat view')
        }
        const panelPresentJs = `document.querySelector('.tree-panel') !== null`
        const waitPanel = async (want: boolean): Promise<void> => {
          if (!(await waitForProbe(win, want ? panelPresentJs : `!(${panelPresentJs})`, 5_000))) {
            fail(`the history panel should be ${want ? 'open' : 'closed'} but never settled`)
          }
        }

        // Open with a REAL press; rows arrive after the toggle's request_tree.
        if (!(await js(historyBtnPressJs()).catch(() => false))) fail('the History button is missing for the toggle stage')
        await waitPanel(true)
        if (!(await waitForProbe(win, `document.querySelectorAll('.tree-row').length > 0`, 5_000))) {
          fail('ticket-83 stage: the tree rows never rendered')
        }

        // The decisive mid-press probe: after the mousedown half of a press
        // on the OWNING History button the panel must still be there
        // (pre-83 it was already closed at this point — the click then
        // reopened it). The completing click does the one close (toggle).
        if (!(await js(historyBtnDownJs()).catch(() => false))) fail('the History button is missing mid-press')
        await new Promise((r) => setTimeout(r, 250))
        if (!(await js(panelPresentJs).catch(() => false))) {
          fail('the history panel closed on the mousedown half of the owning History press (the pre-83 race is back)')
        }
        await js(historyBtnPressCompletionJs())
        await waitPanel(false)
        log('history_toggle_press_closes')

        // A press INSIDE the panel never takes the outside path: mousedown
        // the panel header, probe, then complete the (handlerless) click.
        if (!(await js(historyBtnPressJs()).catch(() => false))) fail('the History button is missing for the inside-press probe')
        await waitPanel(true)
        const headerDown = await js(
          `(() => {
            const header = document.querySelector('.tree-panel-header')
            if (!(header instanceof HTMLElement)) return false
            const r = header.getBoundingClientRect()
            header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
            return true
          })()`
        ).catch(() => false)
        if (!headerDown) fail('the history panel has no header to press')
        await new Promise((r) => setTimeout(r, 250))
        if (!(await js(panelPresentJs).catch(() => false))) fail('the history panel closed on a mousedown INSIDE it (outside-close leaked inward)')
        await js(
          `(() => {
            const header = document.querySelector('.tree-panel-header')
            if (!(header instanceof HTMLElement)) return false
            const r = header.getBoundingClientRect()
            for (const type of ['mouseup', 'click']) {
              header.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
            }
            return true
          })()`
        )
        await new Promise((r) => setTimeout(r, 250))
        if (!(await js(panelPresentJs).catch(() => false))) fail('the history panel closed on a click INSIDE it')
        log('history_toggle_inside_ok')

        // Esc still closes.
        await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        await waitPanel(false)
        log('history_toggle_esc_ok')

        // A real outside press closes for good: open, then a full press on
        // document.body, re-checked after a beat so a late reopen cannot hide.
        if (!(await js(historyBtnPressJs()).catch(() => false))) fail('the History button is missing for the outside-close probe')
        await waitPanel(true)
        await js(
          `(() => {
            const r = document.body.getBoundingClientRect()
            for (const type of ['mousedown', 'mouseup', 'click']) {
              document.body.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
            }
            return true
          })()`
        )
        await waitPanel(false)
        await new Promise((r) => setTimeout(r, 400))
        if (!(await js(`!(${panelPresentJs})`).catch(() => false))) fail('the history panel came back after a real outside press')
        log('history_toggle_outside_ok')

        // Panel actions never mis-close: a full press on a navigate row
        // (the mid-path assistant a1 — the leaf is its child a2, so the
        // navigate moves) moves the leaf (the current tag follows) and the
        // panel STAYS open.
        if (!(await js(historyBtnPressJs()).catch(() => false))) fail('the History button is missing for the row-press probe')
        await waitPanel(true)
        if (!(await waitForProbe(win, `document.querySelectorAll('.tree-row').length > 0`, 5_000))) {
          fail('ticket-83 stage: the tree rows never rendered for the row press')
        }
        const rowDown = await js(
          `(() => {
            const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent?.includes('PICODE_TREE83 reply'))
            if (!(row instanceof HTMLElement)) return false
            const r = row.getBoundingClientRect()
            row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
            return true
          })()`
        ).catch(() => false)
        if (!rowDown) fail('the history panel has no navigate row to press')
        await new Promise((r) => setTimeout(r, 250))
        if (!(await js(panelPresentJs).catch(() => false))) fail('the history panel closed on a row mousedown (outside-close leaked inward)')
        await js(
          `(() => {
            const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent?.includes('PICODE_TREE83 reply'))
            if (!(row instanceof HTMLElement)) return false
            const r = row.getBoundingClientRect()
            for (const type of ['mouseup', 'click']) {
              row.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
            }
            return true
          })()`
        )
        if (!(await waitForProbe(win, `(() => {
          const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent?.includes('PICODE_TREE83 reply'))
          return row !== undefined && row.querySelector('.tree-leaf-tag') !== null
        })()`, 5_000))) {
          fail('ticket-83 stage: the row press never navigated (the leaf tag never moved)')
        }
        if (!(await js(panelPresentJs).catch(() => false))) fail('the history panel closed after a completed row navigation')
        log('history_toggle_row_ok')
      })
    } finally {
      rmSync(toggleProject, { recursive: true, force: true })
    }
    log('history_toggle_done')

    // ---- ticket 45: scroll stay + jump-to-latest ----
    // A FRESH session drives the three acceptance assertions. createSession
    // switches focus to it (multi-session precedent), so the transcript is
    // an in-app ChatView BY CONSTRUCTION — no sidebar routing (a row click
    // on a session with a fresh file mtime can take the Live Follow path,
    // whose view shares .chat-scroll but has no composer/jump button):
    // ① streamed growth does NOT yank a reader who scrolled away (Q12 fix)
    //    and the circular jump button fades in past the stick threshold;
    // ② clicking the button smooth-travels back to the bottom and the
    //    button fades out;
    // ③ the user's own send jumps to the bottom even from scrolled-away.
    log('scroll_stay_start')
    const scrollCreated = waitFor(
      (e) => e.type === 'session_created',
      'scroll_stay session_created'
    ) as Promise<Extract<Scoped, { type: 'session_created' }>>
    supervisor.createSession(cwd)
    const scrollSession = await scrollCreated
    const scrollId = scrollSession.sessionId
    // The transcript's height must not depend on the model's answer format
    // (a fast model may compress the count into a few wrapped lines). The
    // user bubble renders pre-wrap, so the prompt itself carries 100 blank
    // lines — a ~2500px bubble that makes the transcript scrollable no
    // matter how the reply comes back.
    const COUNT_PROMPT =
      'PICODE_SCROLL_45: Count from 1 to 120. Output each number on its own line, one number per line. Do not summarize and do not stop early. Do not use any tools — write the numbers directly in your reply text.\n' +
      '\n'.repeat(100)
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      /** Bottom-distance probe on the transcript scroll container. */
      const AT_BOTTOM = `(() => { const el = document.querySelector('.chat-scroll'); return el !== null && el.scrollHeight - el.scrollTop - el.clientHeight < 40 })()`
      /** Jump button probe: present, visible class on, opacity settled. */
      const JUMP_VISIBLE = `(() => {
        const btn = document.querySelector('.chat-jump-btn')
        return btn !== null && btn.classList.contains('chat-jump-btn-visible') && Number(getComputedStyle(btn).opacity) > 0.9
      })()`
      const JUMP_HIDDEN = `(() => {
        const btn = document.querySelector('.chat-jump-btn')
        return btn !== null && !btn.classList.contains('chat-jump-btn-visible')
      })()`
      const SCROLL_DIAG = `JSON.stringify({
        scrollTop: document.querySelector('.chat-scroll')?.scrollTop ?? null,
        scrollH: document.querySelector('.chat-scroll')?.scrollHeight ?? null,
        clientH: document.querySelector('.chat-scroll')?.clientHeight ?? null,
        btn: document.querySelector('.chat-jump-btn')?.className ?? null,
        btnOpacity: document.querySelector('.chat-jump-btn')
          ? Number(getComputedStyle(document.querySelector('.chat-jump-btn')).opacity)
          : null,
        chatView: document.querySelector('.chat-view') !== null,
        followBadge: document.querySelector('.follow-badge') !== null
      })`

      // The fresh session's empty chat view is on screen.
      if (!(await waitForProbe(win, `document.querySelector('.chat-view') !== null`, 10_000))) {
        fail('ticket-45 stage: the fresh session never reached the chat view')
      }

      // Start a LONG streaming run on the focused session. The user_message
      // echo renders the turn (the arrival pin completes there) and the
      // answer streams with the view pinned at the bottom.
      supervisor.handleParentCommand({
        type: 'session_command',
        sessionId: scrollId,
        command: { type: 'prompt', text: COUNT_PROMPT }
      })
      await waitFor((e) => e.type === 'agent_start' && e.sessionId === scrollId, 'scroll_stay agent_start')
      if (
        !(await waitForProbe(
          win,
          `(document.querySelector('.chat-thread')?.textContent ?? '').includes('PICODE_SCROLL_45')`,
          10_000
        ))
      ) {
        fail('ticket-45 stage: the count prompt never rendered in the focused transcript')
      }
      await waitFor((e) => e.type === 'text_delta' && e.sessionId === scrollId, 'scroll_stay first text_delta')
      if (!(await waitForProbe(win, AT_BOTTOM, 5_000))) {
        fail('ticket-45 stage: the streaming transcript did not stay pinned at the bottom')
      }
      log('scroll_stay_focus_pinned_ok')

      // ① Scroll away while streaming: growth must NOT yank (Q12), and the
      // jump button must fade in past the stick threshold.
      await js(`(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop = 0; return true })(); true`)
      if (!(await waitForProbe(win, `document.querySelector('.chat-scroll').scrollTop === 0 && (${JUMP_VISIBLE})`, 5_000))) {
        const diag = (await win.webContents.executeJavaScript(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-45 stage: the jump button never faded in after scrolling away; DOM: ${diag}`)
      }
      const topBefore = (await js(`document.querySelector('.chat-scroll').scrollTop`)) as number
      for (let seen = 0; seen < 3; seen++) {
        await waitFor((e) => e.type === 'text_delta' && e.sessionId === scrollId, 'scroll_stay growth text_delta')
      }
      await new Promise((r) => setTimeout(r, 300))
      const topAfter = (await js(`document.querySelector('.chat-scroll').scrollTop`)) as number
      if (topAfter !== topBefore) fail(`ticket-45 stage: streamed growth yanked the reader (${topBefore} → ${topAfter})`)
      log('scroll_stay_no_yank_ok')

      // ② Click the jump button: travel back to the bottom, button fades out.
      await js(
        `document.querySelector('.chat-jump-btn').dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `(${AT_BOTTOM}) && (${JUMP_HIDDEN})`, 5_000))) {
        const diag = (await win.webContents.executeJavaScript(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-45 stage: the jump click never returned to the bottom / the button never faded out; DOM: ${diag}`)
      }
      log('scroll_stay_jump_back_ok')

      // ③ Own send jumps from scrolled-away: settle the run first (a send
      // while busy would take the queued follow-up path — no user_message
      // echo), then scroll to the top and send normally. The echo's
      // user_message pass must pin the bottom.
      supervisor.handleParentCommand({
        type: 'session_command',
        sessionId: scrollId,
        command: { type: 'abort_turn' }
      })
      // Idle = the send button replaced the stop button — true whether the
      // abort landed or the count had already finished on its own.
      if (!(await waitForProbe(win, `document.querySelector('.cmp-send') !== null`, 15_000))) {
        fail('ticket-45 stage: the composer never left the busy state after the abort')
      }
      await new Promise((r) => setTimeout(r, 500)) // the settle/fold rewrites settle
      await js(`(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop = 0; return true })(); true`)
      if (!(await waitForProbe(win, `document.querySelector('.chat-scroll').scrollTop === 0 && (${JUMP_VISIBLE})`, 5_000))) {
        const diag = (await win.webContents.executeJavaScript(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-45 stage: the jump button never re-showed for the self-send step; DOM: ${diag}`)
      }
      if (!(await win.webContents.executeJavaScript(composerTypeJs('Reply with exactly: PICODE_SEND_45')).catch(() => false))) {
        fail('ticket-45 stage: composer textarea missing for the self-send')
      }
      await new Promise((r) => setTimeout(r, 300))
      await win.webContents.executeJavaScript(composerKeyJs('Enter'))
      const sent = await waitForProbe(
        win,
        `(document.querySelector('.chat-thread')?.textContent ?? '').includes('PICODE_SEND_45') && (${AT_BOTTOM}) && (${JUMP_HIDDEN})`,
        10_000
      )
      if (!sent) {
        const diag = (await win.webContents.executeJavaScript(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-45 stage: the own send never jumped back to the bottom; DOM: ${diag}`)
      }
      log('scroll_stay_self_send_ok')

      // Let the reply turn settle so the stage leaves a quiet session.
      await waitFor((e) => e.type === 'agent_end' && e.sessionId === scrollId, 'scroll_stay reply agent_end')
      await win.webContents.executeJavaScript(composerClearJs)
    })
    log('scroll_stay_done')

    // ---- ticket 75: streaming stick direction awareness — the wheel always wins ----
    // A FRESH session (createSession focuses it — in-app ChatView by
    // construction) drives the three acceptance assertions on top of the
    // ticket-45 stage above (which stays as the no-regression harness and
    // now also covers the far-away held + own-send combination):
    // ① a SLIGHT upward scroll INSIDE the 160px band during streaming sets
    //    the held-away latch — the next deltas must NOT yank (the pre-75
    //    rule fought the wheel frame-by-frame = jitter), and the jump button
    //    stays hidden in-band (160px visibility semantics kept);
    // ② scrolling back down into the band while still streaming RESTORES
    //    the stick — the following deltas keep the bottom pinned;
    // ③ the user's own send while held away still lands at the bottom and
    //    the reply streams pinned through its end (the send clears the
    //    latch — 自发送复位).
    // The run counts to 1200 (vs ticket 45's 120) so the stream OUTLIVES
    // every assertion window below by minutes: a natural run-end mid-window
    // settles-collapse the transcript and the browser clamps the held
    // reader onto the new bottom — an expected latch clear (回底), but one
    // that would read as a false failure. The run is aborted at ③.
    log('scroll75_start')
    const stick75Created = waitFor(
      (e) => e.type === 'session_created',
      'scroll75 session_created'
    ) as Promise<Extract<Scoped, { type: 'session_created' }>>
    supervisor.createSession(cwd)
    const stick75Session = await stick75Created
    const stick75Id = stick75Session.sessionId
    const COUNT_PROMPT_75 =
      'PICODE_SCROLL_75: Count from 1 to 1200. Output each number on its own line, one number per line. Do not summarize and do not stop early. Do not use any tools — write the numbers directly in your reply text.\n' +
      '\n'.repeat(100)
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const AT_BOTTOM = `(() => { const el = document.querySelector('.chat-scroll'); return el !== null && el.scrollHeight - el.scrollTop - el.clientHeight < 40 })()`
      const JUMP_HIDDEN = `(() => {
        const btn = document.querySelector('.chat-jump-btn')
        return btn !== null && !btn.classList.contains('chat-jump-btn-visible')
      })()`
      const SCROLL_DIAG = `JSON.stringify({
        scrollTop: document.querySelector('.chat-scroll')?.scrollTop ?? null,
        scrollH: document.querySelector('.chat-scroll')?.scrollHeight ?? null,
        clientH: document.querySelector('.chat-scroll')?.clientHeight ?? null,
        btn: document.querySelector('.chat-jump-btn')?.className ?? null,
        chatView: document.querySelector('.chat-view') !== null
      })`

      if (!(await waitForProbe(win, `document.querySelector('.chat-view') !== null`, 10_000))) {
        fail('ticket-75 stage: the fresh session never reached the chat view')
      }

      // Start a LONG streaming run; the answer streams with the view pinned
      // at the bottom.
      supervisor.handleParentCommand({
        type: 'session_command',
        sessionId: stick75Id,
        command: { type: 'prompt', text: COUNT_PROMPT_75 }
      })
      await waitFor((e) => e.type === 'agent_start' && e.sessionId === stick75Id, 'scroll75 agent_start')
      if (
        !(await waitForProbe(
          win,
          `(document.querySelector('.chat-thread')?.textContent ?? '').includes('PICODE_SCROLL_75')`,
          10_000
        ))
      ) {
        fail('ticket-75 stage: the count prompt never rendered in the focused transcript')
      }
      await waitFor((e) => e.type === 'text_delta' && e.sessionId === stick75Id, 'scroll75 first text_delta')
      if (!(await waitForProbe(win, AT_BOTTOM, 5_000))) {
        fail('ticket-75 stage: the streaming transcript did not stay pinned at the bottom')
      }

      // ① Slight upward scroll INSIDE the band while streaming: the latch
      // must set immediately — no yank on the next deltas, button stays
      // hidden (in-band, the 160px visibility semantics unchanged). A few
      // deltas first: the stream is deep underway when the gesture lands.
      for (let seen = 0; seen < 3; seen++) {
        await waitFor((e) => e.type === 'text_delta' && e.sessionId === stick75Id, 'scroll75 underway text_delta')
      }
      const heldTop = (await js(
        `(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop -= 60; return el.scrollTop })()`
      )) as number
      log('scroll75_hold_latched', `heldTop=${heldTop}`)
      if (!(await waitForProbe(win, `document.querySelector('.chat-scroll').scrollTop === ${heldTop} && (${JUMP_HIDDEN})`, 2_000))) {
        const diag = (await js(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-75 stage: the in-band hold did not latch (yanked back or the button flickered); DOM: ${diag}`)
      }
      for (let seen = 0; seen < 2; seen++) {
        await waitFor((e) => e.type === 'text_delta' && e.sessionId === stick75Id, 'scroll75 hold text_delta')
      }
      await new Promise((r) => setTimeout(r, 300))
      const heldAfter = (await js(`document.querySelector('.chat-scroll').scrollTop`)) as number
      if (heldAfter !== heldTop) {
        fail(`ticket-75 stage: in-band growth yanked the held reader (${heldTop} → ${heldAfter})`)
      }
      log('scroll75_hold_ok')

      // ② Scroll back down into the band while still streaming: the stick
      // restores — the following deltas keep the bottom pinned (and the
      // button stays hidden in-band).
      await js(`(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop = el.scrollHeight; return true })(); true`)
      if (!(await waitForProbe(win, AT_BOTTOM, 5_000))) {
        fail('ticket-75 stage: the downward return never reached the bottom')
      }
      for (let seen = 0; seen < 3; seen++) {
        await waitFor((e) => e.type === 'text_delta' && e.sessionId === stick75Id, 'scroll75 restore text_delta')
      }
      await new Promise((r) => setTimeout(r, 300))
      if (!(await win.webContents.executeJavaScript(`(${AT_BOTTOM}) && (${JUMP_HIDDEN})`))) {
        const diag = (await js(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-75 stage: the stick never resumed after the return to the bottom; DOM: ${diag}`)
      }
      log('scroll75_restore_ok')

      // ③ Own send while held away (in-band): settle the run first (a send
      // while busy takes the queued path — no user_message echo), re-hold
      // slightly, then send. The echo's user_message pass must clear the
      // latch, pin the bottom, and the reply must stream pinned through its
      // end (the send reset the follow).
      supervisor.handleParentCommand({
        type: 'session_command',
        sessionId: stick75Id,
        command: { type: 'abort_turn' }
      })
      if (!(await waitForProbe(win, `document.querySelector('.cmp-send') !== null`, 15_000))) {
        fail('ticket-75 stage: the composer never left the busy state after the abort')
      }
      await new Promise((r) => setTimeout(r, 500)) // the settle/fold rewrites settle
      await js(`(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop -= 60; return true })(); true`)
      if (!(await win.webContents.executeJavaScript(composerTypeJs('Reply with exactly: PICODE_SEND_75')).catch(() => false))) {
        fail('ticket-75 stage: composer textarea missing for the held-away self-send')
      }
      await new Promise((r) => setTimeout(r, 300))
      await win.webContents.executeJavaScript(composerKeyJs('Enter'))
      const sent75 = await waitForProbe(
        win,
        `(document.querySelector('.chat-thread')?.textContent ?? '').includes('PICODE_SEND_75') && (${AT_BOTTOM}) && (${JUMP_HIDDEN})`,
        10_000
      )
      if (!sent75) {
        const diag = (await js(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-75 stage: the held-away own send never jumped back to the bottom; DOM: ${diag}`)
      }
      // The reply must keep following (the send cleared the latch): still at
      // the bottom when the turn ends and after its settle rewrites.
      await waitFor((e) => e.type === 'agent_end' && e.sessionId === stick75Id, 'scroll75 reply agent_end')
      await new Promise((r) => setTimeout(r, 500))
      if (!(await win.webContents.executeJavaScript(AT_BOTTOM))) {
        const diag = (await js(SCROLL_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-75 stage: the reply drifted from the bottom after the held-away send; DOM: ${diag}`)
      }
      log('scroll75_self_send_ok')

      await win.webContents.executeJavaScript(composerClearJs)
    })
    log('scroll75_done')

    // ---- ticket 46: the turn navigator rail ----
    // A FRESH session (createSession focuses it — in-app ChatView by
    // construction) drives the acceptance chain:
    // ① the rail renders only from two real user messages up (empty and
    //    one-message transcripts show nothing);
    // ② hovering a tick pops the two-segment preview bubble (user input
    //    + assistant reply) after the short open delay, and it fades out
    //    after the shorter close delay;
    // ③ clicking a tick smooth-scrolls that user message to the top edge
    //    and the anchored (focus) tick follows the viewport;
    // ④ a window narrower than the 864px calibration threshold hides the
    //    rail (innerWidth shadowed in-page — the app's own minWidth 1040
    //    can never reach the threshold for real).
    log('nav_rail_start')
    const navCreated = waitFor(
      (e) => e.type === 'session_created',
      'nav_rail session_created'
    ) as Promise<Extract<Scoped, { type: 'session_created' }>>
    supervisor.createSession(cwd)
    const navSession = await navCreated
    const navId = navSession.sessionId
    const NAV_1 = 'Reply with exactly: PICODE_NAV_1'
    const NAV_2 = 'Reply with exactly: PICODE_NAV_2'
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const RAIL_GONE = `document.querySelector('.nav-rail') === null`
      const RAIL_TICKS = (n: number): string =>
        `document.querySelectorAll('.nav-rail:not(.nav-rail-hidden) .nav-tick').length === ${n}`
      const BUBBLE_OPEN = (text: string): string => `(() => {
        const b = document.querySelector('.nav-bubble.nav-bubble-open')
        return b !== null && (b.textContent ?? '').includes(${JSON.stringify(text)}) && Number(getComputedStyle(b).opacity) > 0.9
      })()`
      const BUBBLE_CLOSED = `document.querySelector('.nav-bubble.nav-bubble-open') === null`
      const TICK_FOCUS = (id: string): string =>
        `document.querySelector('.nav-tick-slot[data-nav-tick="${id}"] .nav-tick')?.classList.contains('nav-tick-focus') ?? false`

      // ① Empty transcript: no rail at all.
      if (!(await waitForProbe(win, `document.querySelector('.chat-empty-hint') !== null`, 10_000))) {
        fail('ticket-46 stage: the fresh session never reached the empty chat view')
      }
      if (!(await waitForProbe(win, RAIL_GONE, 3_000))) {
        fail('ticket-46 stage: the rail rendered on an empty transcript (tick < 2 must not render)')
      }
      log('nav_rail_empty_ok')

      // First real user message: still one tick short — no rail. The
      // agent_start waiter registers BEFORE the Enter (same
      // warm-host-fast-model race as the second send below — observed on
      // glm-5.3-flash again 2026-09-15: the run can start inside the
      // executeJavaScript round-trip and a waiter registered after the
      // Enter never sees it).
      const navFirstStart = waitFor((e) => e.type === 'agent_start' && e.sessionId === navId, 'nav_rail first agent_start')
      const navFirstEnd = waitFor((e) => e.type === 'agent_end' && e.sessionId === navId, 'nav_rail first agent_end')
      if (!(await win.webContents.executeJavaScript(composerTypeJs(NAV_1)).catch(() => false))) {
        fail('ticket-46 stage: composer textarea missing for the first nav prompt')
      }
      await new Promise((r) => setTimeout(r, 300))
      await win.webContents.executeJavaScript(composerKeyJs('Enter'))
      await navFirstStart
      await navFirstEnd
      if (!(await waitForProbe(win, `(${RAIL_GONE}) && document.querySelector('.chat-thread')?.textContent.includes('PICODE_NAV_1')`, 10_000))) {
        fail('ticket-46 stage: after one user message the rail must stay hidden')
      }
      log('nav_rail_one_tick_hidden_ok')

      // Second real user message: the rail appears with exactly two ticks.
      // The agent_start waiter registers BEFORE the send: a warm host with a
      // fast model can land agent_start inside the executeJavaScript
      // round-trip, and a waiter registered after the Enter would never see
      // it (observed twice on glm-5.3-flash, 2026-09-09).
      const navSecondStart = waitFor((e) => e.type === 'agent_start' && e.sessionId === navId, 'nav_rail second agent_start')
      const navSecondEnd = waitFor((e) => e.type === 'agent_end' && e.sessionId === navId, 'nav_rail second agent_end')
      if (!(await win.webContents.executeJavaScript(composerTypeJs(NAV_2)).catch(() => false))) {
        fail('ticket-46 stage: composer textarea missing for the second nav prompt')
      }
      await new Promise((r) => setTimeout(r, 300))
      await win.webContents.executeJavaScript(composerKeyJs('Enter'))
      await navSecondStart
      await navSecondEnd
      if (!(await waitForProbe(win, RAIL_TICKS(2), 10_000))) {
        fail('ticket-46 stage: the rail never rendered with two ticks')
      }
      log('nav_rail_two_ticks_ok')

      // ② Hover the first tick: the preview bubble opens with the user
      // input (the assistant reply clamp rides along in the same bubble).
      const hoverJs = `(() => {
        const slot = document.querySelector('.nav-tick-slot')
        if (!slot) return false
        const r = slot.getBoundingClientRect()
        const opts = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
        slot.dispatchEvent(new MouseEvent('mouseover', opts))
        slot.dispatchEvent(new MouseEvent('mouseenter', opts))
        return true
      })()`
      if (!(await win.webContents.executeJavaScript(hoverJs).catch(() => false))) {
        fail('ticket-46 stage: no tick slot to hover')
      }
      if (!(await waitForProbe(win, BUBBLE_OPEN('PICODE_NAV_1'), 8_000))) {
        fail('ticket-46 stage: hovering a tick never opened the preview bubble')
      }
      log('nav_rail_bubble_ok')

      // Leave: the bubble closes after the short close delay + fade.
      const unhoverJs = `(() => {
        const slot = document.querySelector('.nav-tick-slot')
        if (!slot) return false
        slot.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
        slot.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }))
        return true
      })()`
      await win.webContents.executeJavaScript(unhoverJs)
      if (!(await waitForProbe(win, BUBBLE_CLOSED, 5_000))) {
        fail('ticket-46 stage: the preview bubble never closed after the pointer left')
      }
      log('nav_rail_bubble_close_ok')

      // ③ Click the first tick: smooth-scroll lands the message just below
      // the top edge, and the anchored tick follows the viewport.
      const clickJs = `(() => {
        const el = document.querySelector('.chat-scroll')
        const slot = document.querySelector('.nav-tick-slot')
        if (!el || !slot) return null
        const id = slot.getAttribute('data-nav-tick')
        const target = el.querySelector('[data-turn-id="' + id + '"]')
        if (!target) return null
        const expected = Math.max(0, target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 16)
        slot.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return { id, expected }
      })()`
      const clicked = (await js(clickJs)) as { id: string; expected: number } | null
      if (clicked === null || clicked.id === '') {
        fail('ticket-46 stage: the tick click could not resolve its scroll target')
      }
      const landed = await waitForProbe(
        win,
        `(() => { const el = document.querySelector('.chat-scroll'); return Math.abs(el.scrollTop - ${clicked.expected}) < 60 })()`,
        5_000
      )
      if (!landed) {
        fail(`ticket-46 stage: the tick click never smooth-scrolled to the message (expected ${clicked.expected})`)
      }
      if (!(await waitForProbe(win, TICK_FOCUS(clicked.id), 5_000))) {
        fail('ticket-46 stage: the clicked message tick never took the anchored (focus) state')
      }
      log('nav_rail_click_jump_ok')

      // ④ Narrower than the 864px threshold → the rail hides with the
      // fade/translate transition. The app's minWidth (1040) can never
      // reach it, so shadow window.innerWidth in-page and fire resize.
      const narrowJs = `(() => {
        const own = Object.getOwnPropertyDescriptor(window, 'innerWidth')
        const desc = own ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'innerWidth')
        window.__navInnerWidth = { own, desc }
        Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true })
        window.dispatchEvent(new Event('resize'))
        return window.innerWidth === 700
      })()`
      if ((await js(narrowJs)) !== true) {
        fail('ticket-46 stage: could not shadow innerWidth for the narrow-window probe')
      }
      if (
        !(await waitForProbe(
          win,
          `(() => { const r = document.querySelector('.nav-rail'); return r !== null && r.classList.contains('nav-rail-hidden') && Number(getComputedStyle(r).opacity) < 0.1 })()`,
          5_000
        ))
      ) {
        fail('ticket-46 stage: the rail never hid below the 864px window threshold')
      }
      const widenJs = `(() => {
        const saved = window.__navInnerWidth ?? {}
        Reflect.deleteProperty(window, 'innerWidth')
        if (saved.own) Object.defineProperty(window, 'innerWidth', saved.own)
        window.dispatchEvent(new Event('resize'))
        return window.innerWidth > 1000
      })()`
      if ((await js(widenJs)) !== true) {
        fail('ticket-46 stage: could not restore innerWidth after the narrow-window probe')
      }
      if (
        !(await waitForProbe(
          win,
          `(() => { const r = document.querySelector('.nav-rail'); return r !== null && !r.classList.contains('nav-rail-hidden') && Number(getComputedStyle(r).opacity) > 0.9 })()`,
          5_000
        ))
      ) {
        fail('ticket-46 stage: the rail never came back once the window widened')
      }
      log('nav_rail_narrow_hidden_ok')

      await win.webContents.executeJavaScript(composerClearJs)
    })
    log('nav_rail_done')

    // ---- ticket 49: composer adaptive height — auto-grow 74→160px plus
    // the top-right expand button ----
    // The component is SHARED by both composers, so the stage drives both:
    // ① the New Task empty state (opened from the sidebar): the persistent
    //    top-right button with the ⌘E keycap tooltip (ticket 57 — shortcut
    //    only, no description), the 74px floor, in-place expansion to
    //    about half the main zone, the Esc collapse, and the global ⌘E
    //    chord toggling both ways (ticket 57);
    // ② a fresh session (createSession focuses it — ChatView by
    //    construction): auto-grow clamps [74,160] with internal scrolling
    //    at the cap, the expansion PUSHES the transcript down (no overlay),
    //    all three collapse paths (re-click / Esc / send success) land
    //    back on the resting composer, and the global ⌘E chord (ticket 57)
    //    toggles the expanded state both ways.
    log('composer_expand_start')
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      /** The tooltip contract: ⌘E keycap only (ticket 57), no label. */
      const expandTipJs = (scope: string): string => `(() => {
        const b = document.querySelector('${scope} .composer-expand')
        if (!(b instanceof HTMLElement)) return null
        return JSON.stringify({ label: b.getAttribute('data-tip-label'), shortcut: b.getAttribute('data-tip-shortcut') })
      })()`
      /** The global ⌘E chord, dispatched as a PHYSICAL-key event (code +
       * modifiers only — the same judgment surface the keymap reads,
       * ticket-27 stage precedent). */
      const pressCmdE = (): Promise<unknown> =>
        win.webContents.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', metaKey: true, bubbles: true }))`
        )
      /** Expanded height = about half the main zone, clamped [280, 560]
       *  (the Seam-1 projection, re-derived from the same measured region). */
      const EXPANDED_FORMULA = (region: string): string => `(() => {
        const ta = document.querySelector('.composer-input')
        const zone = document.querySelector('${region}')
        if (!(ta instanceof HTMLElement) || zone === null) return false
        const expected = Math.round(Math.min(Math.max(zone.clientHeight / 2, 280), 560))
        return ta.clientHeight === expected && ta.clientHeight >= 280 && ta.clientHeight <= 560
      })()`
      /** Click the expand button inside the given composer scope. */
      const clickExpand = async (scope: string): Promise<void> => {
        const clicked = (await js(`(() => {
          const b = document.querySelector('${scope} .composer-expand')
          if (b instanceof HTMLElement) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true }
          return false
        })()`)) as boolean
        if (!clicked) fail(`ticket-49 stage: could not click the ${scope} expand button`)
      }

      // ① The New Task empty state. The sidebar may be closed by earlier
      // stages — reopen it through its titlebar toggle first.
      await js(`(() => {
        if (document.querySelector('.sb-actions')) return true
        const toggle = document.querySelector('button[aria-label="Show sidebar"]')
        if (toggle instanceof HTMLElement) { toggle.click(); return true }
        return false
      })()`)
      if (!(await waitForProbe(win, `document.querySelector('.sb-actions') !== null`, 5_000))) {
        fail('ticket-49 stage: the sidebar never showed for the New Task click')
      }
      const newTaskClicked = (await js(`(() => {
        const row = [...document.querySelectorAll('.sb-action-row')].find((b) => (b.textContent ?? '').includes('New Task'))
        if (row instanceof HTMLElement) { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true }
        return false
      })()`)) as boolean
      if (!newTaskClicked) fail('ticket-49 stage: could not click the sidebar New Task row')
      const emptyTa = `document.querySelector('.empty-state textarea.composer-input')`
      if (!(await waitForProbe(win, `${emptyTa} !== null`, 5_000))) {
        fail('ticket-49 stage: the New Task empty state never showed its composer')
      }
      if (!(await waitForProbe(win, `${emptyTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-49 stage: the empty-state composer never settled at the 74px floor')
      }
      const emptyTip = JSON.parse(String(await js(expandTipJs('.empty-state'))))
      if (!emptyTip || emptyTip.label !== null || emptyTip.shortcut !== '⌘E') {
        fail(`ticket-49 stage: the empty-state expand tooltip is ${JSON.stringify(emptyTip)}, expected the ⌘E keycap only (ticket 57)`)
      }
      await clickExpand('.empty-state')
      if (!(await waitForProbe(win, EXPANDED_FORMULA('.empty-state'), 5_000))) {
        fail('ticket-49 stage: the empty-state expansion never reached the projected half-zone height')
      }
      // Esc collapses back to the floor (collapse path ②).
      await win.webContents.executeJavaScript(composerKeyJs('Escape'))
      if (!(await waitForProbe(win, `${emptyTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-49 stage: Esc never collapsed the empty-state composer back to the floor')
      }
      // ⌘E (ticket 57): the global chord toggles THIS composer too — the
      // empty state shares the component — and a re-press retracts.
      await pressCmdE()
      if (!(await waitForProbe(win, EXPANDED_FORMULA('.empty-state'), 5_000))) {
        fail('ticket-57: ⌘E never expanded the empty-state composer')
      }
      if ((await js(`document.querySelector('.empty-state .composer-expand')?.getAttribute('aria-expanded')`)) !== 'true') {
        fail('ticket-57: ⌘E expanded the empty-state composer without aria-expanded=true')
      }
      await pressCmdE()
      if (!(await waitForProbe(win, `${emptyTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-57: the second ⌘E never retracted the empty-state composer')
      }
      log('composer_expand_key_empty_state_ok')
      log('composer_expand_empty_state_ok')

      // ② A fresh session drives the in-session chain. createSession
      // focuses it — the empty state swaps to the ChatView by construction.
      const expandCreated = waitFor(
        (e) => e.type === 'session_created',
        'expand session_created'
      ) as Promise<Extract<Scoped, { type: 'session_created' }>>
      supervisor.createSession(cwd)
      const expandSession = await expandCreated
      const expandId = expandSession.sessionId
      if (!(await waitForProbe(win, `document.querySelector('.chat-dock textarea.composer-input') !== null`, 10_000))) {
        fail('ticket-49 stage: the fresh session never reached the chat view composer')
      }
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
      const chatExpand = `document.querySelector('.chat-dock .composer-expand')`
      const EXPAND_DIAG = `JSON.stringify({
        height: document.querySelector('.chat-dock textarea.composer-input')?.clientHeight ?? null,
        scrollH: document.querySelector('.chat-dock textarea.composer-input')?.scrollHeight ?? null,
        expanded: document.querySelector('.chat-dock .composer-expand')?.getAttribute('aria-expanded') ?? null,
        zoneH: document.querySelector('.chat-view')?.clientHeight ?? null,
        scrollClientH: document.querySelector('.chat-scroll')?.clientHeight ?? null
      })`
      /** The projection, re-derived from the live measurement: the rendered
       *  height must equal clamp(scrollHeight, 74, 160) at ALL times. */
      const AUTO_GROW_FORMULA = `${chatTa} !== null && ${chatTa}.clientHeight === Math.min(Math.max(${chatTa}.scrollHeight, 74), 160)`

      if (!(await waitForProbe(win, `${chatTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-49 stage: the in-session composer never settled at the 74px floor')
      }
      // A few lines grow the input inside the band (still under the cap).
      if (!(await win.webContents.executeJavaScript(composerTypeJs('line one\nline two\nline three')).catch(() => false))) {
        fail('ticket-49 stage: could not type the mid-band draft')
      }
      if (!(await waitForProbe(win, `${chatTa}.clientHeight > 74 && ${chatTa}.clientHeight < 160 && (${AUTO_GROW_FORMULA})`, 5_000))) {
        const diag = (await win.webContents.executeJavaScript(EXPAND_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-49 stage: the input never grew inside the 74→160 band; DOM: ${diag}`)
      }
      log('composer_autogrow_midband_ok')

      // A long pasted draft pins the 160px cap and scrolls INTERNALLY.
      const LONG_DRAFT = Array.from({ length: 14 }, (_, i) => `draft line ${i + 1}`).join('\n')
      if (!(await win.webContents.executeJavaScript(composerTypeJs(LONG_DRAFT)).catch(() => false))) {
        fail('ticket-49 stage: could not type the long draft')
      }
      if (!(await waitForProbe(win, `${chatTa}.clientHeight === 160 && ${chatTa}.scrollHeight > ${chatTa}.clientHeight`, 5_000))) {
        const diag = (await win.webContents.executeJavaScript(EXPAND_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-49 stage: the long draft never pinned the 160px cap with internal scrolling; DOM: ${diag}`)
      }
      log('composer_autogrow_cap_ok')
      await win.webContents.executeJavaScript(composerClearJs)
      if (!(await waitForProbe(win, `${chatTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-49 stage: clearing the draft never returned the input to the floor')
      }
      log('composer_autogrow_reset_ok')

      // The expand button: keycap-only tooltip (⌘E — ticket 57),
      // aria-expanded reflects the machine state.
      const chatTip = JSON.parse(String(await js(expandTipJs('.chat-dock'))))
      if (!chatTip || chatTip.label !== null || chatTip.shortcut !== '⌘E') {
        fail(`ticket-49 stage: the chat expand tooltip is ${JSON.stringify(chatTip)}, expected the ⌘E keycap only (ticket 57)`)
      }
      // Expansion pushes the transcript down: the transcript cell shrinks
      // and the composer card stays fully BELOW it (in-flow, no overlay).
      const transcriptBefore = (await js(`document.querySelector('.chat-scroll')?.clientHeight ?? 0`)) as number
      await clickExpand('.chat-dock')
      if (
        !(await waitForProbe(
          win,
          `(() => {
            const ta = document.querySelector('.chat-dock textarea.composer-input')
            const card = document.querySelector('.chat-dock .composer')
            const transcript = document.querySelector('.chat-scroll')
            const expandBtn = document.querySelector('.chat-dock .composer-expand')
            if (!ta || !card || !transcript || !expandBtn) return false
            if (expandBtn.getAttribute('aria-expanded') !== 'true') return false
            if (transcript.clientHeight >= ${transcriptBefore}) return false
            return card.getBoundingClientRect().top >= transcript.getBoundingClientRect().bottom - 1
          })()`,
          5_000
        ))
      ) {
        const diag = (await win.webContents.executeJavaScript(EXPAND_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-49 stage: the expansion never pushed the transcript down in place; DOM: ${diag}`)
      }
      if (!(await waitForProbe(win, EXPANDED_FORMULA('.chat-view'), 5_000))) {
        const diag = (await win.webContents.executeJavaScript(EXPAND_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-49 stage: the in-session expansion never reached the projected half-zone height; DOM: ${diag}`)
      }
      log('composer_expand_open_ok')

      // Collapse path ①: clicking the button again lands back on the floor.
      await clickExpand('.chat-dock')
      if (!(await waitForProbe(win, `${chatTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-49 stage: re-clicking the expand button never collapsed the input')
      }
      // Collapse path ②: Esc with the textarea focused.
      await clickExpand('.chat-dock')
      if (!(await waitForProbe(win, EXPANDED_FORMULA('.chat-view'), 5_000))) {
        fail('ticket-49 stage: the input never re-expanded for the Esc path')
      }
      await win.webContents.executeJavaScript(composerKeyJs('Escape'))
      if (!(await waitForProbe(win, `${chatTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-49 stage: Esc never collapsed the in-session composer')
      }
      log('composer_expand_collapse_paths_ok')

      // ⌘E (ticket 57): the global chord toggles the in-session composer
      // as well — expand, then a re-press retracts (self-inverting).
      await pressCmdE()
      if (!(await waitForProbe(win, EXPANDED_FORMULA('.chat-view'), 5_000))) {
        fail('ticket-57: ⌘E never expanded the in-session composer')
      }
      if ((await js(`${chatExpand}?.getAttribute('aria-expanded')`)) !== 'true') {
        fail('ticket-57: ⌘E expanded the in-session composer without aria-expanded=true')
      }
      await pressCmdE()
      if (!(await waitForProbe(win, `${chatTa}.clientHeight === 74`, 5_000))) {
        fail('ticket-57: the second ⌘E never retracted the in-session composer')
      }
      log('composer_expand_key_chat_ok')

      // Collapse path ③: a successful send starts the next turn from the
      // resting composer. The button STAYS while the turn runs (persistent).
      // The agent_end waiter registers BEFORE the send (warm host + fast
      // model: the settled event can beat a late-registered waiter, the
      // same race the ticket-46 stage hit on glm-5.3-flash).
      const expandReplyEnd = waitFor((e) => e.type === 'agent_end' && e.sessionId === expandId, 'composer_expand reply agent_end')
      await clickExpand('.chat-dock')
      if (!(await waitForProbe(win, EXPANDED_FORMULA('.chat-view'), 5_000))) {
        fail('ticket-49 stage: the input never re-expanded for the send path')
      }
      if (!(await win.webContents.executeJavaScript(composerTypeJs('Reply with exactly: PICODE_SEND_49')).catch(() => false))) {
        fail('ticket-49 stage: composer textarea missing for the send-collapse step')
      }
      await win.webContents.executeJavaScript(composerKeyJs('Enter'))
      const sent = await waitForProbe(
        win,
        `(document.querySelector('.chat-thread')?.textContent ?? '').includes('PICODE_SEND_49') && ${chatTa}.clientHeight === 74`,
        10_000
      )
      if (!sent) {
        const diag = (await win.webContents.executeJavaScript(EXPAND_DIAG).catch(() => 'unavailable')) as string
        fail(`ticket-49 stage: the send never collapsed the expanded input; DOM: ${diag}`)
      }
      if ((await js(`${chatExpand} === null`)) === true) {
        fail('ticket-49 stage: the expand button vanished while the turn runs (must stay persistent)')
      }
      log('composer_expand_send_collapse_ok')

      // Let the reply turn settle so the stage leaves a quiet session.
      await expandReplyEnd
      await win.webContents.executeJavaScript(composerClearJs)
    })
    log('composer_expand_done')

    // ---- ticket 81: composer layout — the pi17 scene. Drives the shared
    // in-session composer with 4 pasted images + one input event per typed
    // line (the same per-event measure cycle a keystroke rides) and asserts
    // the three layout repairs end to end:
    // ① R7: at the 160px auto-grow cap the caret's line stays fully inside
    //    the scrolled viewport (the auto-grow re-measure must never snap
    //    the view back to the top), and the attachment strip never
    //    overlaps the input rect in either state (band and cap).
    // ② R8: past the cap the input carries a REAL visible scrollbar (a
    //    reserved classic gutter, not a transient overlay), its travel
    //    starts BELOW the expand button's approved footprint (ticket 58 —
    //    the button ends 32px into the card, the track is inset 34px),
    //    dragging the thumb with real mouse events scrolls the input, and
    //    the button stays hittable at its approved position.
    // ③ R10: expand/collapse glides through intermediate heights (the
    //    panes' --pane-motion-duration curve; click+sample in ONE page
    //    script — an executeJavaScript roundtrip outlives the 200ms glide),
    //    and under an emulated prefers-reduced-motion (CDP) it cuts
    //    straight to the end state.
    // No model call (geometry + typing only); the composer is left cleared.
    log('composer_layout_81_start')
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const composerInput81 = `document.querySelector('.chat-dock textarea.composer-input')`
      if (!(await waitForProbe(win, `${composerInput81} !== null && ${composerInput81}.clientHeight === 74`, 10_000))) {
        fail('ticket-81 stage: the in-session composer never settled at the 74px floor')
      }
      /** The geometry probe: caret-line visibility is arithmetic on the
       * scrolled viewport; strip overlap is a rect intersection test; the
       * gutter width tells overlay (0) from the styled classic scrollbar. */
      const SAMPLE_81 = `(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        const strip = document.querySelector('.chat-dock .composer-attachments')
        if (!(ta instanceof HTMLTextAreaElement)) return null
        const cs = getComputedStyle(ta)
        const lineHeight = parseFloat(cs.lineHeight)
        const padTop = parseFloat(cs.paddingTop)
        const r = ta.getBoundingClientRect()
        const stripR = strip instanceof HTMLElement ? strip.getBoundingClientRect() : null
        const caret = ta.selectionStart ?? ta.value.length
        const lineIndex = ta.value.slice(0, caret).split('\\n').length - 1
        const caretTop = padTop + lineIndex * lineHeight
        return JSON.stringify({
          scrollTop: ta.scrollTop, clientH: ta.clientHeight, scrollH: ta.scrollHeight, boxH: r.height,
          gutter: ta.offsetWidth - ta.clientWidth, lineIndex, caretTop,
          caretVisible: caretTop >= ta.scrollTop - 0.5 && caretTop + lineHeight <= ta.scrollTop + ta.clientHeight + 0.5,
          taTop: r.top, taRight: r.right,
          overlapStrip: stripR
            ? stripR.top < r.bottom - 0.5 && stripR.bottom > r.top + 0.5 && stripR.left < r.right - 0.5 && stripR.right > r.left + 0.5
            : false,
          attachCount: document.querySelectorAll('.chat-dock .composer-attachment').length
        })
      })()`
      const sample81 = async (): Promise<{
        scrollTop: number; clientH: number; scrollH: number; boxH: number; gutter: number
        lineIndex: number; caretTop: number; caretVisible: boolean
        taTop: number; taRight: number; overlapStrip: boolean; attachCount: number
      }> => JSON.parse(String(await js(SAMPLE_81)))

      // The pi17 scene: 4 images onto the in-session composer (the ticket-74
      // paste driver; real decodable 1×1 PNGs so the cards render).
      const pasted81 = (await js(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        for (let i = 1; i <= 4; i++) dt.items.add(new File([bytes], 'picode81-' + i + '.png', { type: 'image/png' }))
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        return true
      })()`)) as boolean
      if (!pasted81) fail('ticket-81 stage: the composer textarea is missing for the image paste')
      if (!(await waitForProbe(win, `document.querySelectorAll('.chat-dock .composer-attachment').length === 4`, 10_000))) {
        fail('ticket-81 stage: the 4 pasted images never rendered attachment cards')
      }

      /** ONE line per input event (native setter + input event). */
      const typeLine81 = async (line: string): Promise<void> => {
        await js(`(() => {
          const ta = document.querySelector('.chat-dock textarea.composer-input')
          if (!(ta instanceof HTMLTextAreaElement)) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, ta.value === '' ? ${JSON.stringify(line)} : ta.value + '\\n' + ${JSON.stringify(line)})
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`)
        await new Promise((r) => setTimeout(r, 120))
      }

      // R7 band leg: 3 lines — box follows the content, caret visible, no
      // strip overlap.
      for (const line of ['Ticket 81 line one.', 'Ticket 81 line two.', 'Ticket 81 line three.']) await typeLine81(line)
      const band81 = await sample81()
      if (!(!band81.overlapStrip && band81.caretVisible && band81.attachCount === 4)) {
        fail(`ticket-81 stage: the band state broke (overlap ${band81.overlapStrip}, caretVisible ${band81.caretVisible}, attach ${band81.attachCount})`)
      }
      log('composer_layout_81_band_ok')

      // R7 cap leg: type past the 160px pin — the operator's exact moment.
      for (let i = 4; i <= 12; i++) await typeLine81(`Ticket 81 cap line ${i} of the long draft.`)
      const cap81 = await sample81()
      if (cap81.boxH !== 160 || cap81.scrollH <= cap81.clientH) {
        fail(`ticket-81 stage: the draft never pinned the 160px cap with internal scroll (box ${cap81.boxH}, scrollH ${cap81.scrollH})`)
      }
      if (cap81.overlapStrip) fail('ticket-81 stage: the attachment strip overlaps the input at the cap')
      if (!cap81.caretVisible) {
        fail(
          `ticket-81 stage: the caret line is below the fold at the cap (scrollTop ${cap81.scrollTop}, line ${cap81.lineIndex}, caretTop ${cap81.caretTop}, clientH ${cap81.clientH})`
        )
      }
      log('composer_layout_81_cap_caret_ok')

      // R8: visible classic scrollbar + travel clear of the button + a real
      // thumb drag + the button still hittable.
      if (cap81.gutter !== 10) {
        fail(`ticket-81 stage: the scrollable input must reserve the 10px styled scrollbar gutter (gutter ${cap81.gutter})`)
      }
      const btnGeom81 = JSON.parse(String(await js(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        const btn = document.querySelector('.chat-dock .composer-expand')
        if (!(ta instanceof HTMLTextAreaElement) || !(btn instanceof HTMLElement)) return null
        return JSON.stringify({ btnBottom: btn.getBoundingClientRect().bottom, taTop: ta.getBoundingClientRect().top })
      })()`))) as { btnBottom: number; taTop: number } | null
      if (btnGeom81 === null || btnGeom81.btnBottom > btnGeom81.taTop + 35) {
        fail(`ticket-81 stage: the expand button's footprint overlaps the scrollbar travel (bottom ${String(btnGeom81?.btnBottom)}, travel top ${String(btnGeom81 === null ? null : btnGeom81.taTop + 34)})`)
      }
      const btnHit81 = (await js(`(() => {
        const btn = document.querySelector('.chat-dock .composer-expand')
        if (!(btn instanceof HTMLElement)) return 'missing'
        const r = btn.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit !== null && (hit === btn || btn.contains(hit)) ? 'button' : 'other'
      })()`)) as string
      if (btnHit81 !== 'button') fail(`ticket-81 stage: the expand button is no longer hittable (${btnHit81})`)
      // Real drag: park at the top, grab the thumb's computed center, pull.
      const dragPoint81 = JSON.parse(String(await js(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return null
        ta.scrollTop = 0
        const gutter = ta.offsetWidth - ta.clientWidth
        const trackTop = 34
        const trackH = ta.clientHeight - trackTop - 4
        const scrollRange = ta.scrollHeight - ta.clientHeight
        const thumbH = Math.max(trackH * (ta.clientHeight / ta.scrollHeight), 20)
        const thumbY = trackTop + (ta.scrollTop / Math.max(scrollRange, 1)) * (trackH - thumbH) + thumbH / 2
        const r = ta.getBoundingClientRect()
        return JSON.stringify({ x: Math.round(r.right - gutter / 2), y: Math.round(r.top + thumbY) })
      })()`))) as { x: number; y: number } | null
      if (dragPoint81 === null) fail('ticket-81 stage: the drag staging never read the thumb geometry')
      const scrollBefore81 = (await js(`${composerInput81}?.scrollTop ?? -1`)) as number
      await win.webContents.sendInputEvent({ type: 'mouseDown', x: dragPoint81.x, y: dragPoint81.y, button: 'left', clickCount: 1 })
      await new Promise((r) => setTimeout(r, 60))
      await win.webContents.sendInputEvent({ type: 'mouseMove', x: dragPoint81.x, y: dragPoint81.y + 40 })
      await new Promise((r) => setTimeout(r, 60))
      await win.webContents.sendInputEvent({ type: 'mouseUp', x: dragPoint81.x, y: dragPoint81.y + 40, button: 'left', clickCount: 1 })
      await new Promise((r) => setTimeout(r, 120))
      const scrollAfter81 = (await js(`${composerInput81}?.scrollTop ?? -1`)) as number
      if (!(scrollAfter81 > scrollBefore81 + 2)) {
        fail(`ticket-81 stage: dragging the scrollbar thumb never scrolled the input (${scrollBefore81} → ${scrollAfter81})`)
      }
      log('composer_layout_81_scrollbar_ok')

      // R10: expand glides (click + sampler in ONE page script), settles at
      // the projected half-zone height; Esc collapse glides back to the cap.
      const startH81 = cap81.boxH
      const zoneH81 = (await js(`document.querySelector('.chat-view')?.clientHeight ?? 0`)) as number
      const targetH81 = Math.round(Math.min(Math.max(zoneH81 / 2, 280), 560))
      const sampler81 = `new Promise((resolve) => {
        const samples = []
        const t0 = performance.now()
        const timer = setInterval(() => {
          const ta = document.querySelector('.chat-dock textarea.composer-input')
          samples.push(ta ? ta.clientHeight : null)
          if (performance.now() - t0 >= 450) { clearInterval(timer); resolve(JSON.stringify(samples)) }
        }, 12)
      })`
      const expandSamples81 = JSON.parse(
        String(await js(
          [
            `document.querySelector('.chat-dock .composer-expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
            sampler81
          ].join(';')
        ))
      ) as number[]
      if (expandSamples81.filter((h) => h !== null && h > startH81 && h < targetH81).length < 2) {
        fail(`ticket-81 stage: expanding never glided through intermediate heights (samples ${expandSamples81.slice(0, 8).join(',')})`)
      }
      if (
        !(await waitForProbe(
          win,
          `(() => {
            const ta = document.querySelector('.chat-dock textarea.composer-input')
            const zone = document.querySelector('.chat-view')
            return ta !== null && zone !== null && ta.clientHeight === Math.round(Math.min(Math.max(zone.clientHeight / 2, 280), 560))
          })()`,
          5_000
        ))
      ) {
        fail(`ticket-81 stage: the expansion never settled at the projected half-zone height (${targetH81})`)
      }
      const collapseSamples81 = JSON.parse(
        String(await js(
          [
            `(() => {
              const ta = document.querySelector('.chat-dock textarea.composer-input')
              if (ta instanceof HTMLTextAreaElement) {
                ta.focus()
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
              }
            })()`,
            sampler81
          ].join(';')
        ))
      ) as number[]
      if (collapseSamples81.filter((h) => h !== null && h > 160 && h < targetH81).length < 2) {
        fail(`ticket-81 stage: collapsing never glided through intermediate heights (samples ${collapseSamples81.slice(0, 8).join(',')})`)
      }
      if (!(await waitForProbe(win, `${composerInput81}.clientHeight === 160`, 5_000))) {
        fail('ticket-81 stage: the collapse never re-settled at the 160px auto-grow clamp')
      }
      log('composer_layout_81_glide_ok')

      // R10 reduced-motion: CDP-emulated prefers-reduced-motion cuts the
      // glide to the instant end state (the panes' own convention).
      try {
        const dbg = win.webContents.debugger
        await dbg.attach()
        await dbg.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        })
        await new Promise((r) => setTimeout(r, 100))
        const reducedSamples81 = JSON.parse(
          String(await js(
            [
              `document.querySelector('.chat-dock .composer-expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
              sampler81
            ].join(';')
          ))
        ) as number[]
        if (reducedSamples81.filter((h) => h !== null && h > startH81 && h < targetH81).length !== 0) {
          fail(`ticket-81 stage: prefers-reduced-motion must cut the expand straight to the end state (samples ${reducedSamples81.slice(0, 6).join(',')})`)
        }
        await dbg.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: '' }]
        })
        await dbg.detach()
      } catch (err) {
        fail(`ticket-81 stage: the reduced-motion leg could not run (CDP emulation failed: ${String(err)})`)
      }
      log('composer_layout_81_reduced_motion_ok')

      // Leave the composer clean for the later stages.
      await win.webContents.executeJavaScript(composerClearJs)
      await js(`(() => {
        document.querySelectorAll('.chat-dock .composer-attachment-remove').forEach((b) => (b instanceof HTMLElement) && b.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        return true
      })()`)
      if (!(await waitForProbe(win, `document.querySelectorAll('.chat-dock .composer-attachment').length === 0`, 5_000))) {
        fail('ticket-81 stage: the staged attachments never cleared for the later stages')
      }
    })
    log('composer_layout_81_done')

    // ---- ticket 53: turn answer split — a settled long turn shows its LAST
    // text block as the answer; earlier narration folds into the Worked
    // container (hidden collapsed, work rows when opened) and the tool that
    // ran after the answer stays visible below it, outside the fold. Runs at
    // the tail of the smoke as a settled structured replay injected through
    // the contract stream (the visual-perf precedent: no model call, and the
    // fake session is left active right before quit so no later stage can
    // observe the focus switch).
    log('answer_split_start')
    {
      const NARRATION_ONE = 'PICODE_AS_NARRATION_ONE: the root cause is confirmed'
      const NARRATION_TWO = 'PICODE_AS_NARRATION_TWO: three problems, fixed one by one'
      const ANSWER_TAIL = 'PICODE_AS_ANSWER: all four viewports pass, ready for review'
      emitContractEvent({
        type: 'session_created',
        sessionId: 'smoke-answer-split',
        cwd,
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({
        type: 'history_loaded',
        items: [
          { role: 'user', id: 'as-u1', text: 'Continue the layout fix.', timestamp: 't1', skillName: null },
          {
            role: 'assistant',
            id: 'as-a1',
            timestamp: 't2',
            text: NARRATION_ONE,
            parts: [{ kind: 'text', text: NARRATION_ONE }]
          },
          {
            role: 'tool',
            id: 'as-t1',
            timestamp: 't3',
            name: 'bash',
            args: { command: 'npm run layout:probe' },
            output: 'probe FAIL',
            isError: false
          },
          {
            role: 'assistant',
            id: 'as-a2',
            timestamp: 't4',
            text: NARRATION_TWO,
            parts: [
              { kind: 'thinking', text: 're-plan the geometry', durationMs: null },
              { kind: 'text', text: NARRATION_TWO }
            ]
          },
          {
            role: 'tool',
            id: 'as-t2',
            timestamp: 't5',
            name: 'edit',
            args: { path: 'src/shared/layout.ts' },
            output: 'Patched',
            isError: false
          },
          {
            role: 'assistant',
            id: 'as-a3',
            timestamp: 't6',
            text: ANSWER_TAIL,
            parts: [{ kind: 'text', text: ANSWER_TAIL }]
          },
          {
            role: 'tool',
            id: 'as-t3',
            timestamp: 't7',
            name: 'bash',
            args: { command: 'git status --short' },
            output: 'M src/shared/layout.ts',
            isError: false
          }
        ]
      })
      await withWindow(getWindow, async (win) => {
        const sig = `(() => ({
          turns: document.querySelectorAll('.turn-container').length,
          open: document.querySelectorAll('.turn-container-open').length,
          answerBlocks: document.querySelectorAll('.msg-assistant .md').length,
          answerText: document.querySelector('.msg-assistant .md')?.textContent ?? '',
          narration: document.querySelectorAll('.turn-narration-row').length,
          afterTools: document.querySelectorAll('.turn-after-answer .tool-card').length,
          foldedTools: document.querySelectorAll('.turn-container .tool-card').length
        }))()`
        // Settled + collapsed: exactly one answer block (the tail text), no
        // narration visible, the trailing tool below the answer, nothing in
        // the fold.
        const settled = (await waitForProbe(
          win,
          `${sig}.turns === 1 && ${sig}.open === 0 && ${sig}.answerBlocks === 1 &&
               ${sig}.narration === 0 && ${sig}.afterTools === 1 && ${sig}.foldedTools === 0 &&
               ${sig}.answerText.includes('${ANSWER_TAIL}') &&
               !${sig}.answerText.includes('${NARRATION_ONE}')`,
          10_000
        )) as boolean
        if (!settled) {
          const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
          fail(`ticket-53 stage: the settled turn did not split to the tail block; DOM: ${diag}`)
        }
        log('answer_split_settled_ok')
        // Open the fold: the narration rows surface as work rows; the answer
        // and the after-answer tool stay put.
        await openAllTurnContainers(win)
        const opened = (await waitForProbe(
          win,
          `${sig}.open === 1 && ${sig}.narration === 2 && ${sig}.answerBlocks === 1 && ${sig}.afterTools === 1`,
          10_000
        )) as boolean
        if (!opened) {
          const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
          fail(`ticket-53 stage: the opened container did not reveal the narration rows; DOM: ${diag}`)
        }
        log('answer_split_open_ok')
      })
    }
    log('answer_split_done')

    // ---- ticket 55: worked container permanence — EVERY turn with a user
    // bubble owns its container row (operator-approved ZCode deviation). A
    // zero-work turn (pure-text answer) shows the row through the WHOLE
    // lifecycle — live "Working · Ns" from the silent period on, settled
    // "Worked · Ns", replayed "Worked" (ticket 14 rule) — and an empty body
    // is NOT expandable: no chevron, click no-op, aria-disabled. Runs as a
    // structured replay + a contract-stream live turn (no model call), right
    // after the answer-split stage for the same reasons.
    log('worked_container_start')
    {
      emitContractEvent({
        type: 'session_created',
        sessionId: 'smoke-worked-container',
        cwd,
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({
        type: 'history_loaded',
        items: [
          { role: 'user', id: 'wc-u1', text: 'Say hi.', timestamp: 't1', skillName: null },
          {
            role: 'assistant',
            id: 'wc-a1',
            timestamp: 't2',
            text: 'Hello!',
            parts: [{ kind: 'text', text: 'Hello!' }]
          }
        ]
      })
      await withWindow(getWindow, async (win) => {
        const sig = `(() => ({
          turns: document.querySelectorAll('.turn-container').length,
          open: document.querySelectorAll('.turn-container-open').length,
          chevrons: document.querySelectorAll('.turn-container-chevron').length,
          durations: document.querySelectorAll('.turn-container-duration').length,
          labels: [...document.querySelectorAll('.turn-container-label')].map((el) => el.textContent ?? ''),
          inert: [...document.querySelectorAll('.turn-container-header')].map((el) => el.getAttribute('aria-disabled') === 'true'),
          users: document.querySelectorAll('.msg-user').length,
          answers: document.querySelectorAll('.msg-assistant .md').length
        }))()`
        // Replayed zero-work turn: the row exists, bare and inert — "Worked"
        // with no duration (the ticket-14 rule), no chevron, no way to open.
        const replayed = (await waitForProbe(
          win,
          `${sig}.turns === 1 && ${sig}.open === 0 && ${sig}.chevrons === 0 && ${sig}.durations === 0 &&
           ${sig}.labels.join() === 'Worked' && ${sig}.inert.join() === 'true' && ${sig}.answers === 1`,
          10_000
        )) as boolean
        if (!replayed) {
          const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
          fail(`ticket-55 stage: the replayed zero-work turn lost its container; DOM: ${diag}`)
        }
        log('worked_container_replayed_ok')

        // The inert header must not open on click (Q12 ruling A: expandable
        // ⇔ body non-empty) — click, hold a beat, re-check the closed state.
        await win.webContents.executeJavaScript(
          `(() => { const el = document.querySelector('.turn-container-header'); if (el instanceof HTMLElement) el.click(); return true })()`
        )
        await new Promise((r) => setTimeout(r, 400))
        const stillClosed = (await win.webContents
          .executeJavaScript(`${sig}.open === 0 && ${sig}.turns === 1`)
          .catch(() => false)) as boolean
        if (!stillClosed) fail('ticket-55 stage: the empty container opened on click (must stay inert)')
        log('worked_container_inert_ok')

        // Live zero-work turn: the container shows up in the SILENT PERIOD —
        // before any part streams (the live half of pi15-empty-worked-container).
        emitContractEvent({ type: 'user_message', text: 'PICODE_WC_LIVE_MARKER' })
        emitContractEvent({ type: 'agent_start' })
        const silent = (await waitForProbe(
          win,
          `${sig}.turns === 2 && ${sig}.users === 2 && ${sig}.labels.join() === 'Worked,Working' &&
           ${sig}.open === 0 && ${sig}.chevrons === 0 && ${sig}.inert.join() === 'true,true'`,
          10_000
        )) as boolean
        if (!silent) {
          const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
          fail(`ticket-55 stage: the silent period lost its Working container; DOM: ${diag}`)
        }
        log('worked_container_live_silent_ok')

        // Stream the pure-text answer, hold past the 1s tick so the container
        // timer earns its duration, then settle: the row must PERSIST — the
        // exact disappearance the pi15-empty-worked-container frame captured.
        emitContractEvent({ type: 'message_start' })
        emitContractEvent({ type: 'text_delta', delta: 'Hello live!' })
        emitContractEvent({ type: 'message_end' })
        await new Promise((r) => setTimeout(r, 1200))
        emitContractEvent({ type: 'agent_end' })
        const settled = (await waitForProbe(
          win,
          `${sig}.turns === 2 && ${sig}.labels.join() === 'Worked,Worked' && ${sig}.durations === 1 &&
           ${sig}.open === 0 && ${sig}.chevrons === 0 && ${sig}.answers === 2 && ${sig}.inert.join() === 'true,true'`,
          10_000
        )) as boolean
        if (!settled) {
          const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
          fail(`ticket-55 stage: the settled zero-work turn did not keep its Worked row; DOM: ${diag}`)
        }
        log('worked_container_settled_ok')

        // Container-level timer across a fold/reopen (acceptance: 折叠重开
        // Working·Ns 连续不归零 — the container body unmounts, the container
        // itself never does, so the header count must keep running). A THIRD,
        // WITH-WORK live turn makes the row expandable; fold it mid-run,
        // reopen it, and the ticked seconds must have ADVANCED, not reset.
        emitContractEvent({ type: 'user_message', text: 'PICODE_WC_FOLD_MARKER' })
        emitContractEvent({ type: 'agent_start' })
        emitContractEvent({ type: 'message_start' })
        emitContractEvent({ type: 'thinking_delta', delta: 'plan the work' })
        const liveWorked = (await waitForProbe(
          win,
          `${sig}.turns === 3 && ${sig}.users === 3 && ${sig}.open === 1 && ${sig}.chevrons === 1 &&
           ${sig}.labels.join() === 'Worked,Worked,Working' && ${sig}.inert.join() === 'true,true,false'`,
          10_000
        )) as boolean
        if (!liveWorked) {
          const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
          fail(`ticket-55 stage: the with-work live turn did not render an expandable container; DOM: ${diag}`)
        }
        await new Promise((r) => setTimeout(r, 1200))
        const beforeFold = (await win.webContents
          .executeJavaScript(`parseInt(document.querySelectorAll('.turn-container-duration')[1]?.textContent ?? '0', 10)`)
          .catch(() => 0)) as number
        if (beforeFold < 1) fail(`ticket-55 stage: the live container timer never ticked (saw ${beforeFold}s)`)
        // Fold the live turn (manual mid-stream collapse — the reducer path).
        await win.webContents.executeJavaScript(
          `(() => { const hs = document.querySelectorAll('.turn-container-header'); const el = hs[2]; if (el instanceof HTMLElement) el.click(); return true })()`
        )
        const folded = (await waitForProbe(win, `${sig}.open === 0 && ${sig}.turns === 3`, 10_000)) as boolean
        if (!folded) fail('ticket-55 stage: the with-work live turn did not fold on click')
        await new Promise((r) => setTimeout(r, 1200))
        await win.webContents.executeJavaScript(
          `(() => { const hs = document.querySelectorAll('.turn-container-header'); const el = hs[2]; if (el instanceof HTMLElement) el.click(); return true })()`
        )
        const reopened = (await waitForProbe(win, `${sig}.open === 1 && ${sig}.turns === 3`, 10_000)) as boolean
        if (!reopened) fail('ticket-55 stage: the folded live turn did not reopen on click')
        const afterReopen = (await win.webContents
          .executeJavaScript(`parseInt(document.querySelectorAll('.turn-container-duration')[1]?.textContent ?? '0', 10)`)
          .catch(() => 0)) as number
        // ≥ beforeFold + 1: the count kept running across the fold. A reset
        // (container remounted on fold) would land at 0–1s — far below.
        if (afterReopen < beforeFold + 1) {
          fail(`ticket-55 stage: the container timer reset across fold/reopen (${beforeFold}s → ${afterReopen}s)`)
        }
        log('worked_container_timer_fold_ok', `${beforeFold}s → ${afterReopen}s`)
        // Settle the third turn so the stage leaves a quiet session.
        emitContractEvent({ type: 'thinking_end', durationMs: 1500 })
        emitContractEvent({ type: 'message_end' })
        emitContractEvent({ type: 'agent_end' })
      })
    }
    log('worked_container_done')

    // ---- ticket 56 + ticket 82: turn chronology. A scripted LIVE turn
    // streams past the approval gate (the bg-approval precedent for the gate
    // shape, the ticket-53/55 stages for the contract-stream injection — no
    // model call). Ticket 82 revised the live shape: the turn streams as a
    // PURE CHRONOLOGICAL SINGLE STREAM inside the expanded container — text
    // blocks inline between the tool rows, no promoted answer below, no
    // after-answer segment while live, no demotion re-split; the pending
    // pill parks INLINE in the stream at the exact slot its tool card will
    // occupy, and the approved decision converts the pill IN PLACE (two
    // states, one slot, zero jump — pi15-approval-above-answer, fixed; the
    // post-answer thinking renders inline below the tool —
    // pi15-post-answer-thinking-misplaced, fixed). At settle the
    // ticket-53/56 composition appears in one move: the answer below the
    // collapsed container, the tool + thinking in the segment below it
    // (常显段) — live 与落定同构 through the shared projection. ----
    log('turn_chronology_start')
    {
      const ANSWER = 'PICODE_TC_ANSWER: the deploy plan is ready'
      emitContractEvent({
        type: 'session_created',
        sessionId: 'smoke-turn-chronology',
        cwd,
        model: 'claude-opus-4-5',
        resumed: true
      })
      await withWindow(getWindow, async (win) => {
        const sig = `(() => ({
          open: document.querySelectorAll('.turn-container-open').length,
          answers: document.querySelectorAll('.msg-assistant .md').length,
          answerText: document.querySelector('.msg-assistant .md')?.textContent ?? '',
          answerAll: [...document.querySelectorAll('.msg-assistant .md')].map((el) => el.textContent ?? '').join('|'),
          streamTexts: document.querySelectorAll('.turn-container .turn-stream-text .md').length,
          streamText: document.querySelector('.turn-container .turn-stream-text .md')?.textContent ?? '',
          streamAll: [...document.querySelectorAll('.turn-container .turn-stream-text .md')].map((el) => el.textContent ?? '').join('|'),
          segPills: document.querySelectorAll('.turn-after-answer .approval-pill-pending').length,
          segApproved: document.querySelectorAll('.turn-after-answer .approval-pill-approved').length,
          foldPills: document.querySelectorAll('.turn-container .approval-pill-pending').length,
          segTools: document.querySelectorAll('.turn-after-answer .tool-card').length,
          foldTools: document.querySelectorAll('.turn-container .tool-card').length,
          segThinking: document.querySelectorAll('.turn-after-answer .thinking-row').length,
          segThinkingOpen: document.querySelectorAll('.turn-after-answer .thinking-row-open').length,
          foldThinking: document.querySelectorAll('.turn-container .thinking-row').length,
          foldNarration: document.querySelectorAll('.turn-container .turn-narration-row').length,
          turns: document.querySelectorAll('.turn-container').length
        }))()`
        const diag = async (): Promise<string> =>
          (await win.webContents.executeJavaScript(`JSON.stringify(${sig})`).catch(() => 'unavailable')) as string

        // Live turn: the answer text streams FIRST — inline inside the
        // container's chronological stream — then the gate asks.
        emitContractEvent({ type: 'user_message', text: 'PICODE_TC_PROMPT: deploy the service' })
        emitContractEvent({ type: 'agent_start' })
        emitContractEvent({ type: 'message_start' })
        emitContractEvent({ type: 'text_delta', delta: ANSWER })
        emitContractEvent({ type: 'message_end' })
        emitContractEvent({ type: 'approval_required', toolCallId: 'tc-gate-1', toolName: 'bash', args: { command: 'deploy' } })

        // ① Pure chronological single stream: the text is INLINE inside the
        // open container (no promoted answer below it), and the pending pill
        // parks in the stream at its tool's future slot — never in any
        // below-answer segment (ticket 82 revises the ticket-56 live shape).
        const streamInline = (await waitForProbe(
          win,
          `${sig}.open === 1 && ${sig}.answers === 0 && ${sig}.streamTexts === 1 &&
           ${sig}.streamText.includes('${ANSWER}') && ${sig}.foldPills === 1 &&
           ${sig}.segPills === 0 && ${sig}.segTools === 0 && ${sig}.segThinking === 0 &&
           ${sig}.foldTools === 0 && ${sig}.foldThinking === 0`,
          10_000
        )) as boolean
        if (!streamInline) fail(`ticket-82 stage: the live turn is not a pure chronological single stream; DOM: ${await diag()}`)
        log('turn_chronology_live_inline_ok')

        // Record a stream row's slot: parent container, child index,
        // geometry. null when the row is absent (a missing slot is a stage
        // failure, so every reader checks before destructure). While live the
        // rows sit in the container body (ticket 82); after settling the
        // segment rows sit in .turn-after-answer — the container parameter
        // selects the parent at read time.
        const readSlot = async (selector: string, container: string): Promise<{ top: number; left: number; index: number } | null> => {
          const raw = (await win.webContents.executeJavaScript(
            `(() => {
              const el = document.querySelector('${selector}')
              if (!(el instanceof Element)) return null
              const seg = el.closest('${container}')
              const r = el.getBoundingClientRect()
              return JSON.stringify({ top: r.top, left: r.left, index: seg ? Array.prototype.indexOf.call(seg.children, el) : -1 })
            })()`
          ).catch(() => null)) as string | null
          if (raw === null || raw === 'null') return null
          try {
            return JSON.parse(raw) as { top: number; left: number; index: number }
          } catch {
            return null
          }
        }
        const pillSlot = await readSlot('.turn-container .approval-pill-pending', '.turn-container-body')
        if (pillSlot === null) fail('ticket-82 stage: the pending pill vanished before its slot was read')

        // ② Two states, one slot: replay the host's post-approve sequence
        // (approval_resolved → tool_start → tool_end; the reducer converts
        // the pill at the SAME entry index). The approved mini-pill and the
        // finished tool card must occupy the pill's exact slot IN THE STREAM.
        emitContractEvent({ type: 'approval_resolved', toolCallId: 'tc-gate-1', approved: true, reason: null })
        const approvedInPlace = (await waitForProbe(
          win,
          `${sig}.foldPills === 0 && ${sig}.segApproved === 0 && ${sig}.segPills === 0 && ${sig}.foldTools === 0`,
          10_000
        )) as boolean
        if (!approvedInPlace) fail(`ticket-82 stage: the approved mini-pill left the stream; DOM: ${await diag()}`)
        emitContractEvent({ type: 'tool_start', toolCallId: 'tc-gate-1', name: 'bash', args: { command: 'deploy' } })
        emitContractEvent({ type: 'tool_end', toolCallId: 'tc-gate-1', output: 'deployed', isError: false })
        const toolInPlace = (await waitForProbe(
          win,
          `${sig}.foldTools === 1 && ${sig}.segTools === 0 && ${sig}.foldPills === 0 && ${sig}.segApproved === 0`,
          10_000
        )) as boolean
        if (!toolInPlace) fail(`ticket-82 stage: the tool card never took the pill's stream slot; DOM: ${await diag()}`)
        const toolSlot = await readSlot('.turn-container .tool-card', '.turn-container-body')
        // Zero jump: same container child index, same geometry (±2px — the
        // live header's ticking digits must not move the slot).
        if (toolSlot === null || toolSlot.index !== pillSlot.index || Math.abs(toolSlot.top - pillSlot.top) > 2 || Math.abs(toolSlot.left - pillSlot.left) > 2) {
          fail(
            `ticket-82 stage: approval two-state jump — pill top ${pillSlot.top}/idx ${pillSlot.index} vs tool top ${String(toolSlot?.top ?? 'missing')}/idx ${String(toolSlot?.index ?? 'missing')}`
          )
        }
        log('turn_chronology_two_states_one_slot_ok', `top ${pillSlot.top} → ${toolSlot.top}`)

        // ③ Thinking that streams after the tool result renders INLINE below
        // the tool, inside the stream — never promoted above anything
        // (pi15-post-answer-thinking-misplaced stays fixed, now in-stream).
        // Collapsed single line, expandable to the full text.
        emitContractEvent({ type: 'message_start' })
        emitContractEvent({ type: 'thinking_delta', delta: 'PICODE_TC_THINKING: health check passed, wrap up' })
        emitContractEvent({ type: 'thinking_end', durationMs: 4800 })
        emitContractEvent({ type: 'message_end' })
        const thinkingBelow = (await waitForProbe(
          win,
          `${sig}.foldThinking === 1 && ${sig}.segThinking === 0 && ${sig}.segThinkingOpen === 0 && ${sig}.foldTools === 1`,
          10_000
        )) as boolean
        if (!thinkingBelow) fail(`ticket-82 stage: the post-tool thinking never rendered inline below the tool; DOM: ${await diag()}`)
        const thinkingSlot = await readSlot('.turn-container .thinking-row', '.turn-container-body')
        if (thinkingSlot === null || thinkingSlot.index !== 2) {
          fail(`ticket-82 stage: the thinking row must trail the tool in the stream (idx ${String(thinkingSlot?.index ?? 'missing')})`)
        }
        // Expand the collapsed thinking row — the full reasoning text shows.
        await win.webContents.executeJavaScript(
          `(() => { const el = document.querySelector('.turn-container .thinking-row-header'); if (el instanceof HTMLElement) el.click(); return true })()`
        )
        const expanded = (await waitForProbe(
          win,
          `document.querySelector('.turn-container .thinking-row-body')?.textContent.includes('PICODE_TC_THINKING')`,
          10_000
        )) as boolean
        if (!expanded) fail('ticket-82 stage: the stream thinking row never expanded to its full text')
        log('turn_chronology_live_thinking_inline_ok')

        // ④ Settle: the ticket-53/56 composition appears in one move — the
        // text lifts below the folded container as the answer, the tool and
        // thinking join the after-answer segment (常显段) in stream order:
        // tool leading, thinking trailing, nothing left inside the fold.
        emitContractEvent({ type: 'agent_end' })
        const settled = (await waitForProbe(
          win,
          `${sig}.answers === 1 && ${sig}.answerText.includes('${ANSWER}') && ${sig}.streamTexts === 0 &&
           ${sig}.open === 0 && ${sig}.segTools === 1 && ${sig}.segThinking === 1 &&
           ${sig}.foldTools === 0 && ${sig}.foldThinking === 0 && ${sig}.segPills === 0`,
          10_000
        )) as boolean
        if (!settled) fail(`ticket-82 stage: settling did not produce the answer + segment composition; DOM: ${await diag()}`)
        const settledToolSlot = await readSlot('.turn-after-answer .tool-card', '.turn-after-answer')
        const settledThinkingSlot = await readSlot('.turn-after-answer .thinking-row', '.turn-after-answer')
        if (settledToolSlot === null || settledToolSlot.index !== 0 || settledThinkingSlot === null || settledThinkingSlot.index !== 1) {
          fail(
            `ticket-82 stage: the settled segment lost its order — tool idx ${String(settledToolSlot?.index ?? 'missing')}, thinking idx ${String(settledThinkingSlot?.index ?? 'missing')}`
          )
        }
        log('turn_chronology_settled_same_position_ok')

        // ⑤ Append-only, no rotation on a NEW text block (the pi17 operator
        // complaint, scripted): a second LIVE turn streams text → tool →
        // text. The first text keeps its inline slot, the tool keeps the
        // slot it happened in, the new tail appends — nothing is promoted,
        // nothing demotes, no graying carousel. (Turn 1's settled segment
        // from ①–④ persists below its answer — segTools/segThinking === 1 —
        // which doubles as the live-no-segment contrast.) Settling lifts the
        // LAST text below the fold as the answer; opening the fold shows the
        // time order preserved inside it: first text as narration, tool
        // before it.
        const FIRST = 'PICODE_TC_FIRST: mid-turn status update'
        const SECOND = 'PICODE_TC_SECOND: the iteration concludes here'
        emitContractEvent({ type: 'user_message', text: 'PICODE_TC_PROMPT_2: iterate once more' })
        emitContractEvent({ type: 'agent_start' })
        emitContractEvent({ type: 'message_start' })
        emitContractEvent({ type: 'text_delta', delta: FIRST })
        emitContractEvent({ type: 'message_end' })
        emitContractEvent({ type: 'tool_start', toolCallId: 'tc-mid', name: 'bash', args: { command: 'verify' } })
        emitContractEvent({ type: 'tool_end', toolCallId: 'tc-mid', output: 'ok', isError: false })
        emitContractEvent({ type: 'message_start' })
        emitContractEvent({ type: 'text_delta', delta: SECOND })
        const noRotation = (await waitForProbe(
          win,
          `${sig}.turns === 2 && ${sig}.open === 1 && ${sig}.answers === 1 && ${sig}.streamTexts === 2 &&
           ${sig}.streamAll.indexOf('${FIRST}') >= 0 && ${sig}.streamAll.indexOf('${SECOND}') > ${sig}.streamAll.indexOf('${FIRST}') &&
           ${sig}.foldTools === 1 && ${sig}.segTools === 1 && ${sig}.segThinking === 1`,
          10_000
        )) as boolean
        if (!noRotation) fail(`ticket-82 stage: the second text block rotated the stream; DOM: ${await diag()}`)
        const midToolSlot = await readSlot('.turn-container .tool-card', '.turn-container-body')
        if (midToolSlot === null || midToolSlot.index !== 1) {
          fail(`ticket-82 stage: the tool must sit between the two inline texts (idx ${String(midToolSlot?.index ?? 'missing')})`)
        }
        log('turn_chronology_no_rotation_ok')

        // Settle the second turn: the LAST text lifts below the fold as the
        // answer, the first text folds back in as narration, the tool stays
        // inside the fold — the settled shape the ticket-53 stage asserts for
        // replays, now produced by a live settle.
        emitContractEvent({ type: 'agent_end' })
        const settledSplit = (await waitForProbe(
          win,
          `${sig}.turns === 2 && ${sig}.open === 0 && ${sig}.answers === 2 &&
           ${sig}.answerAll.indexOf('${SECOND}') > ${sig}.answerAll.indexOf('PICODE_TC_ANSWER') &&
           !${sig}.answerAll.includes('${FIRST}') && ${sig}.streamTexts === 0 && ${sig}.foldTools === 0`,
          10_000
        )) as boolean
        if (!settledSplit) fail(`ticket-82 stage: the settled split lost the second turn's shape; DOM: ${await diag()}`)
        // Open the second turn's fold: the first text reads as narration, the
        // tool before it — chronological inside the fold too.
        await win.webContents.executeJavaScript(
          `(() => { const hs = document.querySelectorAll('.turn-container-header'); const el = hs[1]; if (el instanceof HTMLElement) el.click(); return true })()`
        )
        const foldOrder = (await waitForProbe(
          win,
          `${sig}.open === 1 && ${sig}.foldNarration === 1 && ${sig}.foldTools === 1 &&
           document.querySelectorAll('.turn-container')[1]?.querySelector('.turn-narration-row')?.textContent.includes('${FIRST}')`,
          10_000
        )) as boolean
        if (!foldOrder) fail(`ticket-82 stage: the settled fold did not preserve the stream order; DOM: ${await diag()}`)
        log('turn_chronology_settled_fold_order_ok')
      })
    }
    log('turn_chronology_done')

    // ---- ticket 78: the turn file bar — a settled structured replay
    // (the ticket-53 precedent, no model call) seeds one session with a
    // mixed turn (fold-internal edit + post-answer edit + read + write), a
    // clean turn (read + text only) and a plain text turn. The bar renders
    // collapsed on the mixed turn ONLY (无更改回合不出条), expands to per-file
    // rows (+new for the write, ± from the replayed diff text), Review opens
    // the side panel's turn-diff tab with the diff lines, and Open deep-links
    // the existing Preview tab. No undo control exists anywhere (1.1). ----
    log('turn_filebar_start')
    {
      const FB_DIFF_A = ['      ...', '  3   const a = 1;', '- 4   const b = 2;', '+ 4   const b = 20;', '  5   export { a, b }'].join('\n')
      const FB_DIFF_B = '+ 9   const c = 3'
      const FB_ANSWER = 'PICODE_FB_ANSWER: files updated, all checks pass'
      const FB_CLEAN_ANSWER = 'PICODE_FB_CLEAN_ANSWER: nothing needed changing here'
      // Real files so the Open deep link lands on readable previews.
      const fbDir = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-filebar-'))
      writeFileSync(path.join(fbDir, 'turnbar_alpha.ts'), 'const a = 1;\nconst b = 2;\nexport { a, b }\n')
      try {
        emitContractEvent({
          type: 'session_created',
          sessionId: 'smoke-turn-filebar',
          cwd: fbDir,
          model: 'claude-opus-4-5',
          resumed: true
        })
        emitContractEvent({
          type: 'history_loaded',
          items: [
            { role: 'user', id: 'fb-u1', text: 'Update the constants.', timestamp: 't1', skillName: null },
            {
              role: 'tool',
              id: 'fb-t1',
              timestamp: 't2',
              name: 'edit',
              args: { path: 'turnbar_alpha.ts' },
              output: 'Successfully replaced 1 block(s) in turnbar_alpha.ts.',
              isError: false,
              diff: FB_DIFF_A
            },
            {
              role: 'assistant',
              id: 'fb-a1',
              timestamp: 't3',
              text: FB_ANSWER,
              parts: [{ kind: 'text', text: FB_ANSWER }]
            },
            {
              role: 'tool',
              id: 'fb-t2',
              timestamp: 't4',
              name: 'edit',
              args: { path: 'turnbar_alpha.ts' },
              output: 'Successfully replaced 1 block(s) in turnbar_alpha.ts.',
              isError: false,
              diff: FB_DIFF_B
            },
            {
              role: 'tool',
              id: 'fb-t3',
              timestamp: 't5',
              name: 'read',
              args: { path: 'turnbar_alpha.ts' },
              output: 'const a = 1...',
              isError: false
            },
            {
              role: 'tool',
              id: 'fb-t4',
              timestamp: 't6',
              name: 'write',
              args: { path: 'turnbar_beta.md' },
              output: 'Successfully wrote to turnbar_beta.md',
              isError: false
            },
            { role: 'user', id: 'fb-u2', text: 'Now check the other file.', timestamp: 't7', skillName: null },
            {
              role: 'tool',
              id: 'fb-t5',
              timestamp: 't8',
              name: 'read',
              args: { path: 'turnbar_beta.md' },
              output: '# beta',
              isError: false
            },
            {
              role: 'assistant',
              id: 'fb-a2',
              timestamp: 't9',
              text: FB_CLEAN_ANSWER,
              parts: [{ kind: 'text', text: FB_CLEAN_ANSWER }]
            }
          ]
        })
        await withWindow(getWindow, async (win) => {
          const sig = `(() => ({
            bars: document.querySelectorAll('.turn-filebar').length,
            summaries: [...document.querySelectorAll('.turn-filebar-summary')].map((el) => el.textContent ?? ''),
            adds: [...document.querySelectorAll('.turn-filebar-header .file-stat-add')].map((el) => el.textContent ?? ''),
            dels: [...document.querySelectorAll('.turn-filebar-header .file-stat-del')].map((el) => el.textContent ?? ''),
            expanded: document.querySelectorAll('.turn-filebar[data-expanded]').length,
            fileRows: document.querySelectorAll('.turn-filebar-file').length,
            fileNames: [...document.querySelectorAll('.turn-filebar-file-name')].map((el) => el.textContent ?? ''),
            newStats: [...document.querySelectorAll('.turn-filebar-file .file-stat-new')].map((el) => el.textContent ?? ''),
            reviewBtns: document.querySelectorAll('.turn-filebar-act').length,
            openChips: document.querySelectorAll('.turn-filebar-open').length,
            undoBtns: document.querySelectorAll('.turn-filebar [aria-label*="ndo"], .turn-filebar-undo').length
          }))()`

          // ① Collapsed bar on the mixed turn ONLY; the clean turn shows none.
          const collapsed = (await waitForProbe(
            win,
            `${sig}.bars === 1 && ${sig}.expanded === 0 && ${sig}.fileRows === 0 &&
             ${sig}.summaries.join() === '2 files changed' && ${sig}.adds.join() === '+2' && ${sig}.dels.join() === '−1' &&
             ${sig}.undoBtns === 0 &&
             document.body.textContent.includes('${FB_CLEAN_ANSWER}')`,
            10_000
          )) as boolean
          if (!collapsed) {
            const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
            fail(`ticket-78 stage: the collapsed bar never rendered as 2 files changed +2 −1; DOM: ${diag}`)
          }
          log('turn_filebar_collapsed_ok')

          // ② Expand: per-file rows — merged edit row (2 calls), the write
          // as +new, Review + Open affordances, read nowhere.
          await win.webContents.executeJavaScript(
            `(() => { const el = document.querySelector('.turn-filebar-header'); if (el instanceof HTMLElement) el.click(); return true })()`
          )
          const expanded = (await waitForProbe(
            win,
            `${sig}.expanded === 1 && ${sig}.fileRows === 2 && ${sig}.reviewBtns === 2 && ${sig}.openChips === 2 &&
             ${sig}.fileNames.join() === 'turnbar_alpha.ts,turnbar_beta.md' && ${sig}.newStats.join() === '+new'`,
            10_000
          )) as boolean
          if (!expanded) {
            const diag = (await win.webContents.executeJavaScript(sig).catch(() => 'unavailable')) as string
            fail(`ticket-78 stage: the expanded bar never showed 2 file rows with Review/Open; DOM: ${diag}`)
          }
          log('turn_filebar_expanded_ok')

          // ③ Review: the side panel opens a turn-diff tab rendering the
          // turn's diff text in the diff renderer's language (NOT git).
          await win.webContents.executeJavaScript(
            `(() => { const el = document.querySelector('.turn-filebar-act'); if (el instanceof HTMLElement) el.click(); return true })()`
          )
          const reviewOpened = (await waitForProbe(
            win,
            `document.querySelectorAll('[data-panel-tab*="turn-diff"]').length === 1 &&
             document.querySelectorAll('.panel-tab-body:not(.panel-tab-body-hidden) .turn-diff-view').length === 1 &&
             document.querySelectorAll('.turn-diff-file').length === 2 &&
             document.querySelectorAll('.turn-diff-file .diff-line.diff-add').length >= 2 &&
             document.querySelectorAll('.turn-diff-file .diff-line.diff-del').length >= 1 &&
             document.body.textContent.includes('New file — the session records no content for writes.')`,
            10_000
          )) as boolean
          if (!reviewOpened) {
            const diag = (await win.webContents.executeJavaScript(
              `JSON.stringify({
                tabs: [...document.querySelectorAll('[data-panel-tab]')].map((el) => el.getAttribute('data-panel-tab')),
                bodies: document.querySelectorAll('.turn-diff-view').length,
                files: document.querySelectorAll('.turn-diff-file').length
              })`
            ).catch(() => 'unavailable')) as string
            fail(`ticket-78 stage: the turn-diff tab never opened with the turn's diffs; DOM: ${diag}`)
          }
          log('turn_filebar_review_tab_ok')

          // ④ Open: the existing preview deep link — a file tab for the
          // edited file opens alongside the turn-diff tab.
          await win.webContents.executeJavaScript(
            `(() => { const el = document.querySelector('.turn-filebar-file .turn-filebar-open'); if (el instanceof HTMLElement) el.click(); return true })()`
          )
          const openLinked = (await waitForProbe(
            win,
            `[...document.querySelectorAll('[data-panel-tab]')].some((el) => (el.getAttribute('data-panel-tab') ?? '').includes('turnbar_alpha.ts'))`,
            10_000
          )) as boolean
          if (!openLinked) fail('ticket-78 stage: the Open chip never deep-linked the preview tab')
          log('turn_filebar_open_deeplink_ok')
        })
      } finally {
        rmSync(fbDir, { recursive: true, force: true })
      }
    }
    log('turn_filebar_done')

    // ---- ticket 51: live-path fork — real entry ids + toast ack regime.
    // A brand-new session (never resumed) takes two real turns; forking the
    // settled answer must land (the anchor is now the REAL session entry id
    // backfilled at persistence), produce exactly ONE success toast (the ack
    // fired by the forked session's announcement — no optimistic toast, no
    // error companion), inject zero junk user turns into the parent, and
    // leave mid-run clicks a silent no-op. ----
    log('fork_live_start')
    const forkProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-fork51-'))
    try {
      supervisor.createSession(forkProject)
      const parentCreated = (await waitFor(
        (e) => e.type === 'session_created' && e.cwd === forkProject,
        'ticket-51 parent session_created'
      )) as Extract<Scoped, { type: 'session_created' }>
      const parentSessionId = parentCreated.sessionId
      log('fork_live_parent_created', `session=${parentSessionId.slice(-6)}`)

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        const toastCount = (needle: string): string =>
          `[...document.querySelectorAll('.toast-message')].filter((n) => (n.textContent ?? '').includes(${JSON.stringify(needle)})).length`
        const clickForkJs = `(() => {
          const btns = [...document.querySelectorAll('.msg-action-btn')].filter((b) => b.textContent?.includes('Fork'))
          if (btns.length === 0) return false
          btns[btns.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return btns.length
        })()`

        // Two real turns through the composer (the live path the fix is for).
        // Waiters arm BEFORE the send — events match on arrival only, and a
        // fast model can finish a short reply inside any later sleep.
        for (const marker of ['PICODE_FORK_LIVE_ONE', 'PICODE_FORK_LIVE_TWO']) {
          await js(composerClearJs)
          const settled = waitFor(
            (e) => e.type === 'agent_end' && e.sessionId === parentSessionId,
            `ticket-51 turn ${marker} agent_end`
          )
          if (!(await js(composerTypeJs(`Reply with exactly: ${marker}`)).catch(() => false))) {
            fail('ticket-51 stage: the composer textarea is missing')
          }
          await js(composerKeyJs('Enter'))
          await settled
        }
        log('fork_live_two_turns_ok')

        // MID-RUN: start a third turn and click the most recent settled
        // answer's Fork while it runs. Q5: a silent no-op — no command, no
        // toast, no fork. (Settled turns keep their actions rows; the live
        // turn offers none.)
        await js(composerClearJs)
        const turnThreeStart = waitFor(
          (e) => e.type === 'agent_start' && e.sessionId === parentSessionId,
          'ticket-51 turn three agent_start'
        )
        const turnThreeEnd = waitFor(
          (e) => e.type === 'agent_end' && e.sessionId === parentSessionId,
          'ticket-51 turn three agent_end'
        )
        await js(composerTypeJs('Reply with exactly: PICODE_FORK_LIVE_THREE'))
        await js(composerKeyJs('Enter'))
        await turnThreeStart
        let silentForkAnnouncements = 0
        const onSilentAnnouncement = (e: Scoped): void => {
          if (e.type === 'session_created') silentForkAnnouncements++
        }
        observers.push(onSilentAnnouncement)
        if (!((await js(clickForkJs)) as boolean)) fail('ticket-51 stage: the settled answer\'s Fork button never rendered')
        await new Promise((r) => setTimeout(r, 2_500))
        observers.splice(observers.indexOf(onSilentAnnouncement), 1)
        if (silentForkAnnouncements > 0) fail('ticket-51 stage: a mid-run Fork click restructured the session')
        const silentToasts = (await js(`document.querySelectorAll('.toast-message').length`)) as number
        if (silentToasts !== 0) {
          fail('ticket-51 stage: the mid-run Fork click raised a toast (must stay silent)')
        }
        log('fork_live_midrun_silent_ok')
        // Let the third turn settle; the stage leaves a quiet session.
        await turnThreeEnd
        await js(composerClearJs)

        // THE FORK: click the last settled answer's Fork. The parent must
        // see ZERO user_message from here on (no junk turns), and the
        // success toast may only appear when the forked session announces.
        let parentUserMessages = 0
        const onParentUserMessage = (e: Scoped): void => {
          if (e.type === 'user_message' && e.sessionId === parentSessionId) parentUserMessages++
        }
        observers.push(onParentUserMessage)
        if (!((await js(clickForkJs)) as boolean)) fail('ticket-51 stage: the last answer\'s Fork button never rendered')

        const childCreated = (await waitFor(
          (e) => e.type === 'session_created' && e.sessionId !== parentSessionId && e.cwd === forkProject,
          'ticket-51 forked session_created'
        )) as Extract<Scoped, { type: 'session_created' }>
        const childSessionId = childCreated.sessionId
        if (typeof childCreated.sessionFile !== 'string') fail('ticket-51 stage: the forked announcement carries no session file')
        const childFile = childCreated.sessionFile
        await waitFor((e) => e.type === 'history_loaded' && e.sessionId === childSessionId, 'ticket-51 forked history_loaded')

        // Exactly ONE success toast — the ack. No error companion.
        let successToasts = 0
        for (let waited = 0; waited < 5_000; waited += 100) {
          successToasts = (await js(toastCount('Forked to a new session.')).catch(() => 0)) as number
          if (successToasts > 0) break
          await new Promise((r) => setTimeout(r, 100))
        }
        if (successToasts !== 1) fail(`ticket-51 stage: expected exactly 1 success toast, saw ${successToasts}`)
        if (((await js(`document.querySelectorAll('.toast-error').length`)) as number) > 0) {
          fail('ticket-51 stage: a successful fork raised an error toast beside it (double toast)')
        }
        log('fork_live_ack_toast_ok')

        // Zero junk turns in the parent across the whole fork window.
        await new Promise((r) => setTimeout(r, 2_500))
        observers.splice(observers.indexOf(onParentUserMessage), 1)
        if (parentUserMessages > 0) fail(`ticket-51 stage: the fork leaked ${parentUserMessages} user_message(s) into the parent`)

        // parentSession fidelity: the child file's header names the parent,
        // the transcript cloned up to the fork point, and the child's tail
        // entry IS the anchored (real-id) assistant entry.
        if (!existsSync(childFile)) fail('ticket-51 stage: the forked session file never landed')
        const childLines = readFileSync(childFile, 'utf-8').trim().split('\n')
        const childHeader = JSON.parse(childLines[0]) as { type?: string; parentSession?: string }
        if (childHeader.type !== 'session' || typeof childHeader.parentSession !== 'string') {
          fail('ticket-51 stage: the forked session header does not name its parent session')
        }
        if (!existsSync(childHeader.parentSession)) fail('ticket-51 stage: the named parent session file is missing')
        const childAnchor = childLines
          .map((line) => JSON.parse(line) as { type?: string; id?: string; message?: { role?: string; content?: unknown } })
          .filter((e) => e.type === 'message' && e.message?.role === 'assistant')
          .at(-1)
        const parentLines = readFileSync(childHeader.parentSession, 'utf-8').trim().split('\n')
        const parentAnchor = parentLines
          .map((line) => JSON.parse(line) as { type?: string; id?: string; message?: { role?: string; content?: unknown } })
          .filter((e) => e.type === 'message' && e.message?.role === 'assistant')
          .at(-1)
        if (!childAnchor || !parentAnchor || childAnchor.id !== parentAnchor.id) {
          fail('ticket-51 stage: the fork did not anchor at the parent\'s last assistant entry (real id mismatch)')
        }
        log('fork_live_parent_session_ok')

        // The view switched: the forked session is focused in the sidebar.
        let focusedRow = false
        for (let waited = 0; waited < 5_000; waited += 100) {
          focusedRow = (await js(
            `document.querySelector('[data-file=${JSON.stringify(childFile)}]')?.classList.contains('sb-task-active') ?? false`
          ).catch(() => false)) as boolean
          if (focusedRow) break
          await new Promise((r) => setTimeout(r, 100))
        }
        if (!focusedRow) fail('ticket-51 stage: the view never switched to the forked session')
      })
      log('fork_live_done')
    } finally {
      rmSync(forkProject, { recursive: true, force: true })
    }

    // ---- ticket 52: the new-task empty state's command catalog. Two seeded
    // project directories (one with a real .pi prompt template + skill, one
    // empty) drive the whole slice through the REAL channels: the chip
    // dropdown's recents (seeded session files), the selection report → main
    // probe → push pipeline, and the composer's `/` menu. The menu lists the
    // seeded rows for dir A (and never /compact or the retired six), picking
    // a row only stages the command card (ticket 72 — zero user_message
    // across the window), and switching the selection to dir B re-probes so the seeded
    // rows disappear — the menu follows the directory. ----
    log('command_catalog_start')
    const CATALOG_TEMPLATE = 'picode-smoke-template'
    const CATALOG_SKILL = 'picode-smoke-skill'
    const catalogDirA = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-catalog-a-'))
    const catalogDirB = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-catalog-b-'))
    const catalogStore = process.env['PICODE_SESSION_DIR']
    if (!catalogStore) fail('ticket-52 stage: PICODE_SESSION_DIR is not set')
    try {
      // Project resources for dir A (the loader scans .pi/prompts +
      // .pi/skills; frontmatter parses exactly like the pi TUI's).
      mkdirSync(path.join(catalogDirA, '.pi', 'prompts'), { recursive: true })
      writeFileSync(
        path.join(catalogDirA, '.pi', 'prompts', `${CATALOG_TEMPLATE}.md`),
        `---\ndescription: Seeded smoke template\nargument-hint: [env]\n---\nSeeded template body\n`
      )
      mkdirSync(path.join(catalogDirA, '.pi', 'skills', CATALOG_SKILL), { recursive: true })
      writeFileSync(
        path.join(catalogDirA, '.pi', 'skills', CATALOG_SKILL, 'SKILL.md'),
        `---\nname: ${CATALOG_SKILL}\ndescription: Seeded smoke skill\n---\nSeeded skill body\n`
      )
      // Seed one session FILE per directory (the fold-stage pattern) so the
      // chip dropdown lists both as recent workspaces. Distinct mtimes: dir B
      // is newer, so it sorts first — clicking the dir A row is a real switch.
      const seedCatalogSession = (id: string, cwd: string, ageMinutes: number): void => {
        const stamp = new Date(Date.now() - ageMinutes * 60_000).toISOString()
        const lines = [
          JSON.stringify({ type: 'session', version: 3, id, timestamp: stamp, cwd }),
          JSON.stringify({
            type: 'message',
            id: `${id}-u1`,
            parentId: null,
            timestamp: stamp,
            message: { role: 'user', content: [{ type: 'text', text: `PICODE_CATALOG_52 seed for ${cwd}` }] }
          })
        ]
        const file = path.join(catalogStore, `${id}.jsonl`)
        writeFileSync(file, lines.join('\n') + '\n')
        utimesSync(file, new Date(Date.now() - ageMinutes * 60_000), new Date(Date.now() - ageMinutes * 60_000))
      }
      seedCatalogSession('catalog52-a', catalogDirA, 20)
      seedCatalogSession('catalog52-b', catalogDirB, 10)

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        const menuNamesJs = `[...document.querySelectorAll('.cmp-popover .cmp-cmd-name')].map((n) => n.textContent ?? '')`

        // ① ⌘N opens the new-task empty state (the ticket-17 precedent).
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true }))`)
        if (!(await waitForProbe(win, `document.querySelector('.empty-state') !== null`, 10_000))) {
          fail('ticket-52 stage: ⌘N never opened the new-task empty state')
        }
        log('command_catalog_empty_state_ok')

        // ② Pick dir A in the chip dropdown → the selection report reaches
        // main (debounced), the probe host enumerates dir A, and the push
        // lands in the renderer. Wait until the seeded rows appear in the
        // `/` menu.
        // The dropdown rows load async (the session index round-trips over
        // IPC), so the pick must WAIT for the row to render instead of
        // racing it once — the full-chain run's renderer is busy (the
        // ticket-47 focus-retry / ticket-49 waiter-first robustness class).
        await js(`document.querySelector('.newtask-chip')?.click(); true`)
        const pickRowJs = (needle: string): string => `(() => {
          const rows = [...document.querySelectorAll('.newtask-pop .newtask-row')]
          const row = rows.find((r) => (r.querySelector('.newtask-row-label')?.textContent ?? '').includes(${JSON.stringify(needle)}))
          if (!(row instanceof HTMLElement)) return false
          row.click()
          return true
        })()`
        const dropdownRowProbe = (needle: string): string => `(() => {
          const rows = [...document.querySelectorAll('.newtask-pop .newtask-row')]
          return rows.some((r) => (r.querySelector('.newtask-row-label')?.textContent ?? '').includes(${JSON.stringify(needle)}))
        })()`
        if (!(await waitForProbe(win, dropdownRowProbe('catalog-a'), 5_000))) {
          fail('ticket-52 stage: the chip dropdown never listed the seeded dir A workspace')
        }
        if (!((await js(pickRowJs('catalog-a'))) as boolean)) {
          fail('ticket-52 stage: the seeded dir A workspace row disappeared before the pick')
        }
        // The query matches only the seeded resources (names are unique), so
        // the poll is immune to a large global catalog outranking them.
        const typeSeededQuery = async (): Promise<void> => {
          await js(composerClearJs)
          if (!(await js(composerTypeJs('/picode-smoke')).catch(() => false))) {
            fail('ticket-52 stage: the empty-state composer textarea is missing')
          }
        }
        await typeSeededQuery()
        let appeared = false
        for (let waited = 0; waited < 45_000; waited += 200) {
          const names = (await js(menuNamesJs).catch(() => [])) as string[]
          if (names.includes(`/${CATALOG_TEMPLATE}`) && names.includes(`/${CATALOG_SKILL}`)) {
            appeared = true
            break
          }
          await new Promise((r) => setTimeout(r, 200))
        }
        if (!appeared) fail('ticket-52 stage: the seeded project template/skill never reached the `/` menu')
        log('command_catalog_rows_ok', `dirA=${CATALOG_TEMPLATE}+${CATALOG_SKILL}`)

        // ③ Menu hygiene in the empty state: with the bare `/` menu (top rows
        // of the whole catalog) neither /compact (session-domain) nor any of
        // the six retired built-ins may appear.
        await js(composerClearJs)
        if (!(await js(composerTypeJs('/')).catch(() => false))) {
          fail('ticket-52 stage: the empty-state composer disappeared before the hygiene check')
        }
        await new Promise((r) => setTimeout(r, 300))
        const names = (await js(menuNamesJs).catch(() => [])) as string[]
        for (const retired of ['/compact', '/new', '/tree', '/name', '/copy', '/model', '/thinking']) {
          if (names.includes(retired)) fail(`ticket-52 stage: ${retired} must not be listed in the empty-state menu`)
        }
        log('command_catalog_exclusions_ok', `bareRows=${names.length}`)

        // ④ Picking a row stages the command card (ticket 72 — the same
        // shared composer rule as every surface) — zero messages may reach
        // any session across the pick (stage-local observer, the ticket-38
        // negative-assertion precedent): the card holds the invocation, the
        // textarea (args) stays empty.
        let leaked = 0
        const onLeak = (event: Scoped): void => {
          if (event.type === 'user_message') leaked++
        }
        observers.push(onLeak)
        const pickCmdRowJs = (name: string): string => `(() => {
          const rows = [...document.querySelectorAll('.cmp-popover .cmp-menu-row')]
          const row = rows.find((r) => (r.querySelector('.cmp-cmd-name')?.textContent ?? '') === ${JSON.stringify(`/${name}`)})
          if (!(row instanceof HTMLElement)) return false
          row.click()
          return true
        })()`
        const pickCmdRowProbe = (name: string): string => `(() => {
          const rows = [...document.querySelectorAll('.cmp-popover .cmp-menu-row')]
          return rows.some((r) => (r.querySelector('.cmp-cmd-name')?.textContent ?? '') === ${JSON.stringify(`/${name}`)})
        })()`
        await typeSeededQuery()
        // The menu rows render on React's next commit after the input event —
        // under full-chain load that commit lands late, so wait for the row
        // (same one-shot-pick race as the dropdown picks above).
        if (!(await waitForProbe(win, pickCmdRowProbe(CATALOG_TEMPLATE), 5_000))) {
          fail(`ticket-52 stage: the /${CATALOG_TEMPLATE} menu row is missing`)
        }
        if (!((await js(pickCmdRowJs(CATALOG_TEMPLATE))) as boolean)) {
          fail(`ticket-52 stage: the /${CATALOG_TEMPLATE} menu row disappeared before the pick`)
        }
        // The card renders on the same commit class as the menu's removal —
        // poll for the structured card + empty args (ticket 72 form).
        const cardProbe52 = `(() => {
          const card = document.querySelector('.empty-state .composer-command-card')
          return card !== null
            && card.getAttribute('data-card-name') === ${JSON.stringify(CATALOG_TEMPLATE)}
            && card.getAttribute('data-card-source') === 'prompt'
            && (document.querySelector('.empty-state textarea.composer-input')?.value ?? 'missing') === ''
        })()`
        if (!(await waitForProbe(win, cardProbe52, 5_000))) {
          fail('ticket-52 stage: the pick never staged the command card (empty args + prompt card)')
        }
        await new Promise((r) => setTimeout(r, 2_500))
        observers.splice(observers.indexOf(onLeak), 1)
        if (leaked > 0) fail(`ticket-52 stage: picking a command row sent ${leaked} message(s) — staging must not send`)
        log('command_catalog_card_zero_send_ok')

        // × clears the card (ticket 72): the slot empties, the args text —
        // empty here — is untouched, and the next query types into a clean
        // composer for the dir-B switch below.
        if (!((await js(`document.querySelector('.empty-state .composer-command-card-remove')?.click(); true`).catch(() => false)) as boolean)) {
          fail('ticket-52 stage: the command card remove button is missing')
        }
        if (!(await waitForProbe(win, `document.querySelector('.empty-state .composer-command-card') === null`, 5_000))) {
          fail('ticket-52 stage: the command card survived its × removal')
        }
        log('command_catalog_card_clear_ok')

        // ⑤ Switch the selection to dir B (empty project): the menu re-probes
        // and the seeded rows disappear — the menu follows the directory.
        // Same async-row wait as the dir A pick: the dropdown's recents land
        // over IPC, never race the click.
        await js(`document.querySelector('.newtask-chip')?.click(); true`)
        if (!(await waitForProbe(win, dropdownRowProbe('catalog-b'), 5_000))) {
          fail('ticket-52 stage: the chip dropdown never listed the seeded dir B workspace')
        }
        if (!((await js(pickRowJs('catalog-b'))) as boolean)) {
          fail('ticket-52 stage: the seeded dir B workspace row disappeared before the pick')
        }
        await typeSeededQuery()
        let disappeared = false
        for (let waited = 0; waited < 45_000; waited += 200) {
          const after = (await js(menuNamesJs).catch(() => [])) as string[]
          if (!after.includes(`/${CATALOG_TEMPLATE}`) && !after.includes(`/${CATALOG_SKILL}`)) {
            disappeared = true
            break
          }
          await new Promise((r) => setTimeout(r, 200))
        }
        if (!disappeared) fail('ticket-52 stage: the seeded rows survived the directory switch')
        log('command_catalog_dir_switch_ok')

        // Leave the surface clean: close the menu + composer draft.
        await js(composerKeyJs('Escape'))
        await js(composerClearJs)
      })
      log('command_catalog_done')
    } finally {
      rmSync(catalogDirA, { recursive: true, force: true })
      rmSync(catalogDirB, { recursive: true, force: true })
    }

    // ---- ticket 59: mermaid diagram cards — a settled structured replay
    // (the ticket-53/55 precedent: contract-stream injection, no model call)
    // seeded with THREE mermaid fences: a valid closed flowchart (must render
    // a diagram card with the full action group + pan/zoom controls), a
    // broken closed fence (parse failure → source-card fallback with the
    // mermaid label intact, no error toast), and an unclosed fence at the
    // text tail (the streaming shape → source card). The diagram card's
    // copy-source must round-trip the raw fence text through the real
    // pasteboard, the download menu must offer SVG/PNG/MMD, and fullscreen
    // must open as a root-level overlay and close on Esc. ----
    log('mermaid_diagram_start')
    {
      const GOOD = 'flowchart TD\n  A[Start] --> B{Gate}\n  B -->|yes| C[Done]\n  B -->|no| A'
      // A lexer-level mermaid syntax error — fails identically in any
      // environment (the dangling-edge shape would actually parse).
      const BAD = 'flowchart TD\n  A --> B {'
      const UNCLOSED = 'flowchart TD\n  A --> B'
      const ANSWER_TEXT = [
        'The deploy flow:\n\n```mermaid\n' + GOOD + '\n```\n\n',
        'A broken definition falls back to source:\n\n```mermaid\n' + BAD + '\n```\n\n',
        'And one still streaming:\n\n```mermaid\n' + UNCLOSED
      ].join('')
      emitContractEvent({
        type: 'session_created',
        sessionId: 'smoke-mermaid',
        cwd,
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({
        type: 'history_loaded',
        items: [
          { role: 'user', id: 'mm-u1', text: 'Draw the deploy flow.', timestamp: 't1', skillName: null },
          {
            role: 'assistant',
            id: 'mm-a1',
            timestamp: 't2',
            text: ANSWER_TEXT,
            parts: [{ kind: 'text', text: ANSWER_TEXT }]
          }
        ]
      })
      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        // ① The diagram card renders (the mermaid chunk family loads lazily
        // on this first closed fence — give it a generous budget) with the
        // rendered svg, the lowercase chip and the full action group.
        const cardSig = `(() => ({
          cards: document.querySelectorAll('.md-diagram-card').length,
          svgs: document.querySelectorAll('.md-diagram-card .md-diagram-canvas svg').length,
          chip: document.querySelector('.md-diagram-card .md-code-lang')?.textContent ?? '',
          download: document.querySelectorAll('.md-diagram-card button[aria-label="Download diagram"]').length,
          copy: document.querySelectorAll('.md-diagram-card button[aria-label="Copy diagram source"]').length,
          fullscreen: document.querySelectorAll('.md-diagram-card button[aria-label="Open diagram fullscreen"]').length,
          zoom: document.querySelectorAll('.md-diagram-card button[aria-label="Zoom in"], .md-diagram-card button[aria-label="Zoom out"], .md-diagram-card button[aria-label="Reset zoom"]').length
        }))()`
        let sig = (await waitForProbe(
          win,
          `(() => { const s = ${cardSig}; return s.cards === 1 && s.svgs === 1 && s.chip === 'mermaid' &&
               s.download === 1 && s.copy === 1 && s.fullscreen === 1 && s.zoom === 3 })()`,
          15_000
        )) as boolean
        if (!sig) {
          const diag = (await js(cardSig).catch(() => 'unavailable')) as string
          fail(`ticket-59 stage: the diagram card never rendered; DOM: ${diag}`)
        }
        log('mermaid_card_rendered_ok')

        // ② The two fallbacks: broken (parse failure) and unclosed
        // (streaming shape) stay source cards with the mermaid label — and
        // no error toast pops (operator ruling Q7).
        const fallbackSig = `(() => ({
          cards: [...document.querySelectorAll('.md-code-card')].filter((c) => c.querySelector('.md-code-lang')?.textContent === 'mermaid').length,
          diagrams: document.querySelectorAll('.md-diagram-card').length,
          toasts: [...document.querySelectorAll('.toast-message')].filter((n) => /mermaid|parse|diagram/i.test(n.textContent ?? '')).length
        }))()`
        sig = (await waitForProbe(
          win,
          `(() => { const s = ${fallbackSig}; return s.cards === 2 && s.diagrams === 1 && s.toasts === 0 })()`,
          5_000
        )) as boolean
        if (!sig) {
          const diag = (await js(fallbackSig).catch(() => 'unavailable')) as string
          fail(`ticket-59 stage: the mermaid fallbacks are wrong; DOM: ${diag}`)
        }
        log('mermaid_fallbacks_ok')

        // ③ The download menu: open it, assert the three formats, close on
        // Escape.
        await js(
          `(() => {
            const btn = document.querySelector('.md-diagram-card button[aria-label="Download diagram"]')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`
        )
        sig = (await waitForProbe(
          win,
          `(() => {
            const items = [...document.querySelectorAll('.md-diagram-menu .md-diagram-menu-item')].map((n) => n.textContent ?? '')
            return items.join('|') === 'Download SVG|Download PNG|Download MMD'
          })()`,
          3_000
        )) as boolean
        if (!sig) fail('ticket-59 stage: the download menu never offered SVG/PNG/MMD')
        log('mermaid_download_menu_ok')
        await js(`(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
        const menuClosed = (await js(`document.querySelectorAll('.md-diagram-menu').length === 0`)) as boolean
        if (!menuClosed) fail('ticket-59 stage: Escape did not close the download menu')

        // ④ Copy source through the REAL pasteboard: focus for real (the
        // navigator.clipboard rejects while unfocused — ticket-44 dance),
        // park a sentinel, click, poll until the exact fence text lands.
        win.show()
        win.focus()
        app.focus({ steal: true })
        let focused = false
        for (let waited = 0; waited < 10_000 && !focused; waited += 100) {
          focused = (await js('document.hasFocus()')) === true
          if (!focused) {
            if (!win.isFocused()) app.focus({ steal: true })
            await new Promise((r) => setTimeout(r, 100))
          }
        }
        if (!focused) fail('ticket-59 stage: the window never took focus for the real-clipboard click')
        const previous = await clipboard.readText()
        try {
          await clipboard.writeText('PICODE_CLIPBOARD_SENTINEL_59')
          const clicked = (await js(
            `(() => {
              const btn = document.querySelector('.md-diagram-card button[aria-label="Copy diagram source"]')
              if (!(btn instanceof HTMLElement)) return false
              btn.click()
              return true
            })()`
          )) as boolean
          if (!clicked) fail('ticket-59 stage: the copy-source button is missing')
          let got = ''
          for (let waited = 0; waited < 5_000; waited += 100) {
            got = await clipboard.readText()
            // The markdown pipeline (rehype-highlight) normalizes the code
            // text with one trailing newline — the copy payload carries
            // exactly that.
            if (got === GOOD + '\n') break
            await new Promise((r) => setTimeout(r, 100))
          }
          if (got !== GOOD + '\n') {
            fail(`ticket-59 stage: clipboard never carried the exact fence source (got ${JSON.stringify(got)})`)
          }
          log('mermaid_copy_source_ok')
        } finally {
          await clipboard.writeText(previous) // leave the operator's pasteboard as found
        }

        // ⑤ Fullscreen: a ROOT-level overlay (a direct body child, not
        // inside the transcript) that Esc closes.
        await js(
          `(() => {
            const btn = document.querySelector('.md-diagram-card button[aria-label="Open diagram fullscreen"]')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`
        )
        sig = (await waitForProbe(
          win,
          `(() => {
            const overlay = document.querySelector('body > .md-diagram-fs')
            return overlay !== null && overlay.getAttribute('role') === 'dialog' &&
              overlay.querySelectorAll('.md-diagram-canvas svg').length === 1
          })()`,
          3_000
        )) as boolean
        if (!sig) fail('ticket-59 stage: fullscreen never opened as a root-level overlay')
        log('mermaid_fullscreen_open_ok')
        await js(`(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
        sig = (await waitForProbe(win, `document.querySelector('body > .md-diagram-fs') === null`, 3_000)) as boolean
        if (!sig) fail('ticket-59 stage: Escape did not close the fullscreen overlay')
        log('mermaid_fullscreen_esc_ok')
      })
    }
    log('mermaid_diagram_done')

    // ---- ticket 60: code-card line numbers + download, table CSV/TSV. A
    // settled structured replay (the ticket-59 precedent: contract-stream
    // injection, no model call) seeded with three code fences — a plain
    // typescript fence (the default-on gutter), a `js startLine=41` slice
    // (the shifted count) and a `text noLineNumbers` block (the gutter off
    // switch) — plus a GFM table for the completed copyTable family and a
    // wide token table for the ticket-87 full display. Assertions: the
    // per-card gutter projection (values included), the download button on
    // every code card + a REAL download through will-download carrying the
    // language-derived filename, the copy family payloads through the real
    // pasteboard (markdown zero-regression + CSV + TSV), and the ticket-87
    // full display (natural height, no internal vertical scroll; wide
    // tables keep their horizontal scroll). ----
    log('codecard_table_start')
    {
      const TS_CODE = [
        'export function parseRegistration(body: unknown): Registration {',
        '  const { email, password } = RegistrationSchema.parse(body)',
        '  return { email: email.trim().toLowerCase(), password: assertStrongPassword(password) }',
        '}'
      ].join('\n')
      const JS_CODE = ['const gate = (n) => n > 3', 'const done = gate(4)', 'console.log(done)'].join('\n')
      const PLAIN_CODE = ['2026-09-10 09:00 boot', '2026-09-10 09:01 ready'].join('\n')
      const TABLE_MD = ['| Name | Note |', '| --- | --- |', '| pi, code | say "hi" |', '| plain | two words |'].join('\n')
      // Ticket 87: unbreakable tokens force the wide table's min-content
      // width (~1750px) past any pane width the window can give — the
      // horizontal-scroll preservation must be provable, not lucky.
      const WIDE_TABLE_MD = [
        '| Metric | column_a_' + 'a'.repeat(80) + ' | column_b_' + 'b'.repeat(80) + ' |',
        '| --- | --- | --- |',
        '| rows | ' + 'x'.repeat(80) + ' | ' + 'y'.repeat(80) + ' |'
      ].join('\n')
      const ANSWER_TEXT = [
        'The registrar:\n\n```typescript\n' + TS_CODE + '\n```\n\n',
        'A file slice keeps its true numbering:\n\n```js startLine=41\n' + JS_CODE + '\n```\n\n',
        'A model-intended minimal block:\n\n```text noLineNumbers\n' + PLAIN_CODE + '\n```\n\n',
        'And the table:\n\n' + TABLE_MD + '\n\n',
        'A wide table keeps its horizontal scroll:\n\n' + WIDE_TABLE_MD + '\n'
      ].join('')
      // The exact copy-family payloads (rawCellText flattening + RFC 4180
      // quoting; a quote-bearing field quotes in TSV too).
      const EXPECT_MD = ['| Name | Note |', '| --- | --- |', '| pi, code | say "hi" |', '| plain | two words |'].join('\n')
      const EXPECT_CSV = ['Name,Note', '"pi, code","say ""hi"""', 'plain,two words'].join('\n')
      const EXPECT_TSV = ['Name\tNote', 'pi, code\t"say ""hi"""', 'plain\ttwo words'].join('\n')

      emitContractEvent({
        type: 'session_created',
        sessionId: 'smoke-codecard',
        cwd,
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({
        type: 'history_loaded',
        items: [
          { role: 'user', id: 'cc-u1', text: 'Show the registrar code and the table.', timestamp: 't1', skillName: null },
          {
            role: 'assistant',
            id: 'cc-a1',
            timestamp: 't2',
            text: ANSWER_TEXT,
            parts: [{ kind: 'text', text: ANSWER_TEXT }]
          }
        ]
      })
      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)

        // ① The gutter projection per card, in stream order: default-on
        // numbers 1..4, the startLine=41 shift, and the noLineNumbers card
        // with NO gutter at all. Every code card carries the download
        // button beside copy.
        const gutterSig = `(() => ({
          cards: [...document.querySelectorAll('.msg-assistant .md-code-card')].map((card) => ({
            linenos: [...card.querySelectorAll('.md-code-lineno')].map((el) => el.textContent ?? ''),
            numbered: card.querySelector('pre')?.classList.contains('md-code-pre-numbered') ?? false,
            download: card.querySelectorAll('button[aria-label="Download code"]').length,
            copy: card.querySelectorAll('button[aria-label="Copy code"]').length,
            wrap: card.querySelectorAll('button[aria-label="Wrap lines"]').length
          }))
        }))()`
        let sig = (await waitForProbe(
          win,
          `(() => { const s = ${gutterSig};
             return s.cards.length === 3 &&
               JSON.stringify(s.cards[0].linenos) === JSON.stringify(['1','2','3','4']) && s.cards[0].numbered &&
               JSON.stringify(s.cards[1].linenos) === JSON.stringify(['41','42','43']) && s.cards[1].numbered &&
               s.cards[2].linenos.length === 0 && !s.cards[2].numbered &&
               s.cards.every((c) => c.download === 1 && c.copy === 1 && c.wrap === 1) })()`,
          10_000
        )) as boolean
        if (!sig) {
          const diag = (await js(gutterSig).catch(() => 'unavailable')) as string
          fail(`ticket-60 stage: the line-number gutter projection is wrong; DOM: ${diag}`)
        }
        log('codecard_linenos_ok')

        // ② The table tools row: ticket 87 pruned it to the copy family —
        // markdown / CSV / TSV (preview + expand died with the 360px cap).
        const toolsSig = `(() => ({
          count: document.querySelectorAll('.msg-assistant .md-table-tools button').length,
          labels: [...document.querySelectorAll('.msg-assistant .md-table-tools button')].map((b) => b.getAttribute('aria-label'))
        }))()`
        sig = (await waitForProbe(
          win,
          `(() => { const s = ${toolsSig};
             return s.count === 6 &&
               JSON.stringify(s.labels) === JSON.stringify(['Copy table', 'Copy table as CSV', 'Copy table as TSV', 'Copy table', 'Copy table as CSV', 'Copy table as TSV']) })()`,
          10_000
        )) as boolean
        if (!sig) {
          const diag = (await js(toolsSig).catch(() => 'unavailable')) as string
          fail(`ticket-60 stage: the table tools row is wrong; DOM: ${diag}`)
        }
        log('table_tools_row_ok')

        // ③ The copy family through the REAL pasteboard: focus for real
        // (the navigator.clipboard rejects while unfocused — ticket-44
        // dance), then per format: park a sentinel, click, poll for the
        // exact payload.
        win.show()
        win.focus()
        app.focus({ steal: true })
        let focused = false
        for (let waited = 0; waited < 10_000 && !focused; waited += 100) {
          focused = (await js('document.hasFocus()')) === true
          if (!focused) {
            if (!win.isFocused()) app.focus({ steal: true })
            await new Promise((r) => setTimeout(r, 100))
          }
        }
        if (!focused) fail('ticket-60 stage: the window never took focus for the real-clipboard clicks')
        const previous = await clipboard.readText()
        try {
          const clickCopy = async (ariaLabel: string): Promise<void> => {
            const clicked = (await js(
              `(() => {
                 const btn = [...document.querySelectorAll('.msg-assistant .md-table-tools button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(ariaLabel)})
                 if (!(btn instanceof HTMLElement)) return false
                 btn.click()
                 return true
               })()`
            )) as boolean
            if (!clicked) fail(`ticket-60 stage: the ${ariaLabel} button is missing`)
          }
          const expectPayload = async (expected: string, why: string): Promise<void> => {
            let got = ''
            for (let waited = 0; waited < 5_000; waited += 100) {
              got = await clipboard.readText()
              if (got === expected) break
              await new Promise((r) => setTimeout(r, 100))
            }
            if (got !== expected) fail(`ticket-60 stage: ${why} (got ${JSON.stringify(got)})`)
          }
          await clipboard.writeText('PICODE_CLIPBOARD_SENTINEL_60')
          await clickCopy('Copy table')
          await expectPayload(EXPECT_MD, 'copy-as-Markdown never carried the exact table')
          log('table_copy_markdown_ok')
          await clipboard.writeText('PICODE_CLIPBOARD_SENTINEL_60')
          await clickCopy('Copy table as CSV')
          await expectPayload(EXPECT_CSV, 'copy-as-CSV never carried the exact table')
          log('table_copy_csv_ok')
          await clipboard.writeText('PICODE_CLIPBOARD_SENTINEL_60')
          await clickCopy('Copy table as TSV')
          await expectPayload(EXPECT_TSV, 'copy-as-TSV never carried the exact table')
          log('table_copy_tsv_ok')
        } finally {
          await clipboard.writeText(previous) // leave the operator's pasteboard as found
        }

        // ④ Ticket 87 full display: every table scroll container renders at
        // natural height — computed max-height none, no internal vertical
        // scroll — and the wide table overflows into a horizontal scroll
        // instead of squeezing its columns into the pane.
        sig = (await waitForProbe(
          win,
          `(() => {
             const scrolls = [...document.querySelectorAll('.msg-assistant .md-table-scroll')]
             const wide = scrolls[scrolls.length - 1]
             return scrolls.length === 2 &&
               scrolls.every((el) => getComputedStyle(el).maxHeight === 'none') &&
               scrolls.every((el) => el.scrollHeight <= el.clientHeight + 1) &&
               wide !== undefined && wide.scrollWidth > wide.clientWidth
           })()`,
          3_000
        )) as boolean
        if (!sig) fail('ticket-87 stage: the table full display is wrong (cap back, internal vertical scroll, or wide-table horizontal scroll lost)')
        log('table_full_display_ok')

        // ⑤ Download: a REAL download — will-download fires in the main
        // process with the language-derived filename (cancelled immediately,
        // nothing lands on disk) while the renderer stash proves the blob
        // carries the exact code text.
        const download = { fired: false, filename: '' }
        win.webContents.session.once('will-download', (event, item) => {
          download.fired = true
          download.filename = item.getFilename()
          event.preventDefault() // smoke: capture and cancel — no disk writes
        })
        await js(
          `(() => {
             window.__dlBlob = null
             const original = URL.createObjectURL.bind(URL)
             URL.createObjectURL = (blob) => { window.__dlBlob = blob; return original(blob) }
             const btn = document.querySelectorAll('.msg-assistant .md-code-card button[aria-label="Download code"]')[0]
             if (!(btn instanceof HTMLElement)) return false
             btn.click()
             return true
           })()`
        )
        let fired = false
        for (let waited = 0; waited < 5_000 && !fired; waited += 100) {
          fired = download.fired
          if (!fired) await new Promise((r) => setTimeout(r, 100))
        }
        if (!fired || download.filename !== 'snippet.ts') {
          fail(`ticket-60 stage: the download never fired with the derived filename (fired=${download.fired} filename=${download.filename})`)
        }
        const blobText = (await js(`window.__dlBlob instanceof Blob ? window.__dlBlob.text() : ''`)) as string
        // rehype-highlight normalizes the code text with one trailing
        // newline — the payload carries exactly that (ticket-59 precedent).
        if (blobText !== TS_CODE + '\n') {
          fail(`ticket-60 stage: the download blob never carried the exact code text (got ${JSON.stringify(blobText)})`)
        }
        log('codecard_download_ok')
      })
    }
    log('codecard_table_done')
    // ---- ticket 65: usage charts — curve clamping + hover white cards ----
    // Runs with PICODE_FAKE_USAGE=1 (run-all stage env + electron-smoke
    // wrapper): the usage IPC serves the deterministic fixture, so the
    // Usage page renders real charts. Stages:
    // ① the settings shell opens onto the Usage page (cards + trend);
    // ② hovering the trend chart pops the ZCode white card (guide line +
    //    intersection dots + date · per-model tokens · total);
    // ③ leaving the chart hides the chrome again;
    // ④ hovering a donut arc pops its card (model · tokens · share);
    // ⑤ the trend click STILL opens the drill-down (zero click regression).
    log('usage_hover_start')
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const hoverAt = (selector: string, fx: number, fy: number): Promise<unknown> =>
        js(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return false
          const r = el.getBoundingClientRect()
          el.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: r.left + r.width * ${fx},
            clientY: r.top + r.height * ${fy}
          }))
          return true
        })()`)
      const unhover = (selector: string): Promise<unknown> =>
        js(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return false
          el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
          el.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }))
          return true
        })()`)

      // ① Open the settings shell — the Usage section is the initial one.
      const opened = (await js(
        `(() => {
          const btn = document.querySelector('button[aria-label="Settings"]')
          if (!(btn instanceof HTMLElement)) return false
          btn.click()
          return true
        })()`
      )) as boolean
      if (!opened) fail('ticket-65 stage: the settings gear button is missing')
      const usageReady = await waitForProbe(
        win,
        `document.querySelectorAll('.stat-card').length >= 5 && document.querySelectorAll('.trend-legend-item').length > 0`,
        15_000
      )
      if (!usageReady) fail('ticket-65 stage: the usage page never rendered cards + trend (fake usage fixture missing?)')
      log('usage_page_open_ok')

      // ② Trend hover: the white card with guide + dots must appear.
      await hoverAt('.trend-svg', 0.8, 0.5)
      const trendTip = await waitForProbe(
        win,
        `(() => {
          const tip = document.querySelector('.trend-tooltip')
          return tip !== null
            && document.querySelectorAll('.trend-guide').length === 1
            && document.querySelectorAll('.trend-hover-dot').length > 0
            && document.querySelectorAll('.trend-tooltip-row').length > 0
            && (tip.textContent ?? '').includes('tokens')
        })()`,
        5_000
      )
      if (!trendTip) fail('ticket-65 stage: trend hover never opened the white-card tooltip with guide + dots')
      log('usage_trend_hover_ok')

      // ③ Leaving the chart hides the chrome again.
      await unhover('.trend-svg')
      if (!(await waitForProbe(win, `document.querySelector('.trend-tooltip') === null`, 5_000))) {
        fail('ticket-65 stage: the trend tooltip never hid after the pointer left')
      }
      log('usage_trend_unhover_ok')

      // ④ Donut hover: move over the first arc (twelve o'clock is on the
      // ring) — the card with model · tokens · share must appear, then hide.
      const donutHovered = (await js(
        `(() => {
          const svg = document.querySelector('.donut-svg')
          const arc = document.querySelector('.donut-arc[data-model]')
          if (!svg || !arc) return false
          const r = svg.getBoundingClientRect()
          arc.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: r.left + r.width * 0.5,
            clientY: r.top + r.height * (22 / 180)
          }))
          return true
        })()`
      )) as boolean
      if (!donutHovered) fail('ticket-65 stage: no donut arc to hover')
      const donutTip = await waitForProbe(
        win,
        `(() => {
          const tip = document.querySelector('.donut-tooltip')
          return tip !== null && (tip.textContent ?? '').includes('%') && (tip.textContent ?? '').includes('tokens')
        })()`,
        5_000
      )
      if (!donutTip) fail('ticket-65 stage: donut hover never opened the white-card tooltip')
      await unhover('.donut-svg')
      if (!(await waitForProbe(win, `document.querySelector('.donut-tooltip') === null`, 5_000))) {
        fail('ticket-65 stage: the donut tooltip never hid after the pointer left')
      }
      log('usage_donut_hover_ok')

      // ⑤ Click regression: the trend click still opens the drill-down.
      const clicked = (await js(
        `(() => {
          const svg = document.querySelector('.trend-svg')
          if (!svg) return false
          const r = svg.getBoundingClientRect()
          svg.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            clientX: r.left + r.width * 0.8,
            clientY: r.top + r.height * 0.5
          }))
          return true
        })()`
      )) as boolean
      if (!clicked) fail('ticket-65 stage: the trend svg is missing for the drill-down click')
      if (!(await waitForProbe(win, `document.querySelectorAll('.drilldown').length > 0`, 5_000))) {
        fail('ticket-65 stage: the trend click no longer opens the drill-down (regression)')
      }
      log('usage_drilldown_click_ok')

      // Leave the shell clean: close the drill-down, back to the workspace.
      await js(
        `(() => {
          const close = document.querySelector('.dd-close')
          if (close instanceof HTMLElement) close.click()
          return true
        })()`
      )
      await js(
        `(() => {
          const back = document.querySelector('.settings-back')
          if (back instanceof HTMLElement) back.click()
          return true
        })()`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.stat-card').length === 0`, 5_000))) {
        fail('ticket-65 stage: leaving the settings shell never returned to the workspace')
      }
      log('usage_hover_done')
    })
    log('usage_hover_stage_done')

    // ---- ticket 63: the settings window + Skills management ----
    // ⌘, (physical Comma) toggles the settings window; the Skills section
    // lists Pi's REAL loading surface for a sandbox agent dir (the probe
    // child enumerates it through the actual SDK package manager): a real
    // directory skill, a symlinked skill, and a dangling link. The toggle
    // writes the pi-config-format override into the SANDBOX settings.json,
    // and deleting the link unlinks ONLY the link — the real directory it
    // points at survives byte-for-byte (the ticket's data-safety line).
    log('settings_skills_start')
    {
      const sandboxAgent = process.env['PICODE_PI_AGENT_DIR']
      if (sandboxAgent === undefined || sandboxAgent.trim() === '') {
        fail('ticket-63 stage: PICODE_PI_AGENT_DIR is not set — the skills stage refuses to touch the real agent dir')
      }
      const agentDir = sandboxAgent!
      const sandboxSettings = path.join(agentDir, 'settings.json')
      const sandboxSkills = path.join(agentDir, 'skills')
      // Seed the sandbox: one real dir skill, one symlinked skill pointing
      // at a REAL directory OUTSIDE the skills dir (the SSOT), one dangling
      // link. Unique names so the operator's real ~/.agents rows can't blur
      // the assertions.
      const REAL_NAME = 'picode-smoke-real'
      const LINK_NAME = 'picode-smoke-link'
      const DANGLING_NAME = 'picode-smoke-dangling'
      const LINK_TARGET = path.join(agentDir, 'ssot', LINK_NAME)
      // The exact bytes the link's target must still carry after the delete
      // (byte-for-byte survival is the red-line assertion).
      const LINK_TARGET_CONTENT = '---\nname: picode-smoke-link\ndescription: The smoke sandbox linked skill.\n---\nbody'
      mkdirSync(path.join(sandboxSkills, REAL_NAME), { recursive: true })
      writeFileSync(
        path.join(sandboxSkills, REAL_NAME, 'SKILL.md'),
        '---\nname: picode-smoke-real\ndescription: The smoke sandbox real-directory skill.\n---\nbody'
      )
      mkdirSync(path.join(LINK_TARGET), { recursive: true })
      writeFileSync(path.join(LINK_TARGET, 'SKILL.md'), LINK_TARGET_CONTENT)
      symlinkSync(LINK_TARGET, path.join(sandboxSkills, LINK_NAME))
      symlinkSync(path.join(agentDir, 'vanished-target'), path.join(sandboxSkills, DANGLING_NAME))
      // The toggle writes land here — seed the document so the poll below
      // reads a file from the very first probe.
      writeFileSync(sandboxSettings, JSON.stringify({}))
      try {
        await withWindow(getWindow, async (win) => {
          const js = (script: string) => win.webContents.executeJavaScript(script)

          // ① ⌘, opens the settings window (physical Comma chord → the
          // keymap table → the shell reducer).
          await js(`(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Comma', key: ',', metaKey: true, cancelable: true }))
            return true
          })()`)
          let opened = false
          for (let waited = 0; waited < 5_000 && !opened; waited += 100) {
            opened = (await js(`document.querySelector('.settings-shell') !== null && document.querySelector('.titlebar-title')?.textContent === 'Settings'`).catch(() => false)) as boolean
            if (!opened) await new Promise((r) => setTimeout(r, 100))
          }
          if (!opened) fail('ticket-63 stage: ⌘, never opened the settings window')
          log('settings_open_cmdcomma_ok')

          // ② The titlebar gear toggles it closed again (and ⌘, reopens).
          if (!(await js(`(() => {
            const gear = document.querySelector('button[aria-label="Close settings"]')
            if (!(gear instanceof HTMLElement)) return false
            gear.click()
            return true
          })()`).catch(() => false))) fail('ticket-63 stage: the titlebar gear is missing in the settings view')
          let gearClosed = false
          for (let waited = 0; waited < 5_000 && !gearClosed; waited += 100) {
            gearClosed = (await js(`document.querySelector('.settings-shell') === null`).catch(() => false)) as boolean
            if (!gearClosed) await new Promise((r) => setTimeout(r, 100))
          }
          if (!gearClosed) fail('ticket-63 stage: the gear never closed the settings window')
          log('settings_gear_toggle_ok')
          await js(`(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Comma', key: ',', metaKey: true, cancelable: true }))
            return true
          })()`)
          let reopened = false
          for (let waited = 0; waited < 5_000 && !reopened; waited += 100) {
            reopened = (await js(`document.querySelector('.settings-shell') !== null`).catch(() => false)) as boolean
            if (!reopened) await new Promise((r) => setTimeout(r, 100))
          }
          if (!reopened) fail('ticket-63 stage: ⌘, never reopened the settings window')
          log('settings_reopen_ok')

          // ②b (ticket 76): the Models section's sign-in list is ordered
          // configured-first, alphabetical within each group — computed
          // from the SAME cached auth report the renderer joined.
          {
            if (!(await js(`(() => {
              const item = [...document.querySelectorAll('.settings-item')].find((el) => el.textContent?.trim() === 'Models')
              if (!(item instanceof HTMLElement)) return false
              item.click()
              return true
            })()`).catch(() => false))) fail('ticket-76 stage: the Models nav item is missing')
            const authReport = getAuthReport ? await getAuthReport() : null
            if (authReport === null) fail('ticket-76 stage: the smoke could not read the cached auth report')
            const expectedProviders = sortProvidersConfiguredFirst(authReport.providers, configuredProviderIds(authReport)).map((p) => p.name)
            let rowNames: string[] = []
            for (let waited = 0; waited < 10_000; waited += 100) {
              rowNames = (await js(`[...document.querySelectorAll('.auth-list .auth-row-name')].map((n) => n.textContent ?? '')`).catch(() => [])) as string[]
              if (rowNames.length >= expectedProviders.length) break
              await new Promise((r) => setTimeout(r, 100))
            }
            if (JSON.stringify(rowNames) !== JSON.stringify(expectedProviders)) {
              fail(`ticket-76 stage: sign-in order ${JSON.stringify(rowNames)} != expected ${JSON.stringify(expectedProviders)}`)
            }
            log('settings_models_provider_order_ok', expectedProviders.join(','))
            // Return to the Skills section the ticket-63 stage continues with.
            if (!(await js(`(() => {
              const item = [...document.querySelectorAll('.settings-item')].find((el) => el.textContent?.trim() === 'Skills')
              if (!(item instanceof HTMLElement)) return false
              item.click()
              return true
            })()`).catch(() => false))) fail('ticket-76 stage: the Skills nav item is missing')
          }

          // ③ The Skills section lists the sandbox's real loading surface
          // (the probe child + the SDK package manager do the enumeration).
          if (!(await js(`(() => {
            const item = [...document.querySelectorAll('.settings-item')].find((el) => el.textContent?.trim() === 'Skills')
            if (!(item instanceof HTMLElement)) return false
            item.click()
            return true
          })()`).catch(() => false))) fail('ticket-63 stage: the Skills nav item is missing')
          const rowSig = (name: string): string => `(() => {
            const row = document.querySelector('.skill-row[data-skill-name="${name}"]')
            if (!(row instanceof HTMLElement)) return null
            const toggle = row.querySelector('.skill-switch')
            return {
              present: true,
              enabled: toggle?.getAttribute('aria-checked') ?? null,
              toggleDisabled: toggle?.hasAttribute('disabled') ?? false,
              deleteBtn: row.querySelector('button[aria-label^="Delete "]') !== null,
              badges: [...row.querySelectorAll('.skill-badge')].map((b) => b.textContent ?? ''),
              desc: row.querySelector('.skill-row-description')?.textContent ?? null
            }
          })()`
          type RowSig = { present: boolean; enabled: string | null; toggleDisabled: boolean; deleteBtn: boolean; badges: string[]; desc: string | null } | null
          let realRow: RowSig = null
          let linkRow: RowSig = null
          let danglingRow: RowSig = null
          for (let waited = 0; waited < 45_000; waited += 250) {
            const r = (await js(rowSig(REAL_NAME)).catch(() => null)) as RowSig
            const l = (await js(rowSig(LINK_NAME)).catch(() => null)) as RowSig
            const d = (await js(rowSig(DANGLING_NAME)).catch(() => null)) as RowSig
            if (r !== null && l !== null && d !== null) {
              realRow = r
              linkRow = l
              danglingRow = d
              break
            }
            await new Promise((res) => setTimeout(res, 250))
          }
          if (realRow === null || linkRow === null || danglingRow === null) {
            const diag = (await js(`(() => ({
              rows: [...document.querySelectorAll('.skill-row')].map((r) => r.dataset['skillName']),
              errors: [...document.querySelectorAll('.settings-skills-error')].map((e) => e.textContent),
              globalCount: document.querySelector('.settings-card .settings-skills-count')?.textContent ?? null
            }))()`).catch(() => null)) as { rows: string[]; errors: string[]; globalCount: string | null } | null
            fail(`ticket-63 stage: the sandbox skill rows never appeared (real=${realRow !== null} link=${linkRow !== null} dangling=${danglingRow !== null}) diag=${JSON.stringify(diag)}`)
          }
          if (realRow!.enabled !== 'true' || linkRow!.enabled !== 'true') fail('ticket-63 stage: the live sandbox rows are not marked enabled')
          if (!realRow!.deleteBtn || !linkRow!.deleteBtn) fail('ticket-63 stage: the deletable sandbox rows lost their delete buttons')
          if (danglingRow!.toggleDisabled !== true || danglingRow!.enabled !== 'false') fail('ticket-63 stage: the dangling link is not disabled and locked')
          if (!danglingRow!.badges.some((b) => b.toLowerCase().includes('broken'))) fail('ticket-63 stage: the dangling link is not marked broken')
          if (!danglingRow!.deleteBtn) fail('ticket-63 stage: the dangling link lost its delete button')
          log('skills_rows_probed_ok', `real+link+dangling`)

          // ④ Toggle the real-dir skill OFF — the switch flips AND the
          // sandbox settings.json gains the pi-config exclusion.
          if (!(await js(`(() => {
            const row = document.querySelector('.skill-row[data-skill-name="${REAL_NAME}"] .skill-switch')
            if (!(row instanceof HTMLElement)) return false
            row.click()
            return true
          })()`).catch(() => false))) fail('ticket-63 stage: the real-dir skill toggle is missing')
          const skillsPattern = `-skills/${REAL_NAME}/SKILL.md`
          let disableWritten = false
          for (let waited = 0; waited < 10_000 && !disableWritten; waited += 250) {
            const flipped = (await js(rowSig(REAL_NAME)).catch(() => null)) as RowSig
            const doc = readSettingsTolerant(sandboxSettings)
            disableWritten = flipped?.enabled === 'false' && Array.isArray(doc.skills) && doc.skills.includes(skillsPattern)
            if (!disableWritten) await new Promise((r) => setTimeout(r, 250))
          }
          if (!disableWritten) fail(`ticket-63 stage: the disable toggle never wrote ${skillsPattern}`)
          log('skills_disable_written_ok', skillsPattern)

          // ⑤ Toggle back ON — the +pattern force-include.
          await js(`(() => {
            const row = document.querySelector('.skill-row[data-skill-name="${REAL_NAME}"] .skill-switch')
            if (!(row instanceof HTMLElement)) return false
            row.click()
            return true
          })()`)
          const enablePattern = `+skills/${REAL_NAME}/SKILL.md`
          let enableWritten = false
          for (let waited = 0; waited < 10_000 && !enableWritten; waited += 250) {
            const flipped = (await js(rowSig(REAL_NAME)).catch(() => null)) as RowSig
            const doc = readSettingsTolerant(sandboxSettings)
            enableWritten = flipped?.enabled === 'true' && Array.isArray(doc.skills) && doc.skills.includes(enablePattern)
            if (!enableWritten) await new Promise((r) => setTimeout(r, 250))
          }
          if (!enableWritten) fail(`ticket-63 stage: the enable toggle never wrote ${enablePattern}`)
          log('skills_enable_written_ok', enablePattern)

          // ⑥ Delete the LINKED skill through the two-step confirm: the
          // strip names the real directory, the confirm unlinks ONLY the
          // link, and the SSOT target survives byte-for-byte.
          if (!(await js(`(() => {
            const btn = document.querySelector('.skill-row[data-skill-name="${LINK_NAME}"] button[aria-label^="Delete "]')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`).catch(() => false))) fail('ticket-63 stage: the linked row\'s delete button is missing')
          let confirmShown = false
          for (let waited = 0; waited < 3_000 && !confirmShown; waited += 100) {
            confirmShown = (await js(`(() => {
              const strip = document.querySelector('.skill-row[data-skill-name="${LINK_NAME}"] .skill-confirm-copy')
              return strip !== null && (strip.textContent ?? '').includes('${LINK_TARGET}')
            })()`).catch(() => false)) as boolean
            if (!confirmShown) await new Promise((r) => setTimeout(r, 100))
          }
          if (!confirmShown) fail('ticket-63 stage: the delete confirm strip never showed the preserved target path')
          log('skills_confirm_copy_ok')
          if (!(await js(`(() => {
            const strip = document.querySelector('.skill-row[data-skill-name="${LINK_NAME}"] .skill-confirm')
            const btn = strip?.querySelector('.skill-confirm-delete')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`).catch(() => false))) fail('ticket-63 stage: the confirm-delete button is missing')
          let linkGone = false
          for (let waited = 0; waited < 10_000 && !linkGone; waited += 250) {
            const row = (await js(rowSig(LINK_NAME)).catch(() => null)) as RowSig
            linkGone = row === null
            if (!linkGone) await new Promise((r) => setTimeout(r, 250))
          }
          if (!linkGone) fail('ticket-63 stage: the linked row never left the list after deletion')
          if (existsSync(path.join(sandboxSkills, LINK_NAME))) fail('ticket-63 stage: the link still exists after deletion')
          if (!existsSync(path.join(LINK_TARGET, 'SKILL.md'))) fail('ticket-63 stage: THE RED LINE — deleting the link touched the real directory')
          if (readFileSync(path.join(LINK_TARGET, 'SKILL.md'), 'utf-8') !== LINK_TARGET_CONTENT) {
            fail('ticket-63 stage: the real skill file content changed on link deletion')
          }
          log('skills_delete_link_target_survives_ok')

          // ⑦ Escape closes the settings window.
          await js(`(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
            return true
          })()`)
          let escClosed = false
          for (let waited = 0; waited < 5_000 && !escClosed; waited += 100) {
            escClosed = (await js(`document.querySelector('.settings-shell') === null`).catch(() => false)) as boolean
            if (!escClosed) await new Promise((r) => setTimeout(r, 100))
          }
          if (!escClosed) fail('ticket-63 stage: Escape never closed the settings window')
          log('settings_esc_close_ok')
        })
      } finally {
        // Sandbox hygiene: the seeded skills + settings live ONLY in the
        // throwaway agent dir — remove them so reruns start clean. (The
        // wrapper deletes the whole dir when the app exits; the finally
        // keeps standalone PICODE_SMOKE=1 runs clean too.)
        rmSync(sandboxSkills, { recursive: true, force: true })
        rmSync(path.join(agentDir, 'ssot'), { recursive: true, force: true })
        rmSync(sandboxSettings, { force: true })
      }
      log('settings_skills_done')
    }

    // ---- ticket 64: the Packages section — global install/toggle/remove +
    // project layer + the untrusted trust banner ----
    // The GLOBAL layer installs a REAL local-path package through the op
    // host (the SDK's own package manager, the exact pi install code path)
    // into the SANDBOX settings.json, toggles it (the canonical all-[]
    // pi-config shape, then back to the string form), and removes it with
    // the confirm strip. The PROJECT layer scopes to a sandbox project
    // whose .pi/settings.json carries one package — the sandbox agent dir
    // has NO trust.json, so the ask+no-decision derivation renders the
    // project UNTRUSTED: the banner must state that Pi is not loading the
    // project's resources, and every project action must stay locked.
    // trust.json is byte-identical across the whole stage (the red line:
    // the APP never writes trust decisions).
    log('packages_stage_start')
    {
      const sandboxAgent = process.env['PICODE_PI_AGENT_DIR']
      if (sandboxAgent === undefined || sandboxAgent.trim() === '') {
        fail('ticket-64 stage: PICODE_PI_AGENT_DIR is not set — the packages stage refuses to touch the real agent dir')
      }
      const agentDir = sandboxAgent!
      const sandboxSettings = path.join(agentDir, 'settings.json')
      const sandboxTrust = path.join(agentDir, 'trust.json')
      // A real mini pi package on disk — the LOCAL-PATH install source
      // (offline-safe: a local install validates the path and writes the
      // settings entry; nothing is downloaded).
      const pkgRoot = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-pkg-'))
      mkdirSync(path.join(pkgRoot, 'skills', 'picode-smoke-pkg-skill'), { recursive: true })
      mkdirSync(path.join(pkgRoot, 'extensions'), { recursive: true })
      mkdirSync(path.join(pkgRoot, 'prompts'), { recursive: true })
      writeFileSync(
        path.join(pkgRoot, 'skills', 'picode-smoke-pkg-skill', 'SKILL.md'),
        '---\nname: picode-smoke-pkg-skill\ndescription: The smoke package skill.\n---\nbody'
      )
      writeFileSync(path.join(pkgRoot, 'extensions', 'picode-smoke-noop.ts'), 'export const picodeSmokeNoop = 1\n')
      writeFileSync(
        path.join(pkgRoot, 'prompts', 'picode-smoke.md'),
        '---\ndescription: The smoke package prompt.\n---\nbody'
      )
      // The project sandbox: one local-path package in .pi/settings.json;
      // trust.json stays ABSENT (ask + no decision → derived untrusted).
      const projectDir = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-pkg-proj-'))
      const projectPkgRoot = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-pkg-projpkg-'))
      mkdirSync(path.join(projectPkgRoot, 'skills'), { recursive: true })
      writeFileSync(
        path.join(projectPkgRoot, 'skills', 'SKILL.md'),
        '---\nname: picode-smoke-projpkg-skill\ndescription: The smoke project package skill.\n---\nbody'
      )
      mkdirSync(path.join(projectDir, '.pi'), { recursive: true })
      writeFileSync(path.join(projectDir, '.pi', 'settings.json'), JSON.stringify({ packages: [projectPkgRoot] }))
      // The canonical settings form of the installed local package: pi
      // relativizes local sources against the settings file's directory
      // (the agent dir for user scope) — the row and the file carry THAT
      // form, not the absolute path the input received.
      const relPkg = path.relative(agentDir, pkgRoot)
      // The red line's baseline: the app must never create trust.json.
      const trustJsonBefore = existsSync(sandboxTrust) ? readFileSync(sandboxTrust, 'utf-8') : null
      writeFileSync(sandboxSettings, JSON.stringify({}))
      try {
        // A session scoped to the project dir focuses it — the settings
        // window's Packages request then carries the project cwd.
        supervisor.createSession(projectDir)
        await waitFor((e) => e.type === 'session_created', 'packages session_created')
        await withWindow(getWindow, async (win) => {
          const js = (script: string) => win.webContents.executeJavaScript(script)

          // ① ⌘, opens the settings window; the Packages nav opens the
          // section.
          await js(`(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Comma', key: ',', metaKey: true, cancelable: true }))
            return true
          })()`)
          if (!(await waitForProbe(win, `document.querySelector('.settings-shell') !== null`, 5_000))) {
            fail('ticket-64 stage: ⌘, never opened the settings window')
          }
          if (!(await js(`(() => {
            const item = [...document.querySelectorAll('.settings-item')].find((el) => el.textContent?.trim() === 'Packages')
            if (!(item instanceof HTMLElement)) return false
            item.click()
            return true
          })()`).catch(() => false))) fail('ticket-64 stage: the Packages nav item is missing')
          if (!(await waitForProbe(win, `document.querySelector('.packages-install-input') !== null`, 5_000))) {
            fail('ticket-64 stage: the Packages section never rendered its install row')
          }
          log('packages_section_open_ok')

          // ② The honest empty state: the sandbox settings are empty.
          if (!(await waitForProbe(
            win,
            `[...document.querySelectorAll('.settings-card')].some((card) => card.textContent?.includes('No packages installed'))`,
            5_000
          ))) {
            fail('ticket-64 stage: the global card never showed the empty state')
          }
          log('packages_empty_state_ok')

          // ③ Install the local-path package through the op host: the row
          // appears (Local badge + counts) AND the sandbox settings.json
          // gains the entry — the same landing zone pi install writes.
          if (!(await js(`(() => {
            const input = document.querySelector('.settings-card .packages-install-input')
            if (!(input instanceof HTMLInputElement)) return false
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
            setter.call(input, ${JSON.stringify(pkgRoot)})
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`).catch(() => false))) fail('ticket-64 stage: the global install input is missing')
          if (!(await js(`(() => {
            const btn = document.querySelector('.settings-card .packages-install-btn')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`).catch(() => false))) fail('ticket-64 stage: the global Install button is missing')
          const rowFor = (source: string): string => `(() => {
            const row = document.querySelector('.skill-row[data-package-source="${source}"]')
            if (!(row instanceof HTMLElement)) return null
            const toggle = row.querySelector('.skill-switch')
            return {
              present: true,
              enabled: toggle?.getAttribute('aria-checked') ?? null,
              badges: [...row.querySelectorAll('.skill-badge')].map((b) => b.textContent ?? ''),
              counts: row.querySelector('.packages-counts')?.textContent ?? null
            }
          })()`
          type PkgRowSig = { present: boolean; enabled: string | null; badges: string[]; counts: string | null } | null
          let pkgRow: PkgRowSig = null
          for (let waited = 0; waited < 20_000 && pkgRow === null; waited += 250) {
            pkgRow = (await js(rowFor(relPkg)).catch(() => null)) as PkgRowSig
            if (pkgRow === null) await new Promise((r) => setTimeout(r, 250))
          }
          if (pkgRow === null) fail(`ticket-64 stage: the installed package row never appeared (${pkgRoot} as ${relPkg})`)
          if (!pkgRow!.badges.some((b) => b.toLowerCase() === 'local')) fail('ticket-64 stage: the local install is not badged Local')
          if (!pkgRow!.counts?.includes('1 extension') || !pkgRow!.counts?.includes('1 skill') || !pkgRow!.counts?.includes('1 prompt')) {
            fail(`ticket-64 stage: the package component counts are wrong (${String(pkgRow!.counts)})`)
          }
          const written = readSettingsTolerant(sandboxSettings) as { packages?: unknown[] }
          if (!Array.isArray(written.packages) || !written.packages.includes(relPkg)) {
            fail('ticket-64 stage: the install never wrote the sandbox settings.json (pi install landing zone)')
          }
          log('packages_install_ok', relPkg)

          // ④ Toggle OFF: the entry becomes the canonical all-[] object —
          // the pi-config "load nothing" shape — and the row says Disabled.
          await js(`(() => {
            const row = document.querySelector('.skill-row[data-package-source="${relPkg}"] .skill-switch')
            if (!(row instanceof HTMLElement)) return false
            row.click()
            return true
          })()`)
          let offWritten = false
          for (let waited = 0; waited < 10_000 && !offWritten; waited += 250) {
            const flipped = (await js(rowFor(relPkg)).catch(() => null)) as PkgRowSig
            const doc = readSettingsTolerant(sandboxSettings) as { packages?: Array<Record<string, unknown>> }
            const entry = Array.isArray(doc.packages) ? (doc.packages[0] as Record<string, unknown> | undefined) : undefined
            offWritten =
              flipped?.enabled === 'false' &&
              entry !== undefined &&
              Array.isArray(entry['extensions']) && (entry['extensions'] as unknown[]).length === 0 &&
              Array.isArray(entry['skills']) && (entry['skills'] as unknown[]).length === 0 &&
              Array.isArray(entry['prompts']) && (entry['prompts'] as unknown[]).length === 0 &&
              Array.isArray(entry['themes']) && (entry['themes'] as unknown[]).length === 0
            if (!offWritten) await new Promise((r) => setTimeout(r, 250))
          }
          if (!offWritten) fail('ticket-64 stage: the disable toggle never wrote the all-[] pi-config shape')
          log('packages_toggle_off_ok')

          // ⑤ Toggle ON: back to the plain string form.
          await js(`(() => {
            const row = document.querySelector('.skill-row[data-package-source="${relPkg}"] .skill-switch')
            if (!(row instanceof HTMLElement)) return false
            row.click()
            return true
          })()`)
          let onWritten = false
          for (let waited = 0; waited < 10_000 && !onWritten; waited += 250) {
            const flipped = (await js(rowFor(relPkg)).catch(() => null)) as PkgRowSig
            const doc = readSettingsTolerant(sandboxSettings) as { packages?: unknown[] }
            onWritten = flipped?.enabled === 'true' && Array.isArray(doc.packages) && doc.packages.includes(relPkg)
            if (!onWritten) await new Promise((r) => setTimeout(r, 250))
          }
          if (!onWritten) fail('ticket-64 stage: the enable toggle never restored the string form')
          log('packages_toggle_on_ok')

          // ⑥ Remove through the two-step confirm: the entry leaves the
          // sandbox settings.json and the row leaves the list.
          await js(`(() => {
            const row = document.querySelector('.skill-row[data-package-source="${relPkg}"]')
            const btn = row?.querySelector('button[aria-label^="Remove "]')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          if (!(await waitForProbe(
            win,
            `document.querySelector('.skill-row[data-package-source="${relPkg}"] .skill-confirm') !== null`,
            3_000
          ))) {
            fail('ticket-64 stage: the remove confirm strip never opened')
          }
          await js(`(() => {
            const strip = document.querySelector('.skill-row[data-package-source="${relPkg}"] .skill-confirm')
            const btn = strip?.querySelector('.skill-confirm-delete')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          let removed = false
          for (let waited = 0; waited < 10_000 && !removed; waited += 250) {
            const row = (await js(rowFor(relPkg)).catch(() => null)) as PkgRowSig
            const doc = readSettingsTolerant(sandboxSettings) as { packages?: unknown[] }
            removed = row === null && (!Array.isArray(doc.packages) || doc.packages.length === 0)
            if (!removed) await new Promise((r) => setTimeout(r, 250))
          }
          if (!removed) fail('ticket-64 stage: the package never left the list and the settings file')
          log('packages_remove_ok')

          // ⑦ The PROJECT layer: the sandbox project's row renders, the
          // banner states Pi is not loading the project's resources, and
          // every project action is LOCKED (untrusted → the gate pi itself
          // applies to project writes).
          const projectRowSel = `.skill-row[data-package-source="${projectPkgRoot}"]`
          if (!(await waitForProbe(win, `document.querySelector('${projectRowSel}') !== null`, 20_000))) {
            fail(`ticket-64 stage: the project package row never appeared (${projectPkgRoot})`)
          }
          const bannerText = (await js(
            `document.querySelector('.packages-untrusted-banner')?.textContent ?? ''`
          )) as string
          if (!bannerText.includes('not loaded by Pi') || !bannerText.includes('/trust')) {
            fail(`ticket-64 stage: the untrusted banner is missing or wrong (${JSON.stringify(bannerText)})`)
          }
          const projectLocked = (await js(`(() => {
            const cards = [...document.querySelectorAll('.settings-card')]
            const card = cards.find((c) => c.querySelector('.settings-card-head-title')?.textContent === 'Project packages')
            if (!(card instanceof HTMLElement)) return null
            return {
              inputDisabled: card.querySelector('.packages-install-input')?.hasAttribute('disabled') ?? false,
              chip: card.querySelector('.settings-card-head .skill-badge')?.textContent ?? '',
              toggleDisabled: card.querySelector('.skill-switch')?.hasAttribute('disabled') ?? false
            }
          })()`)) as { inputDisabled: boolean; chip: string; toggleDisabled: boolean } | null
          if (projectLocked === null) fail('ticket-64 stage: the project card is missing')
          if (!projectLocked!.inputDisabled || !projectLocked!.toggleDisabled) {
            fail('ticket-64 stage: the untrusted project actions are not locked')
          }
          if (projectLocked!.chip !== 'Not trusted') {
            fail(`ticket-64 stage: the project trust chip is wrong (${JSON.stringify(projectLocked!.chip)})`)
          }
          log('packages_project_untrusted_ok')

          // ⑧ Escape closes the settings window.
          await js(`(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
            return true
          })()`)
          if (!(await waitForProbe(win, `document.querySelector('.settings-shell') === null`, 5_000))) {
            fail('ticket-64 stage: Escape never closed the settings window')
          }
          log('packages_esc_close_ok')
        })

        // THE RED LINE: zero trust.json writes — byte-identical (or still
        // absent) across the whole stage.
        const trustJsonAfter = existsSync(sandboxTrust) ? readFileSync(sandboxTrust, 'utf-8') : null
        if (trustJsonBefore !== trustJsonAfter) {
          fail('ticket-64 stage: THE RED LINE — the app wrote trust.json')
        }
        log('packages_trust_json_untouched_ok')
      } finally {
        // Sandbox hygiene: everything this stage created lives in throwaway
        // dirs (the wrapper deletes the agent dir on exit).
        rmSync(pkgRoot, { recursive: true, force: true })
        rmSync(projectDir, { recursive: true, force: true })
        rmSync(projectPkgRoot, { recursive: true, force: true })
        rmSync(sandboxSettings, { force: true })
      }
      log('packages_stage_done')
    }

    // ---- ticket 89: the MCP section — dual cards + source badges + the
    // disabled-flag write + add/edit/delete in the correct layer + the
    // per-layer open-config entries + the FULL OAuth flow through the
    // session host bridge (mock OAuth server + a recording `open` shim +
    // the manual paste fallback) + the zero-write red lines ----
    log('settings_mcp_start')
    {
      const sandboxAgent = process.env['PICODE_PI_AGENT_DIR']
      if (sandboxAgent === undefined || sandboxAgent.trim() === '') {
        fail('ticket-89 stage: PICODE_PI_AGENT_DIR is not set — the MCP stage refuses to touch the real agent dir')
      }
      const agentDir = sandboxAgent!
      // The ADAPTER seeding: the OAuth flow runs the pi-mcp-adapter's own
      // /mcp-auth command INSIDE the session host, so the sandbox agent dir
      // must carry the real installed package (symlinked from the real
      // agent's npm root — deps resolve through the real paths) and a
      // packages entry. PI_OFFLINE guarantees no install/network attempt:
      // the symlinked directory satisfies the version check offline.
      const realAdapter = path.join(homedir(), '.pi', 'agent', 'npm', 'node_modules', 'pi-mcp-adapter')
      if (!existsSync(path.join(realAdapter, 'package.json'))) {
        fail(`ticket-89 stage: the pi-mcp-adapter package is not installed at ${realAdapter} — install it (pi install npm:pi-mcp-adapter) and rerun`)
      }
      const sandboxNpmRoot = path.join(agentDir, 'npm', 'node_modules')
      mkdirSync(sandboxNpmRoot, { recursive: true })
      const sandboxAdapter = path.join(sandboxNpmRoot, 'pi-mcp-adapter')
      if (!existsSync(sandboxAdapter)) symlinkSync(realAdapter, sandboxAdapter)
      const sandboxSettings = path.join(agentDir, 'settings.json')
      try {
        const current = JSON.parse(readFileSync(sandboxSettings, 'utf-8')) as { packages?: string[] }
        const packages = new Set<string>(['npm:pi-mcp-adapter', ...(Array.isArray(current.packages) ? current.packages : [])])
        writeFileSync(sandboxSettings, JSON.stringify({ ...current, packages: [...packages] }, null, 2))
      } catch {
        writeFileSync(sandboxSettings, JSON.stringify({ packages: ['npm:pi-mcp-adapter'] }, null, 2))
      }
      const previousOffline = process.env['PI_OFFLINE']
      process.env['PI_OFFLINE'] = '1'

      // The home sandbox: the global shared layers (~/.config/mcp/mcp.json,
      // ~/.agents/*) and the EXTERNAL host-tool configs resolve through
      // PICODE_MCP_HOME — the operator's real home is never read-written.
      const mcpBase = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-mcpbase-'))
      const mcpHome = path.join(mcpBase, 'mcp-home')
      const previousMcpHome = process.env['PICODE_MCP_HOME']
      mkdirSync(mcpHome, { recursive: true })
      process.env['PICODE_MCP_HOME'] = mcpHome

      // ---- Seed: the global shared config (one shared server), the Pi
      // global override (one Pi-owned server, disabled in the project), the
      // project .mcp.json (one OAuth-capable server for the auth flow) —
      // plus the EXTERNAL host-tool configs that must stay byte-identical.
      const globalSharedDir = path.join(mcpHome, '.config', 'mcp')
      mkdirSync(globalSharedDir, { recursive: true })
      const globalShared = path.join(globalSharedDir, 'mcp.json')
      writeFileSync(globalShared, JSON.stringify({ mcpServers: { 'shared-search': { command: 'shared-search-bin', env: { KEY: 'global' } } } }))
      const agentsFile = path.join(mcpHome, '.agents', 'mcp.json')
      mkdirSync(path.dirname(agentsFile), { recursive: true })
      writeFileSync(agentsFile, JSON.stringify({ mcpServers: { 'agents-server': { command: 'agents-bin' } } }))
      const piGlobal = path.join(agentDir, 'mcp.json')
      writeFileSync(piGlobal, JSON.stringify({ mcpServers: { 'pi-only': { command: 'pi-only-bin' } } }))

      const mcpProject = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-mcpproject-'))
      const projectShared = path.join(mcpProject, '.mcp.json')
      const projectPi = path.join(mcpProject, '.pi', 'mcp.json')
      mkdirSync(path.dirname(projectPi), { recursive: true })
      writeFileSync(projectShared, JSON.stringify({ mcpServers: { 'shared-search': { args: ['--fast'] }, 'repo-tools': { command: 'node', args: ['tools/repo-mcp.js'] } } }))
      writeFileSync(projectPi, JSON.stringify({ settings: { oauthCredentialStore: 'encrypted-file' }, mcpServers: { 'pi-only': { disabled: true } } }))

      // The EXTERNAL host-tool configs (the red line): byte-identical at
      // the end of the stage, no matter what the operator does in the UI.
      const externalFiles: Record<string, string> = {
        cursor: path.join(mcpHome, '.cursor', 'mcp.json'),
        claude: path.join(mcpHome, '.claude', 'mcp.json')
      }
      for (const file of Object.values(externalFiles)) {
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, JSON.stringify({ mcpServers: { external: { command: 'ext-bin' } } }))
      }
      const externalBefore = Object.fromEntries(Object.entries(externalFiles).map(([k, f]) => [k, readFileSync(f, 'utf-8')]))

      // ---- The OAuth mock server: protected-resource + authorization-
      // server metadata, dynamic client registration, authorize → 302
      // callback, token exchange, and a minimal streamable-HTTP MCP
      // endpoint (the adapter RECONNECTS after a successful auth).
      const mockPort = await listenMockOAuth()
      const mockUrl = `http://127.0.0.1:${mockPort}`
      writeFileSync(projectShared, JSON.stringify({
        mcpServers: {
          'shared-search': { args: ['--fast'] },
          'repo-tools': { command: 'node', args: ['tools/repo-mcp.js'] },
          'mock-oauth': { url: `${mockUrl}/mcp`, auth: 'oauth' }
        }
      }))

      // ---- The `open` shim: PATH-prepended, records every URL and (when
      // PICODE_OAUTH_AUTOCOMPLETE is set) COMPLETES the flow by hitting the
      // authorize endpoint like a browser would. The adapter's `open`
      // package spawns `open` through PATH on macOS/Linux.
      const openBin = path.join(mcpHome, 'open-bin')
      mkdirSync(openBin, { recursive: true })
      const openLog = path.join(openBin, 'open.log')
      const openShim = path.join(openBin, 'open')
      writeFileSync(openShim, [
        '#!/bin/sh',
        `echo "$*" >> ${JSON.stringify(openLog)}`,
        'if [ -n "$PICODE_OAUTH_AUTOCOMPLETE" ]; then',
        '  for arg in "$@"; do',
        '    case "$arg" in',
        '      http://*|https://*) curl -s -o /dev/null -L "$arg" ;;',
        '    esac',
        '  done',
        'fi',
        'exit 0'
      ].join('\n'))
      chmodSync(openShim, 0o755)
      const realPath = process.env['PATH'] ?? ''
      process.env['PATH'] = `${openBin}:${realPath}`
      // The adapter's OAuth storage (sandbox; the real keychain/config is
      // never touched by the smoke): encrypted-file store + a throwaway
      // key (the adapter's documented headless mode) + a free callback port.
      const oauthDir = path.join(mcpBase, 'mcp-oauth')
      process.env['MCP_OAUTH_DIR'] = oauthDir
      process.env['MCP_OAUTH_CALLBACK_PORT'] = String(await freePort())
      process.env['PI_MCP_ADAPTER_OAUTH_FILE_KEY'] = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
      process.env['PI_MCP_ADAPTER_OAUTH_FILE_KEY'] = Buffer.from(process.env['PI_MCP_ADAPTER_OAUTH_FILE_KEY'].slice(0, 64), 'hex').toString('base64')

      try {
        await withWindow(getWindow, async (win) => {
          const js = (script: string) => win.webContents.executeJavaScript(script)

          // ① A session scoped to the MCP project focuses it — the settings
          // window's MCP request then carries the project cwd.
          supervisor.createSession(mcpProject)
          await waitFor((e) => e.type === 'session_created' && e.cwd === mcpProject, 'mcp session_created')

          // ② Open settings, navigate to MCP.
          await js(`(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Comma', key: ',', metaKey: true, cancelable: true }))
            return true
          })()`)
          if (!(await waitForProbe(win, `document.querySelector('.settings-shell') !== null`, 5_000))) {
            fail('ticket-89 stage: ⌘, never opened the settings window')
          }
          if (!(await js(`(() => {
            const item = [...document.querySelectorAll('.settings-item')].find((el) => el.textContent?.trim() === 'MCP')
            if (!(item instanceof HTMLElement)) return false
            item.click()
            return true
          })()`).catch(() => false))) fail('ticket-89 stage: the MCP nav item is missing')
          if (!(await waitForProbe(win, `document.querySelector('[data-mcp-section]') !== null`, 5_000))) {
            fail('ticket-89 stage: the MCP section never rendered')
          }
          log('mcp_section_open_ok')

          // ③ Dual cards render with the merged effective rows and their
          // source badges: shared-search wins in the PROJECT shared layer
          // (2 layers), pi-only in the Pi global layer but DISABLED via the
          // project flag, repo-tools only in the project, agents-server in
          // the cross-tool .agents file (read-only badge).
          if (!(await waitForProbe(
            win,
            `document.querySelector('[data-mcp-server="shared-search"]') !== null && document.querySelector('[data-mcp-server="pi-only"]') !== null && document.querySelector('[data-mcp-server="repo-tools"]') !== null && document.querySelector('[data-mcp-server="agents-server"]') !== null`,
            10_000
          ))) {
            const diag = (await js(`[...document.querySelectorAll('.skill-row')].map((r) => r.dataset['mcpServer'])`).catch(() => null)) as string[] | null
            fail(`ticket-89 stage: the merged rows never appeared (diag=${JSON.stringify(diag)})`)
          }
          const rowSigs = (await js(`(() => {
            const sig = (name) => {
              const row = document.querySelector('[data-mcp-server="' + name + '"]')
              if (!(row instanceof HTMLElement)) return null
              const card = row.closest('.settings-card')
              return {
                card: card?.querySelector('.settings-card-head-title')?.textContent ?? null,
                badges: [...row.querySelectorAll('.skill-badge')].map((b) => b.textContent ?? ''),
                summary: row.querySelector('.settings-mcp-summary')?.textContent ?? null,
                enabled: row.querySelector('.skill-switch')?.getAttribute('aria-checked') ?? null
              }
            }
            return {
              sharedSearch: sig('shared-search'),
              piOnly: sig('pi-only'),
              repoTools: sig('repo-tools'),
              agentsServer: sig('agents-server')
            }
          })()`)) as {
            sharedSearch: { card: string | null; badges: string[]; summary: string | null; enabled: string | null } | null
            piOnly: { card: string | null; badges: string[]; summary: string | null; enabled: string | null } | null
            repoTools: { card: string | null; badges: string[]; summary: string | null; enabled: string | null } | null
            agentsServer: { card: string | null; badges: string[]; summary: string | null; enabled: string | null } | null
          }
          if (rowSigs.sharedSearch === null || rowSigs.piOnly === null || rowSigs.repoTools === null || rowSigs.agentsServer === null) {
            fail('ticket-89 stage: the merged row signatures are missing')
          }
          // The dual-card split follows the winning layer's scope.
          if (rowSigs.sharedSearch.card !== 'Project servers') fail(`ticket-89 stage: shared-search belongs in the project card (got ${String(rowSigs.sharedSearch.card)})`)
          if (rowSigs.piOnly.card !== 'Global servers') fail(`ticket-89 stage: pi-only belongs in the global card (got ${String(rowSigs.piOnly.card)})`)
          if (rowSigs.repoTools.card !== 'Project servers') fail(`ticket-89 stage: repo-tools belongs in the project card (got ${String(rowSigs.repoTools.card)})`)
          // Source badges: the winner + the multi-layer story.
          if (!rowSigs.sharedSearch.badges.some((b) => b === 'Project shared')) fail(`ticket-89 stage: shared-search lacks the winner badge (badges=${JSON.stringify(rowSigs.sharedSearch.badges)})`)
          if (!rowSigs.sharedSearch.badges.some((b) => b === '2 layers')) fail(`ticket-89 stage: shared-search lacks the layered badge (badges=${JSON.stringify(rowSigs.sharedSearch.badges)})`)
          if (!rowSigs.agentsServer.badges.some((b) => b.includes('read-only'))) fail(`ticket-89 stage: the .agents winner is not marked read-only (badges=${JSON.stringify(rowSigs.agentsServer.badges)})`)
          // The merged effective view: shared-search = command from global +
          // args from project; the disable flag beat the Pi-global entry.
          if (rowSigs.sharedSearch.summary !== 'shared-search-bin --fast') fail(`ticket-89 stage: the merged summary is wrong (got ${JSON.stringify(rowSigs.sharedSearch.summary)})`)
          if (rowSigs.piOnly.enabled !== 'false') fail(`ticket-89 stage: pi-only is not shown disabled`)
          log('mcp_cards_badges_ok')

          // ④ The enable/disable switch writes ONLY the disabled flag into
          // the project Pi override (enable: the flag drops, because the
          // lower layer is not disabled).
          if (!(await js(`(() => {
            const row = document.querySelector('[data-mcp-server="pi-only"]')
            if (!(row instanceof HTMLElement)) return false
            const sw = row.querySelector('.skill-switch')
            if (!(sw instanceof HTMLElement)) return false
            sw.click()
            return true
          })()`).catch(() => false))) fail('ticket-89 stage: the pi-only switch is missing')
          let flagOk = false
          for (let waited = 0; waited < 5_000 && !flagOk; waited += 100) {
            flagOk = existsSync(projectPi) && !JSON.stringify(JSON.parse(readFileSync(projectPi, 'utf-8'))).includes('disabled')
            if (!flagOk) await new Promise((r) => setTimeout(r, 100))
          }
          if (!flagOk) fail(`ticket-89 stage: the enable never removed the flag from ${projectPi}`)
          log('mcp_enable_flag_ok', projectPi)

          // Disable again → the flag returns.
          await js(`(() => {
            const row = document.querySelector('[data-mcp-server="pi-only"]')
            if (!(row instanceof HTMLElement)) return false
            row.querySelector('.skill-switch')?.click()
            return true
          })()`)
          flagOk = false
          for (let waited = 0; waited < 5_000 && !flagOk; waited += 100) {
            flagOk = existsSync(projectPi) && JSON.stringify(JSON.parse(readFileSync(projectPi, 'utf-8'))).includes('"disabled": true')
            if (!flagOk) await new Promise((r) => setTimeout(r, 100))
          }
          if (!flagOk) fail(`ticket-89 stage: the disable never wrote the flag to ${projectPi}`)
          log('mcp_disable_flag_ok', projectPi)

          // ⑤ Add a server through the form → lands in the GLOBAL shared
          // config (the /mcp setup target).
          await js(`(() => {
            const cards = [...document.querySelectorAll('.settings-card')]
            const card = cards.find((c) => c.querySelector('.settings-card-head-title')?.textContent === 'Global servers')
            const btn = card?.querySelector('.settings-skills-toolbar .settings-skills-refresh')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          if (!(await waitForProbe(win, `document.querySelector('[data-mcp-form="add"]') !== null`, 5_000))) {
            fail('ticket-89 stage: the add form never opened')
          }
          await js(`(() => {
            const form = document.querySelector('[data-mcp-form="add"]')
            if (!(form instanceof HTMLElement)) return false
            const input = form.querySelector('input[aria-label="Server name"]')
            if (!(input instanceof HTMLInputElement)) return false
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            setter.call(input, 'added-server')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`)
          await js(`(() => {
            const form = document.querySelector('[data-mcp-form="add"]')
            if (!(form instanceof HTMLElement)) return false
            const input = form.querySelector('input[aria-label="Command"]')
            if (!(input instanceof HTMLInputElement)) return false
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            setter.call(input, 'added-bin')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`)
          await js(`(() => {
            const form = document.querySelector('[data-mcp-form="add"]')
            if (!(form instanceof HTMLElement)) return false
            const btn = [...form.querySelectorAll('button')].find((b) => b.textContent === 'Add server')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          let addOk = false
          for (let waited = 0; waited < 5_000 && !addOk; waited += 100) {
            addOk = existsSync(globalShared) && JSON.stringify(JSON.parse(readFileSync(globalShared, 'utf-8'))).includes('added-server')
            if (!addOk) await new Promise((r) => setTimeout(r, 100))
          }
          if (!addOk) fail(`ticket-89 stage: the add never wrote ${globalShared}`)
          const addedDoc = JSON.parse(readFileSync(globalShared, 'utf-8')) as { mcpServers?: Record<string, { command?: string }> }
          if (addedDoc.mcpServers?.['added-server']?.command !== 'added-bin') fail(`ticket-89 stage: the added entry is malformed: ${readFileSync(globalShared, 'utf-8')}`)
          log('mcp_add_global_ok', globalShared)

          // ⑥ Edit the added server in place (the winning layer file).
          await js(`(() => {
            const row = document.querySelector('[data-mcp-server="added-server"]')
            if (!(row instanceof HTMLElement)) return false
            row.querySelector('button[aria-label="Edit added-server"]')?.click()
            return true
          })()`)
          if (!(await waitForProbe(win, `document.querySelector('[data-mcp-form="edit"]') !== null`, 5_000))) {
            fail('ticket-89 stage: the edit form never opened')
          }
          await js(`(() => {
            const form = document.querySelector('[data-mcp-form="edit"]')
            if (!(form instanceof HTMLElement)) return false
            const input = form.querySelector('input[aria-label="Command"]')
            if (!(input instanceof HTMLInputElement)) return false
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            setter.call(input, 'edited-bin')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`)
          await js(`(() => {
            const form = document.querySelector('[data-mcp-form="edit"]')
            if (!(form instanceof HTMLElement)) return false
            const btn = [...form.querySelectorAll('button')].find((b) => b.textContent === 'Save changes')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          let editOk = false
          for (let waited = 0; waited < 5_000 && !editOk; waited += 100) {
            editOk = existsSync(globalShared) && JSON.stringify(JSON.parse(readFileSync(globalShared, 'utf-8'))).includes('edited-bin')
            if (!editOk) await new Promise((r) => setTimeout(r, 100))
          }
          if (!editOk) fail(`ticket-89 stage: the edit never rewrote ${globalShared}`)
          log('mcp_edit_global_ok')

          // ⑦ Delete the added server (the confirmation names the file).
          await js(`(() => {
            const row = document.querySelector('[data-mcp-server="added-server"]')
            if (!(row instanceof HTMLElement)) return false
            row.querySelector('button[aria-label="Delete added-server"]')?.click()
            return true
          })()`)
          if (!(await waitForProbe(win, `document.querySelector('.skill-confirm') !== null`, 5_000))) {
            fail('ticket-89 stage: the delete confirmation never opened')
          }
          await js(`(() => {
            const confirm = document.querySelector('.skill-confirm')
            if (!(confirm instanceof HTMLElement)) return false
            const btn = [...confirm.querySelectorAll('button')].find((b) => b.textContent === 'Remove server')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          let removeOk = false
          for (let waited = 0; waited < 5_000 && !removeOk; waited += 100) {
            removeOk = existsSync(globalShared) && !JSON.stringify(JSON.parse(readFileSync(globalShared, 'utf-8'))).includes('added-server')
            if (!removeOk) await new Promise((r) => setTimeout(r, 100))
          }
          if (!removeOk) fail(`ticket-89 stage: the remove never cleaned ${globalShared}`)
          log('mcp_remove_ok')

          // ⑧ The per-layer open-config entries resolve to the layer files
          // (the reveal IPC answers with the resolved target).
          const layerReveal = (await js(`(() => {
            const card = [...document.querySelectorAll('.settings-card')].find((c) => c.querySelector('.settings-card-head-title')?.textContent === 'Global servers')
            if (!(card instanceof HTMLElement)) return null
            const layer = [...card.querySelectorAll('.settings-mcp-layers .settings-mcp-layer')].find((b) => b.textContent?.includes('Global shared'))
            if (!(layer instanceof HTMLElement)) return null
            return layer.title
          })()`)) as string | null
          if (layerReveal !== path.join(mcpHome, '.config/mcp/mcp.json')) {
            fail(`ticket-89 stage: the global shared layer entry points at ${String(layerReveal)}`)
          }
          log('mcp_layer_entries_ok')

          // ⑨ THE OAUTH FLOW — auto-completion path. The shim `open`s the
          // authorize URL, the curl inside it completes the browser leg
          // (the paste dialog stays open — the callback wins the race, the
          // TUI behavior), the adapter's callback server takes over, the
          // token exchange runs against the mock (encrypted-file store in
          // the sandbox — the real keychain is never touched), and the
          // reconnect hits the mock MCP endpoint. PiCode surfaces notices.
          process.env['PICODE_OAUTH_AUTOCOMPLETE'] = '1'
          rmSync(oauthDir, { recursive: true, force: true })
          rmSync(openLog, { force: true })
          await js(`(() => {
            const row = document.querySelector('[data-mcp-server="mock-oauth"]')
            if (!(row instanceof HTMLElement)) return false
            const btn = row.querySelector('button[aria-label="Authenticate mock-oauth"]')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          let authOk = false
          for (let waited = 0; waited < 45_000 && !authOk; waited += 250) {
            const status = (await js(`document.querySelector('[data-mcp-auth-status]')?.textContent ?? null`).catch(() => null)) as string | null
            authOk = status !== null && status.includes('OAuth authentication successful')
            if (!authOk) await new Promise((r) => setTimeout(r, 250))
          }
          if (!authOk) {
            const diag = (await js(`document.querySelector('[data-mcp-auth-status]')?.textContent ?? '(no status)'`).catch(() => '(none)')) as string
            fail(`ticket-89 stage: the OAuth auto-completion flow never succeeded (diag=${diag}; open log=${existsSync(openLog) ? readFileSync(openLog, 'utf-8') : '(empty)'})`)
          }
          // The browser-open assertion: the shim recorded the authorize URL.
          const openLines = existsSync(openLog) ? readFileSync(openLog, 'utf-8').trim().split('\n') : []
          if (!openLines.some((line) => line.includes(mockUrl))) {
            fail(`ticket-89 stage: the authorize URL was never opened externally (log=${JSON.stringify(openLines)})`)
          }
          log('mcp_oauth_autocomplete_ok', mockUrl)

          // ⑩ The manual paste fallback: a fresh flow where the shim only
          // RECORDS (no browser leg) — the paste dialog appears, the smoke
          // completes the authorize handshake itself, pastes the callback
          // URL, and the flow finishes.
          process.env['PICODE_OAUTH_AUTOCOMPLETE'] = ''
          rmSync(oauthDir, { recursive: true, force: true })
          rmSync(openLog, { force: true })
          await js(`(() => {
            const row = document.querySelector('[data-mcp-server="mock-oauth"]')
            if (!(row instanceof HTMLElement)) return false
            row.querySelector('button[aria-label="Authenticate mock-oauth"]')?.click()
            return true
          })()`)
          if (!(await waitForProbe(win, `document.querySelector('[data-mcp-paste]') !== null`, 30_000))) {
            const diag = (await js(`document.querySelector('[data-mcp-auth-status]')?.textContent ?? '(no status)'`).catch(() => '(none)')) as string
            fail(`ticket-89 stage: the manual paste dialog never appeared (diag=${diag})`)
          }
          log('mcp_paste_dialog_ok')
          // Complete the authorize handshake like a browser would (redirect
          // to the localhost callback with a fresh code), paste the URL.
          // The adapter's title carries the URL inside an OSC-8 terminal
          // hyperlink (ESC]8;;URL ESC\ label ESC]8;; ESC\) — strip the
          // escapes first, then take the http(s) lines.
          const pasteUrl = (await js(`document.querySelector('[data-mcp-paste] .settings-mcp-paste-title')?.textContent ?? null`)) as string | null
          if (pasteUrl === null) fail('ticket-89 stage: the paste dialog lost the authorization title')
          const cleanTitle = pasteUrl!.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
          const urlCandidates = cleanTitle.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('http://') || line.startsWith('https://'))
          if (urlCandidates.length === 0) fail(`ticket-89 stage: no authorization URL in the paste dialog title (title=${JSON.stringify(pasteUrl)})`)
          const callbackUrl = await completeAuthorize(urlCandidates[urlCandidates.length - 1]!, mockUrl)
          await js(`(() => {
            const paste = document.querySelector('[data-mcp-paste]')
            if (!(paste instanceof HTMLElement)) return false
            const input = paste.querySelector('input[aria-label="Paste the OAuth callback URL"]')
            if (!(input instanceof HTMLInputElement)) return false
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            setter.call(input, ${JSON.stringify(callbackUrl)})
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`)
          await js(`(() => {
            const paste = document.querySelector('[data-mcp-paste]')
            if (!(paste instanceof HTMLElement)) return false
            const btn = [...paste.querySelectorAll('button')].find((b) => b.textContent === 'Complete')
            if (!(btn instanceof HTMLElement)) return false
            btn.click()
            return true
          })()`)
          let manualOk = false
          for (let waited = 0; waited < 45_000 && !manualOk; waited += 250) {
            const status = (await js(`document.querySelector('[data-mcp-auth-status]')?.textContent ?? null`).catch(() => null)) as string | null
            manualOk = status !== null && status.includes('OAuth authentication successful')
            if (!manualOk) await new Promise((r) => setTimeout(r, 250))
          }
          if (!manualOk) {
            const diag = (await js(`document.querySelector('[data-mcp-auth-status]')?.textContent ?? '(no status)'`).catch(() => '(none)')) as string
            fail(`ticket-89 stage: the manual paste flow never succeeded (diag=${diag})`)
          }
          log('mcp_oauth_manual_paste_ok')

          // ⑪ RED LINES: the external host-tool configs are byte-identical;
          // the OAuth tokens live ONLY in the adapter's own storage (under
          // MCP_OAUTH_DIR) — zero token material in ANY PiCode-owned file.
          for (const [key, file] of Object.entries(externalFiles)) {
            if (readFileSync(file, 'utf-8') !== externalBefore[key]!) {
              fail(`ticket-89 stage: the external host config ${file} was written — the red line is broken`)
            }
          }
          log('mcp_external_zero_write_ok')
          const picodeSettingsFile = path.join(app.getPath('userData'), 'picode-settings.json')
          const picodeOwned = [
            existsSync(picodeSettingsFile) ? readFileSync(picodeSettingsFile, 'utf-8') : '',
            existsSync(piGlobal) ? readFileSync(piGlobal, 'utf-8') : '',
            existsSync(projectShared) ? readFileSync(projectShared, 'utf-8') : '',
            existsSync(projectPi) ? readFileSync(projectPi, 'utf-8') : ''
          ]
          if (picodeOwned.some((content) => content.includes('"access_token"') || content.includes('"refresh_token"'))) {
            fail('ticket-89 stage: OAuth token material leaked into a PiCode-owned file')
          }
          if (!existsSync(oauthDir)) fail('ticket-89 stage: the adapter stored no OAuth credentials at all (the flow was not real)')
          // The encrypted-file store keeps the tokens OUT of the operator's
          // keychain — verify no pi-mcp-adapter keychain entry was created.
          let keychainEntry = ''
          try {
            execFileSync('security', ['find-generic-password', '-s', 'pi-mcp-adapter.oauth'], { stdio: 'pipe' })
            keychainEntry = 'found'
          } catch {
            keychainEntry = ''
          }
          if (keychainEntry !== '') fail('ticket-89 stage: the smoke wrote an OAuth entry into the operator keychain — the sandbox leaked')
          log('mcp_credentials_zero_leak_ok')
        })
      } finally {
        // PATH + env hygiene for the later stages.
        process.env['PATH'] = realPath
        delete process.env['PICODE_OAUTH_AUTOCOMPLETE']
        delete process.env['MCP_OAUTH_DIR']
        delete process.env['PI_MCP_ADAPTER_OAUTH_FILE_KEY']
        delete process.env['MCP_OAUTH_CALLBACK_PORT']
        if (previousOffline === undefined) delete process.env['PI_OFFLINE']
        else process.env['PI_OFFLINE'] = previousOffline
        process.env['PICODE_MCP_HOME'] = previousMcpHome
        stopMockOAuth()
        rmSync(mcpProject, { recursive: true, force: true })
        rmSync(oauthDir, { recursive: true, force: true })
        rmSync(mcpBase, { recursive: true, force: true })
      }
      log('settings_mcp_done')
    }

    // ---- ticket 73: the New Task dead-end fix — from the new-task empty
    // state, ANY openable session-row click must land the main zone on the
    // target session. The already-focused and in-app branches used to leave
    // the empty state on screen (the operator's "clicked, nothing happened"
    // dead end); the resume and follow paths already cleared the state. All
    // four row classes are clicked out of the empty state here so the whole
    // guarantee is locked end to end (the gray-row explain-only path is the
    // ticket-54 stage's click, unchanged by design). ----
    log('newtask_switch_start')
    const store73 = process.env['PICODE_SESSION_DIR']
    if (!store73) fail('ticket-73 stage: PICODE_SESSION_DIR is not set')
    const seedProject73 = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-seed73-'))
    const QUIET_MARKER_73 = 'PICODE_73_RESUME quiet session'
    const FOLLOW_MARKER_73 = 'PICODE_73_FOLLOW running elsewhere'
    const seed73 = (file: string, id: string, userText: string): void => {
      const stamp = new Date().toISOString()
      writeFileSync(
        file,
        [
          JSON.stringify({ type: 'session', version: 3, id, timestamp: stamp, cwd: seedProject73 }),
          JSON.stringify({
            type: 'message',
            id: `${id}-u1`,
            parentId: null,
            timestamp: stamp,
            message: { role: 'user', content: [{ type: 'text', text: userText }] }
          })
        ].join('\n') + '\n'
      )
    }
    try {
      // One live in-app host with a settled turn — its file must exist for
      // the sidebar row. It plays the already-focused AND the in-app click
      // target; the resumed quiet session becomes the second in-app session
      // the in-app click needs.
      supervisor.createSession(cwd)
      const sw73 = (await waitFor((e) => e.type === 'session_created', 'ticket-73 host session_created')) as Extract<
        Scoped,
        { type: 'session_created' }
      >
      if (!sw73.sessionFile) fail('ticket-73 stage: the host session did not report its file')
      const sw73Pid = supervisor.pidForSession(sw73.sessionId)
      if (!sw73Pid) fail('ticket-73 stage: the host session pid is missing')
      supervisor.handleParentCommand({
        type: 'session_command',
        sessionId: sw73.sessionId,
        command: { type: 'prompt', text: 'Reply with exactly: PICODE_73_HOST' }
      })
      await waitFor((e) => e.type === 'agent_end' && e.sessionId === sw73.sessionId, 'ticket-73 host agent_end')

      // The resume target: a COPY of the host-written session file (a shape
      // the resume chain is proven to open) with the header id rewritten —
      // the resumed session must be a DISTINCT registry entry — and one
      // marked user turn appended. The header cwd is rewritten to the stage's
      // own fresh project too: it must exist (normal row, resume spawn target)
      // and a group of its own keeps the row above the ticket-39 Show-more
      // cut that the big smoke-cwd group paginates behind. Backdated mtime =
      // quiet (not TUI-live); no host here means the click takes the resume
      // branch.
      const quietFile73 = path.join(store73, 'quiet73.jsonl')
      {
        const base = readFileSync(sw73.sessionFile, 'utf8')
        const lines = base.split('\n')
        const header = JSON.parse(lines[0] ?? '{}') as { id?: string; cwd?: string }
        header.id = randomUUID()
        header.cwd = seedProject73
        lines[0] = JSON.stringify(header)
        const leafId = lastEntryId(base)
        const stamp = new Date().toISOString()
        lines.push(
          JSON.stringify({
            type: 'message',
            id: `t73q-${randomUUID().slice(0, 8)}`,
            parentId: leafId,
            timestamp: stamp,
            message: { role: 'user', content: [{ type: 'text', text: QUIET_MARKER_73 }] }
          })
        )
        writeFileSync(quietFile73, lines.join('\n'))
      }
      backdateMtime(quietFile73)
      // The follow target: seeded fresh — its mtime says a TUI is writing it
      // RIGHT NOW, so the click must take the Live Follow branch.
      const followFile73 = path.join(store73, 'follow73.jsonl')
      seed73(followFile73, randomUUID(), FOLLOW_MARKER_73)

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        // The settings stage may have left the sidebar closed — open with ⌘B
        // (press-until-present, the panel-stage pattern).
        const sidebarPresent = `(document.querySelector('.sidebar') !== null)`
        if (!((await js(sidebarPresent)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true })); true`)
          await waitForProbe(win, sidebarPresent, 5_000)
        }
        const hostRow73 = `[data-file="${sw73.sessionFile}"]`
        const quietRow73 = `[data-file="${quietFile73}"]`
        const followRow73 = `[data-file="${followFile73}"]`
        const rows73: Array<[string, string]> = [
          [hostRow73, 'host'],
          [quietRow73, 'quiet'],
          [followRow73, 'follow']
        ]
        for (const [row, label] of rows73) {
          if (!(await waitForProbe(win, `document.querySelector('${row}') !== null`, 15_000))) {
            fail(`ticket-73 stage: the ${label} row never reached the sidebar`)
          }
        }
        log('newtask_switch_rows_ok')

        /** ⌘N: the new-task empty state replaces the main zone. */
        const openNewTask73 = async (): Promise<void> => {
          await js(
            `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true })); true`
          )
          if (!(await waitForProbe(win, `document.querySelector('.empty-state') !== null`, 5_000))) {
            fail('ticket-73 stage: ⌘N never opened the new-task empty state')
          }
        }
        /** The empty state is gone AND the main zone shows the target
         * session's transcript with its row selected. The marker is probed
         * inside .msg-user — the sidebar row title carries the same text, so
         * a body-level probe would lie about WHERE it rendered. */
        const switchedTo73 = (row: string, marker: string): string =>
          `document.querySelector('.empty-state') === null &&
           [...document.querySelectorAll('.main-zone .msg-user')].some((n) => (n.textContent ?? '').includes(${JSON.stringify(marker)})) &&
           (document.querySelector('${row}')?.classList.contains('sb-task-active') ?? false)`
        const clickRow73 = async (row: string): Promise<void> => {
          await js(`document.querySelector('${row}')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        }

        // ① The ALREADY-FOCUSED row: the click must land back on the focused
        // session's view instead of dead-ending in the empty state.
        await openNewTask73()
        await clickRow73(hostRow73)
        if (!(await waitForProbe(win, switchedTo73(hostRow73, 'PICODE_73_HOST'), 10_000))) {
          fail('ticket-73 stage: clicking the focused row never left the new-task empty state (the dead end)')
        }
        log('newtask_switch_focused_ok')

        // ② The NON-IN-APP row (quiet, alive cwd): the resume path already
        // cleared the new-task state — a non-regression lock; the takeover
        // then completes into the resumed session's view.
        const resumed73 = waitFor(
          (e) => e.type === 'session_created' && e.sessionFile === quietFile73,
          'ticket-73 resume session_created'
        )
        await openNewTask73()
        await clickRow73(quietRow73)
        if (!(await waitForProbe(win, `document.querySelector('.empty-state') === null`, 5_000))) {
          fail('ticket-73 stage: the resume-path click never left the new-task empty state')
        }
        await resumed73
        if (!(await waitForProbe(win, switchedTo73(quietRow73, QUIET_MARKER_73), 15_000))) {
          fail('ticket-73 stage: the resumed session never took over the main zone')
        }
        log('newtask_switch_resume_ok')

        // ③ The IN-APP row (live host, NOT focused): a pure focus change —
        // same pid — that must ALSO leave the new-task state. This is the
        // fixed branch: a bare registry focus change used to keep the empty
        // state on screen.
        await openNewTask73()
        await clickRow73(hostRow73)
        if (!(await waitForProbe(win, switchedTo73(hostRow73, 'PICODE_73_HOST'), 10_000))) {
          fail('ticket-73 stage: clicking the in-app row never left the new-task empty state (the dead end)')
        }
        if (supervisor.pidForSession(sw73.sessionId) !== sw73Pid) {
          fail('ticket-73 stage: the in-app row click respawned the host — registry semantics broken')
        }
        log('newtask_switch_inapp_ok')

        // ④ The LIVE-ELSEWHERE row (fresh mtime, no host here): Live Follow —
        // the follow path already cleared the new-task state (non-regression
        // lock): the follow view replaces the empty state.
        await openNewTask73()
        await clickRow73(followRow73)
        if (
          !(await waitForProbe(
            win,
            `document.querySelector('.empty-state') === null && document.querySelector('.follow-badge') !== null`,
            10_000
          ))
        ) {
          fail('ticket-73 stage: the live-row click never opened Live Follow out of the new-task state')
        }
        log('newtask_switch_follow_ok')

        // ⑤ Pointing back at the focused row exits Follow (the highlight
        // follows back) — and the empty state stays gone.
        await clickRow73(hostRow73)
        if (
          !(await waitForProbe(
            win,
            `document.querySelector('.follow-badge') === null &&
             document.querySelector('.empty-state') === null &&
             (document.querySelector('${hostRow73}')?.classList.contains('sb-task-active') ?? false)`,
            10_000
          ))
        ) {
          fail('ticket-73 stage: clicking the focused row never exited Live Follow')
        }
        log('newtask_switch_follow_exit_ok')
      })
    } finally {
      rmSync(seedProject73, { recursive: true, force: true })
    }

    // ---- ticket 74: composer draft preservation — the typed-but-unsent
    // composer content (text + pasted images) survives every view switch:
    // per-session slots in the session view registry + the New Task single
    // slot at the App layer. Locked end to end here with two cheap real
    // turns carrying the send assertions: A/B drafts stay isolated across
    // pure focus switches (which ALSO used to leak the outgoing composer
    // into the incoming session — the same Composer instance simply stayed
    // mounted; the per-session view key breaks that), a pasted-image draft
    // round-trips with its thumbnail, the New Task draft survives
    // ⌘N → session → ⌘N and Escape, both send paths clear their slot
    // naturally (nothing resurrects), and a renderer reload (the restart
    // proxy, ticket-39/31 precedent) loses every draft — memory-level. ----
    log('draft_preserve_start')
    const store74 = process.env['PICODE_SESSION_DIR']
    if (!store74) fail('ticket-74 stage: PICODE_SESSION_DIR is not set')
    if (!created.sessionFile) fail('ticket-74 stage: no host-written session file to seed resume targets from')
    const seedProject74 = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-seed74-'))
    const DRAFT_A_74 = 'PICODE_74_DRAFT_A remember the milk'
    const DRAFT_B_74 = 'PICODE_74_DRAFT_B feed the cat'
    const NEWTASK_DRAFT_74 = 'PICODE_74_NEWTASK_DRAFT plan the garden'
    const SEND_TEXT_74 = 'Reply with exactly: PICODE_74_SENT'
    const NEWTASK_SEND_TEXT_74 = 'Reply with exactly: PICODE_74_SENT_NEWTASK'
    try {
      // Two resume targets: copies of the host-written session file (the
      // proven-openable shape, ticket-73 precedent) with distinct ids, the
      // stage's own fresh cwd (exists → normal rows; its own group → above
      // the ticket-39 Show-more cut) and one marked seed turn each.
      // Backdated mtimes = quiet; the first click on each takes the resume
      // branch (no model traffic — resume replays history).
      const template74 = readFileSync(created.sessionFile, 'utf8')
      const fileA74 = path.join(store74, 'draft74-a.jsonl')
      const fileB74 = path.join(store74, 'draft74-b.jsonl')
      const seedResumeTarget74 = (file: string, seedText: string): void => {
        const lines = template74.split('\n')
        const header = JSON.parse(lines[0] ?? '{}') as { id?: string; cwd?: string }
        header.id = randomUUID()
        header.cwd = seedProject74
        lines[0] = JSON.stringify(header)
        lines.push(
          JSON.stringify({
            type: 'message',
            id: `t74-${randomUUID().slice(0, 8)}`,
            parentId: lastEntryId(template74),
            timestamp: new Date().toISOString(),
            message: { role: 'user', content: [{ type: 'text', text: seedText }] }
          })
        )
        writeFileSync(file, lines.join('\n'))
        backdateMtime(file)
      }
      seedResumeTarget74(fileA74, 'PICODE_74_A seed turn')
      seedResumeTarget74(fileB74, 'PICODE_74_B seed turn')

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        // The sidebar may have been closed by an earlier stage —
        // press-until-present (the ticket-73 pattern).
        const sidebarPresent74 = `(document.querySelector('.sidebar') !== null)`
        if (!((await js(sidebarPresent74)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true })); true`)
          await waitForProbe(win, sidebarPresent74, 5_000)
        }
        const rowA74 = `[data-file="${fileA74}"]`
        const rowB74 = `[data-file="${fileB74}"]`
        for (const [row, label] of [
          [rowA74, 'A'],
          [rowB74, 'B']
        ] as Array<[string, string]>) {
          if (!(await waitForProbe(win, `document.querySelector('${row}') !== null`, 15_000))) {
            fail(`ticket-74 stage: the ${label} row never reached the sidebar`)
          }
        }
        log('draft_preserve_rows_ok')

        // Surface-specific probes: the chat composer lives in .chat-dock,
        // the empty state's in .empty-state — the value probe doubles as a
        // WHERE assertion (a value probe against the wrong surface would
        // read 'missing'). The definitions carry their own parens so they
        // compose with && inside larger probes (?? binds looser than ===,
        // and an unwrapped `x ?? 'missing' === ''` parses as
        // `x ?? false` — silently inverting the empty check).
        const chatValue74 = `(document.querySelector('.chat-dock textarea.composer-input')?.value ?? 'missing')`
        const emptyValue74 = `(document.querySelector('.empty-state textarea.composer-input')?.value ?? 'missing')`
        const chatAttachCount74 = `(document.querySelectorAll('.chat-dock .composer-attachment').length)`
        const openNewTask74 = async (): Promise<void> => {
          await js(
            `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true })); true`
          )
          if (!(await waitForProbe(win, `document.querySelector('.empty-state') !== null`, 5_000))) {
            fail('ticket-74 stage: ⌘N never opened the new-task empty state')
          }
        }
        const clickRow74 = async (row: string): Promise<void> => {
          await js(`document.querySelector('${row}')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        }
        const switchedTo74 = (row: string, marker: string): string =>
          `document.querySelector('.empty-state') === null &&
           [...document.querySelectorAll('.main-zone .msg-user')].some((n) => (n.textContent ?? '').includes(${JSON.stringify(marker)})) &&
           (document.querySelector('${row}')?.classList.contains('sb-task-active') ?? false)`

        // ① Resume both sessions (the announcements focus them in turn).
        const resumedA74 = waitFor(
          (e) => e.type === 'session_created' && e.sessionFile === fileA74,
          'ticket-74 resume A session_created'
        )
        await clickRow74(rowA74)
        const idA74 = ((await resumedA74) as Extract<Scoped, { type: 'session_created' }>).sessionId
        if (!(await waitForProbe(win, switchedTo74(rowA74, 'PICODE_74_A seed'), 15_000))) {
          fail('ticket-74 stage: the resumed session A never took over the main zone')
        }
        const resumedB74 = waitFor(
          (e) => e.type === 'session_created' && e.sessionFile === fileB74,
          'ticket-74 resume B session_created'
        )
        await clickRow74(rowB74)
        await resumedB74
        if (!(await waitForProbe(win, switchedTo74(rowB74, 'PICODE_74_B seed'), 15_000))) {
          fail('ticket-74 stage: the resumed session B never took over the main zone')
        }
        log('draft_preserve_resumes_ok')

        // ② A/B drafts stay isolated across pure focus switches. The B-side
        // empty check doubles as the leak lock: without the per-session view
        // key the SAME composer instance survived the switch and A's text
        // bled into B's composer.
        await clickRow74(rowA74)
        if (!(await waitForProbe(win, switchedTo74(rowA74, 'PICODE_74_A seed'), 10_000))) {
          fail('ticket-74 stage: the in-app switch back to A never landed')
        }
        if (!((await js(composerTypeJs(DRAFT_A_74)).catch(() => false)) as boolean)) {
          fail('ticket-74 stage: the chat composer textarea is missing while typing draft A')
        }
        await clickRow74(rowB74)
        if (!(await waitForProbe(win, `${switchedTo74(rowB74, 'PICODE_74_B seed')} && ${chatValue74} === ''`, 10_000))) {
          fail(`ticket-74 stage: switching A→B leaked A's composer into B (saw ${String(await js(chatValue74))})`)
        }
        if (!((await js(composerTypeJs(DRAFT_B_74)).catch(() => false)) as boolean)) {
          fail('ticket-74 stage: the chat composer textarea is missing while typing draft B')
        }
        await clickRow74(rowA74)
        if (
          !(await waitForProbe(
            win,
            `${switchedTo74(rowA74, 'PICODE_74_A seed')} && ${chatValue74} === ${JSON.stringify(DRAFT_A_74)}`,
            10_000
          ))
        ) {
          fail(`ticket-74 stage: A's draft was lost on the round trip (saw ${String(await js(chatValue74))})`)
        }
        await clickRow74(rowB74)
        if (
          !(await waitForProbe(
            win,
            `${switchedTo74(rowB74, 'PICODE_74_B seed')} && ${chatValue74} === ${JSON.stringify(DRAFT_B_74)}`,
            10_000
          ))
        ) {
          fail(`ticket-74 stage: B's draft was lost on the round trip (saw ${String(await js(chatValue74))})`)
        }
        log('draft_preserve_independent_ok')

        // ③ A pasted-image draft round-trips: paste into A (on top of its
        // text draft), the thumbnail renders, B never sees it, and A's
        // restore rebuilds the attachment card + text together.
        await clickRow74(rowA74)
        if (!(await waitForProbe(win, switchedTo74(rowA74, 'PICODE_74_A seed'), 10_000))) {
          fail('ticket-74 stage: the in-app switch back to A (image leg) never landed')
        }
        const pasteImage74 = `(() => {
          const ta = document.querySelector('.chat-dock textarea.composer-input')
          if (!(ta instanceof HTMLTextAreaElement)) return false
          const dt = new DataTransfer()
          dt.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'picode74.png', { type: 'image/png' }))
          ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
          return true
        })()`
        if (!((await js(pasteImage74).catch(() => false)) as boolean)) {
          fail('ticket-74 stage: the chat composer textarea is missing for the paste')
        }
        if (!(await waitForProbe(win, `${chatAttachCount74} === 1`, 10_000))) {
          fail('ticket-74 stage: the pasted image never rendered an attachment card')
        }
        log('draft_preserve_image_paste_ok')
        await clickRow74(rowB74)
        if (!(await waitForProbe(win, `${switchedTo74(rowB74, 'PICODE_74_B seed')} && ${chatAttachCount74} === 0`, 10_000))) {
          fail('ticket-74 stage: the pasted image leaked into the B composer')
        }
        await clickRow74(rowA74)
        if (
          !(await waitForProbe(
            win,
            `${switchedTo74(rowA74, 'PICODE_74_A seed')} && ${chatValue74} === ${JSON.stringify(DRAFT_A_74)} && ${chatAttachCount74} === 1 && document.querySelector('.chat-dock .composer-attachment img') !== null`,
            10_000
          ))
        ) {
          fail('ticket-74 stage: the image draft did not round-trip (text + thumbnail)')
        }
        log('draft_preserve_image_roundtrip_ok')

        // ④ New Task single slot: ⌘N → type → row click away — the New Task
        // text must not leak into A (A restores ITS own draft), and ⌘N
        // restores the New Task draft exactly.
        await openNewTask74()
        if (!((await js(composerTypeJs(NEWTASK_DRAFT_74)).catch(() => false)) as boolean)) {
          fail('ticket-74 stage: the empty-state composer textarea is missing')
        }
        await clickRow74(rowA74)
        if (
          !(await waitForProbe(
            win,
            `${switchedTo74(rowA74, 'PICODE_74_A seed')} && ${chatValue74} === ${JSON.stringify(DRAFT_A_74)} && ${chatAttachCount74} === 1`,
            10_000
          ))
        ) {
          fail('ticket-74 stage: the New Task draft leaked into A, or the A draft was lost')
        }
        await openNewTask74()
        if (!(await waitForProbe(win, `${emptyValue74} === ${JSON.stringify(NEWTASK_DRAFT_74)}`, 10_000))) {
          fail(`ticket-74 stage: the New Task draft did not survive the round trip (saw ${String(await js(emptyValue74))})`)
        }
        log('draft_preserve_newtask_roundtrip_ok')

        // ⑤ Escape leaves the new-task state — its draft parks, A restores.
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        if (
          !(await waitForProbe(
            win,
            `${switchedTo74(rowA74, 'PICODE_74_A seed')} && ${chatValue74} === ${JSON.stringify(DRAFT_A_74)}`,
            10_000
          ))
        ) {
          fail('ticket-74 stage: Escape out of the new-task state never restored session A')
        }
        log('draft_preserve_escape_ok')

        // ⑥ Send clears naturally: drop the image, replace the text, send —
        // the slot clears with the composer, so B never shows it and A
        // comes back to a resting composer.
        await js(`document.querySelector('.chat-dock .composer-attachment-remove')?.click(); true`)
        if (!((await js(composerClearJs).catch(() => false)) as boolean)) {
          fail('ticket-74 stage: the chat composer textarea is missing for the clear')
        }
        if (!((await js(composerTypeJs(SEND_TEXT_74)).catch(() => false)) as boolean)) {
          fail('ticket-74 stage: the chat composer textarea is missing for the send')
        }
        const sentA74 = waitFor(
          (e) => e.type === 'user_message' && e.sessionId === idA74 && e.text === SEND_TEXT_74,
          'ticket-74 send user_message'
        )
        const endedA74 = waitFor((e) => e.type === 'agent_end' && e.sessionId === idA74, 'ticket-74 send agent_end')
        await js(composerKeyJs('Enter'))
        await sentA74
        await endedA74
        await clickRow74(rowB74)
        await clickRow74(rowA74)
        if (
          !(await waitForProbe(
            win,
            `${switchedTo74(rowA74, 'PICODE_74_A seed')} && ${chatValue74} === '' && ${chatAttachCount74} === 0`,
            10_000
          ))
        ) {
          fail('ticket-74 stage: a sent draft resurrected in the composer after switching away and back')
        }
        log('draft_preserve_send_clear_ok')

        // ⑦ The New Task send clears the single slot too: ⌘N → send → a new
        // session takes over → ⌘N shows a RESTING composer.
        await openNewTask74()
        if (!((await js(composerTypeJs(NEWTASK_SEND_TEXT_74)).catch(() => false)) as boolean)) {
          fail('ticket-74 stage: the empty-state composer textarea is missing for the send')
        }
        const newTaskCreated74 = waitFor((e) => e.type === 'session_created', 'ticket-74 newtask send session_created')
        await js(composerKeyJs('Enter'))
        const fresh74 = (await newTaskCreated74) as Extract<Scoped, { type: 'session_created' }>
        if (fresh74.sessionFile === fileA74 || fresh74.sessionFile === fileB74) {
          fail('ticket-74 stage: the new-task send did not create a fresh session')
        }
        await waitFor((e) => e.type === 'agent_end' && e.sessionId === fresh74.sessionId, 'ticket-74 newtask send agent_end')
        await openNewTask74()
        if (!(await waitForProbe(win, `${emptyValue74} === ''`, 10_000))) {
          fail(`ticket-74 stage: the sent New Task draft resurrected (saw ${String(await js(emptyValue74))})`)
        }
        log('draft_preserve_newtask_send_clear_ok')

        // Ticket 80 (cross-seam borrow): the New Task empty state is on
        // screen — pick Read Only on the access chip. The pick is
        // component-local state, so the restart proxy below must DROP it:
        // the boot empty state comes back with the gate's fallback tier
        // tagged "default" (never persisted — the model/thinking lifecycle).
        if (!(await js(composerChipClickJs('Access mode:')).catch(() => false))) {
          fail('ticket-80 stage: the access chip never opened the access menu before the restart proxy')
        }
        if (!(await js(pickAccessRowJs('Read Only')).catch(() => false))) {
          fail('ticket-80 stage: the access menu never offered Read Only before the restart proxy')
        }
        if (!(await waitForProbe(win, accessChipIsJs('Access mode: Read Only', false), 5_000))) {
          fail('ticket-80 stage: the access pick never landed on the chip before the restart proxy')
        }
        log('access_pick_before_restart_ok', 'tier=read-only')

        // ⑧ Memory-level: a renderer reload (the restart proxy) loses every
        // draft — the boot empty state and a freshly resumed A both start
        // resting. The chatSubscribed marker is flipped FALSE first: it was
        // already 'true' on the outgoing page, and every probe below must
        // wait for the NEW page (the outgoing page's DOM still shows the
        // empty state — its composer was emptied by ⑦'s send — and its
        // registry still has A in-app, where a row click is a SILENT focus
        // switch with no announcement). A is backdated BEFORE the reload:
        // its mtime was touched by ⑥'s send, and a fresh mtime would route
        // the row click to read-only Follow (no announcement) instead of
        // the resume spawn.
        backdateMtime(fileA74)
        await js(`document.documentElement.dataset['chatSubscribed'] = 'false'; true`)
        await win.webContents.reload()
        await waitForProbe(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
        if (!(await waitForProbe(win, `document.querySelector('.empty-state') !== null && ${emptyValue74} === ''`, 15_000))) {
          fail('ticket-74 stage: after the restart proxy the boot empty state composer is not resting')
        }
        // Ticket 80 — probed NOW, while the boot empty state is still on
        // screen (before the row click switches away): the pre-restart
        // access pick is gone — the fresh empty state shows the gate's own
        // fallback tier, tagged "default" (component-local state never
        // survives the restart proxy — the model/thinking pick lifecycle).
        if (!(await waitForProbe(win, accessChipIsJs('Access mode: Standard', true), 10_000))) {
          fail('ticket-80 stage: the access pick survived the restart proxy (or the fallback lost its default tag)')
        }
        log('access_pick_restart_reset_ok')
        if (!(await waitForProbe(win, `document.querySelector('${rowA74}') !== null`, 15_000))) {
          fail('ticket-74 stage: session A row never returned after the restart proxy')
        }
        // The resume branch needs the row QUIET (no green live dot — the
        // index's mtime freshness). Wait it out if a scan raced the
        // backdate; the dot decays as soon as the next index pass lands.
        if (
          !(await waitForProbe(
            win,
            `document.querySelector('${rowA74} .sb-live-dot') === null`,
            15_000
          ))
        ) {
          fail('ticket-74 stage: session A still reads as TUI-live after the backdate')
        }
        const reResumed74 = waitFor(
          (e) => e.type === 'session_created' && e.sessionFile === fileA74,
          'ticket-74 post-restart resume session_created'
        )
        await clickRow74(rowA74)
        // Fast diagnostic: the click must produce the resumed chat view —
        // report WHICH surface (if any) replaced the boot empty state
        // instead of hanging on a bare event timeout.
        const clickOutcome74 = await waitForProbe(
          win,
          `document.querySelector('.empty-state') === null`,
          20_000
        )
        if (!clickOutcome74) {
          fail('ticket-74 stage: the post-restart row click left the boot empty state untouched')
        }
        await reResumed74
        if (
          !(await waitForProbe(
            win,
            `${switchedTo74(rowA74, 'PICODE_74_A seed')} && ${chatValue74} === '' && ${chatAttachCount74} === 0`,
            15_000
          ))
        ) {
          fail('ticket-74 stage: a draft survived the restart proxy')
        }
        log('draft_preserve_restart_empty_ok')
      })
    } finally {
      rmSync(seedProject74, { recursive: true, force: true })
    }
    log('draft_preserve_done')

    // ---- ticket 72: the command card (CONTEXT.md: 技能卡 Skill Card).
    // Picking a skill from the `/` menu renders the structured card (violet
    // wand icon + name + ×) instead of raw text, the args text follows it,
    // × removes the card (args preserved), and a re-pick — the seeded prompt
    // template — REPLACES the card (single slot: Pi semantics = one leading
    // command per message). The send recombines `/skill:name args` and the
    // SDK's OWN expansion proves the byte-identical form: the persisted user
    // message is the skill prologue plus the exact args (a real in-session
    // turn), and the composer resets fully (args AND card). The empty-state
    // half of the shared-composer rule is locked by the ticket-52 stage's
    // card probes above. ----
    log('command_card_start')
    {
      const store72 = process.env['PICODE_SESSION_DIR']
      if (!store72) fail('ticket-72 stage: PICODE_SESSION_DIR is not set')
      if (!created.sessionFile) fail('ticket-72 stage: no host-written session file to seed a resume target from')
      const seedProject72 = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-seed72-'))
      const CARD_SKILL_72 = 'picode-72-skill'
      const CARD_TEMPLATE_72 = 'picode-72-template'
      const CARD_ARGS_72 = 'PICODE_72_ARGS stress the boundaries'
      try {
        // The real resources: a project skill + prompt template that the
        // session's own resource loader enumerates (cwd-scoped scan at
        // session creation). The skill body instructs the model to a
        // deterministic tool-free reply so the send's turn settles fast.
        mkdirSync(path.join(seedProject72, '.pi', 'skills', CARD_SKILL_72), { recursive: true })
        writeFileSync(
          path.join(seedProject72, '.pi', 'skills', CARD_SKILL_72, 'SKILL.md'),
          `---\nname: ${CARD_SKILL_72}\ndescription: Seeded card-flow skill\n---\nReply with exactly: PICODE_72_SKILL_OK. Never use tools.\n`
        )
        mkdirSync(path.join(seedProject72, '.pi', 'prompts'), { recursive: true })
        writeFileSync(
          path.join(seedProject72, '.pi', 'prompts', `${CARD_TEMPLATE_72}.md`),
          `---\ndescription: Seeded card-flow template\nargument-hint: [env]\n---\nSeeded template body\n`
        )
        // The resume target: a copy of the host-written session file (the
        // proven-openable shape, ticket-73/74 precedent) whose cwd is the
        // seeded project; backdated = quiet, the click takes the resume path.
        const template72 = readFileSync(created.sessionFile, 'utf8')
        const file72 = path.join(store72, 'commandcard72.jsonl')
        const lines72 = template72.split('\n')
        const header72 = JSON.parse(lines72[0] ?? '{}') as { id?: string; cwd?: string }
        header72.id = randomUUID()
        header72.cwd = seedProject72
        lines72[0] = JSON.stringify(header72)
        lines72.push(
          JSON.stringify({
            type: 'message',
            id: `t72-${randomUUID().slice(0, 8)}`,
            parentId: lastEntryId(template72),
            timestamp: new Date().toISOString(),
            message: { role: 'user', content: [{ type: 'text', text: 'PICODE_72 seed turn' }] }
          })
        )
        writeFileSync(file72, lines72.join('\n'))
        backdateMtime(file72)

        await withWindow(getWindow, async (win) => {
          const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
          const chatValue72 = `(document.querySelector('.chat-dock textarea.composer-input')?.value ?? 'missing')`
          const chatCard72 = `(() => {
            const c = document.querySelector('.chat-dock .composer-command-card')
            return c === null ? null : { name: c.getAttribute('data-card-name'), source: c.getAttribute('data-card-source') }
          })()`
          const cmdRow72 = (name: string): string => `(() => {
            const rows = [...document.querySelectorAll('.cmp-popover .cmp-cmd-row')]
            const row = rows.find((r) => (r.querySelector('.cmp-cmd-name')?.textContent ?? '') === ${JSON.stringify(`/${name}`)})
            if (!(row instanceof HTMLElement)) return false
            row.click()
            return true
          })()`
          const cmdRowProbe72 = (name: string): string => `(() => {
            const rows = [...document.querySelectorAll('.cmp-popover .cmp-cmd-row')]
            return rows.some((r) => (r.querySelector('.cmp-cmd-name')?.textContent ?? '') === ${JSON.stringify(`/${name}`)})
          })()`
          /** Type the seeded query and wait for BOTH seeded menu rows. */
          const openSeededMenu72 = async (): Promise<void> => {
            await js(composerClearJs)
            if (!((await js(composerTypeJs('/picode-72')).catch(() => false)) as boolean)) {
              fail('ticket-72 stage: the chat composer textarea is missing for the seeded query')
            }
            if (!(await waitForProbe(win, `${cmdRowProbe72(CARD_SKILL_72)} && ${cmdRowProbe72(CARD_TEMPLATE_72)}`, 15_000))) {
              fail('ticket-72 stage: the seeded skill/template rows never reached the in-session `/` menu')
            }
          }

          // The sidebar may have been closed by an earlier stage —
          // press-until-present (the ticket-73 pattern).
          if (!((await js(`document.querySelector('.sidebar') !== null`)) as boolean)) {
            await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true })); true`)
            await waitForProbe(win, `document.querySelector('.sidebar') !== null`, 5_000)
          }
          // Resume by a real sidebar-row click; the announcement focuses the
          // session and the chat view takes over.
          if (!(await waitForProbe(win, `document.querySelector('[data-file="${file72}"]') !== null`, 15_000))) {
            fail('ticket-72 stage: the seeded resume row never reached the sidebar')
          }
          const resumed72 = waitFor(
            (e) => e.type === 'session_created' && e.sessionFile === file72,
            'ticket-72 resume session_created'
          )
          await js(`document.querySelector('[data-file="${file72}"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
          const id72 = ((await resumed72) as Extract<Scoped, { type: 'session_created' }>).sessionId
          if (!(await waitForProbe(win, `document.querySelector('.chat-dock textarea.composer-input') !== null`, 15_000))) {
            fail('ticket-72 stage: the resumed session never opened its chat composer')
          }
          log('command_card_resume_ok')

          // ① Pick the seeded skill: the card replaces the raw-text insert —
          // structured (name + source), args empty, and ZERO session traffic
          // across the pick (the ticket-52 negative-assertion precedent).
          let leaked = 0
          const onLeak72 = (event: Scoped): void => {
            if (event.type === 'user_message') leaked++
          }
          observers.push(onLeak72)
          await openSeededMenu72()
          if (!((await js(cmdRow72(CARD_SKILL_72))) as boolean)) {
            fail('ticket-72 stage: the seeded skill row disappeared before the pick')
          }
          if (!(await waitForProbe(win, `${chatCard72} !== null && ${chatCard72}.name === ${JSON.stringify(CARD_SKILL_72)} && ${chatCard72}.source === 'skill' && ${chatValue72} === ''`, 5_000))) {
            fail('ticket-72 stage: the skill pick never staged the command card with empty args')
          }
          log('command_card_skill_pick_ok')

          // ② The args text follows the card: typing plain text keeps the
          // card (and never re-opens a menu — the args do not start with `/`).
          if (!((await js(composerTypeJs(CARD_ARGS_72)).catch(() => false)) as boolean)) {
            fail('ticket-72 stage: the chat composer textarea is missing for the args')
          }
          if (!(await waitForProbe(win, `${chatValue72} === ${JSON.stringify(CARD_ARGS_72)} && ${chatCard72}.name === ${JSON.stringify(CARD_SKILL_72)}`, 5_000))) {
            fail('ticket-72 stage: the args text never followed the card')
          }
          log('command_card_args_follow_ok')

          // ③ × removes the CARD, not the message: the args text survives.
          if (!((await js(`document.querySelector('.chat-dock .composer-command-card-remove')?.click(); true`).catch(() => false)) as boolean)) {
            fail('ticket-72 stage: the card remove button is missing')
          }
          if (!(await waitForProbe(win, `${chatCard72} === null && ${chatValue72} === ${JSON.stringify(CARD_ARGS_72)}`, 5_000))) {
            fail(`ticket-72 stage: × never cleared the card while keeping the args (saw ${String(await js(chatValue72))})`)
          }
          log('command_card_clear_ok')

          // ④ A re-pick REPLACES the card (single slot): the prompt template
          // lands in the same slot — a different source proves replacement.
          await openSeededMenu72()
          if (!((await js(cmdRow72(CARD_TEMPLATE_72))) as boolean)) {
            fail('ticket-72 stage: the seeded template row disappeared before the re-pick')
          }
          if (!(await waitForProbe(win, `${chatCard72}.name === ${JSON.stringify(CARD_TEMPLATE_72)} && ${chatCard72}.source === 'prompt' && ${chatValue72} === ''`, 5_000))) {
            fail('ticket-72 stage: the re-pick never replaced the card with the template')
          }
          observers.splice(observers.indexOf(onLeak72), 1)
          if (leaked > 0) fail(`ticket-72 stage: the menu picks leaked ${leaked} message(s) — staging must not send`)
          log('command_card_replace_ok')

          // ⑤ The send recombines the invocation — byte-identical to the raw
          // text era, proven by the SDK's own expansion: the persisted user
          // message IS the skill prologue plus the exact args. One-shot
          // auto-deny (the menu_surface precedent) keeps a hallucinated tool
          // call from stalling the turn.
          await openSeededMenu72()
          if (!((await js(cmdRow72(CARD_SKILL_72))) as boolean)) {
            fail('ticket-72 stage: the seeded skill row disappeared before the send pick')
          }
          if (!(await waitForProbe(win, `${chatCard72}.name === ${JSON.stringify(CARD_SKILL_72)}`, 5_000))) {
            fail('ticket-72 stage: the skill card never came back for the send')
          }
          if (!((await js(composerTypeJs(CARD_ARGS_72)).catch(() => false)) as boolean)) {
            fail('ticket-72 stage: the chat composer textarea is missing for the send args')
          }
          await new Promise((r) => setTimeout(r, 300))
          let gateWatch72 = true
          const onGateAsk72 = (event: Scoped): void => {
            if (!gateWatch72) return
            if (event.type === 'approval_required') {
              gateWatch72 = false
              log('command_card_gate_auto_deny', `tool=${event.toolName}`)
              supervisor.handleParentCommand({
                type: 'session_command',
                sessionId: event.sessionId,
                command: {
                  type: 'deny_tool',
                  toolCallId: event.toolCallId,
                  reason: 'smoke auto-deny: the card-flow send must settle as a plain skill reply'
                }
              })
            } else if (event.type === 'agent_end' || event.type === 'host_exit') {
              gateWatch72 = false
            }
          }
          observers.push(onGateAsk72)
          const expanded72 = waitFor(
            (e) =>
              e.type === 'user_message' &&
              e.sessionId === id72 &&
              e.text.includes(`<skill name="${CARD_SKILL_72}"`) &&
              e.text.includes(CARD_ARGS_72),
            'ticket-72 SDK skill expansion user_message'
          )
          await js(composerKeyJs('Enter'))
          await expanded72
          log('command_card_send_expanded_ok')
          await waitFor((e) => e.type === 'agent_end' && e.sessionId === id72, 'ticket-72 send agent_end')
          observers.splice(observers.indexOf(onGateAsk72), 1)

          // ⑥ The send resets the whole composer: args AND card.
          if (!(await waitForProbe(win, `${chatCard72} === null && ${chatValue72} === ''`, 5_000))) {
            fail(`ticket-72 stage: the send left composer content behind (card=${String(await js(chatCard72))}, value=${String(await js(chatValue72))})`)
          }
          log('command_card_send_reset_ok')
        })
      } finally {
        rmSync(seedProject72, { recursive: true, force: true })
      }
    }
    log('command_card_done')


    // ---- ticket 77: the context ring (CONTEXT.md: 上下文圆环) — the model
    // chip's left-hand occupancy ring, ChatView-only. Four surfaces locked
    // end to end: ① the resumed user-only session shows the GREY idle ring
    // and grants no hover; ② the resumed session whose file carries a
    // seeded assistant usage renders the READY ring from history_loaded
    // (the replay path) with the exact quadruple + cache hit rate; ③ the
    // live path: an injected composer_state (contextWindow 200000) + a
    // streamed message_end (usage) advance the arc to exact fractions;
    // ④ the out-of-scope confirmations — the New Task empty state and the
    // Live Follow view render NO ring at all (only the chat surface mounts
    // one). Seeded files, no extra model calls (the ticket-55 injection
    // precedent, but through the REAL resume pipeline for ①/②). ----
    log('ctx_ring_start')
    const store77 = process.env['PICODE_SESSION_DIR']
    if (!store77) fail('ticket-77 stage: PICODE_SESSION_DIR is not set')
    const seedProject77 = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-seed77-'))
    const QUIET_MARKER_77 = 'PICODE_77_RING quiet session'
    const USAGE_MARKER_77 = 'PICODE_77_RING usage session'
    const FOLLOW_MARKER_77 = 'PICODE_77_RING running elsewhere'
    try {
      // ① The quiet target: a fresh hand-written session (the visual-harness
      // seed shape — proven openable by the resume chain) with ONE user turn
      // and NOTHING else — no assistant usage anywhere in the path, so the
      // ring must degrade to grey. NOTE: a copy of the host-written template
      // would carry the template's REAL assistant usage — the grey leg needs
      // a genuinely usage-less file. Its own fresh project (exists → normal
      // row, resume spawn target; own group → above the ticket-39 Show-more
      // cut); backdated = quiet resume.
      const quietFile77 = path.join(store77, 'ring77-quiet.jsonl')
      {
        const stamp = new Date().toISOString()
        writeFileSync(
          quietFile77,
          [
            JSON.stringify({ type: 'session', version: 3, id: randomUUID(), timestamp: stamp, cwd: seedProject77 }),
            JSON.stringify({
              type: 'message',
              id: `t77q-${randomUUID().slice(0, 8)}`,
              parentId: null,
              timestamp: stamp,
              message: { role: 'user', content: [{ type: 'text', text: QUIET_MARKER_77 }] }
            })
          ].join('\n') + '\n'
        )
      }
      backdateMtime(quietFile77)

      // ② The usage target: the same fresh shape PLUS an assistant message
      // whose usage is the whole ring story: 40k in + 2k out + 24k cacheRead
      // = 66,000 of an (injected later) 200,000 window; hit rate
      // 24,000/(40,000+24,000) = 37.5%. stopReason 'stop' — the validity
      // rule lets it through.
      const usageFile77 = path.join(store77, 'ring77-usage.jsonl')
      {
        const stamp = new Date().toISOString()
        const userEntry = {
          type: 'message',
          id: `t77u-${randomUUID().slice(0, 8)}`,
          parentId: null,
          timestamp: stamp,
          message: { role: 'user', content: [{ type: 'text', text: USAGE_MARKER_77 }] }
        }
        const assistantEntry = {
          type: 'message',
          id: `t77a-${randomUUID().slice(0, 8)}`,
          parentId: userEntry.id,
          timestamp: stamp,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Seeded ring usage: 66,000 tokens of context.' }],
            stopReason: 'stop',
            usage: { input: 40_000, output: 2_000, cacheRead: 24_000, cacheWrite: 0, totalTokens: 66_000 }
          }
        }
        writeFileSync(
          usageFile77,
          [
            JSON.stringify({ type: 'session', version: 3, id: randomUUID(), timestamp: stamp, cwd: seedProject77 }),
            JSON.stringify(userEntry),
            JSON.stringify(assistantEntry)
          ].join('\n') + '\n'
        )
      }
      backdateMtime(usageFile77)

      // ④'s follow target: seeded FRESH — its mtime says a TUI is writing it
      // right now, so the click takes the Live Follow branch (no composer,
      // hence no ring — the structural out-of-scope confirmation).
      const followFile77 = path.join(store77, 'ring77-follow.jsonl')
      {
        const stamp = new Date().toISOString()
        writeFileSync(
          followFile77,
          [
            JSON.stringify({ type: 'session', version: 3, id: randomUUID(), timestamp: stamp, cwd: seedProject77 }),
            JSON.stringify({
              type: 'message',
              id: `t77f-${randomUUID().slice(0, 8)}`,
              parentId: null,
              timestamp: stamp,
              message: { role: 'user', content: [{ type: 'text', text: FOLLOW_MARKER_77 }] }
            })
          ].join('\n') + '\n'
        )
      }

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        const sidebarPresent77 = `(document.querySelector('.sidebar') !== null)`
        if (!((await js(sidebarPresent77)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true })); true`)
          await waitForProbe(win, sidebarPresent77, 5_000)
        }
        const quietRow77 = `[data-file="${quietFile77}"]`
        const usageRow77 = `[data-file="${usageFile77}"]`
        const followRow77 = `[data-file="${followFile77}"]`
        for (const [row, label] of [
          [quietRow77, 'quiet'],
          [usageRow77, 'usage'],
          [followRow77, 'follow']
        ] as Array<[string, string]>) {
          if (!(await waitForProbe(win, `document.querySelector('${row}') !== null`, 15_000))) {
            fail(`ticket-77 stage: the ${label} row never reached the sidebar`)
          }
        }
        const clickRow77 = async (row: string): Promise<void> => {
          await js(`document.querySelector('${row}')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        }
        const switchedTo77 = (row: string, marker: string): string =>
          `document.querySelector('.empty-state') === null &&
           [...document.querySelectorAll('.main-zone .msg-user')].some((n) => (n.textContent ?? '').includes(${JSON.stringify(marker)})) &&
           (document.querySelector('${row}')?.classList.contains('sb-task-active') ?? false)`
        const ringInDock77 = `.chat-dock .ctx-ring`
        const hoverRing77 = async (): Promise<void> => {
          await js(
            `document.querySelector('${ringInDock77}')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); true`
          )
        }
        const leaveRing77 = async (): Promise<void> => {
          await js(
            `document.querySelector('${ringInDock77}')?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); true`
          )
        }

        // ① The quiet resume: grey idle ring, NO arc, and hover opens
        // NOTHING (无 usage 灰环无 hover).
        const resumedQuiet77 = waitFor(
          (e) => e.type === 'session_created' && e.sessionFile === quietFile77,
          'ticket-77 quiet resume session_created'
        )
        await clickRow77(quietRow77)
        await resumedQuiet77
        if (!(await waitForProbe(win, switchedTo77(quietRow77, QUIET_MARKER_77), 15_000))) {
          fail('ticket-77 stage: the quiet session never took over the main zone')
        }
        if (!(await waitForProbe(win, `document.querySelector('${ringInDock77}[data-ring-mode="idle"]') !== null`, 10_000))) {
          const diag = (await js(
            `JSON.stringify({
              ring: document.querySelector('.ctx-ring') !== null,
              mode: document.querySelector('.ctx-ring')?.dataset['ringMode'] ?? null,
              wrap: document.querySelector('.ctx-ring-wrap')?.outerHTML?.slice(0, 240) ?? null,
              chatDock: document.querySelector('.chat-dock') !== null,
              emptyState: document.querySelector('.empty-state') !== null,
              followBadge: document.querySelector('.follow-badge') !== null
            })`
          ).catch(() => 'unavailable')) as string
          fail(`ticket-77 stage: the user-only resumed session never showed the grey idle ring; DOM: ${diag}`)
        }
        if (!((await js(`document.querySelector('${ringInDock77} .ctx-ring-arc') === null`)) as boolean)) {
          fail('ticket-77 stage: the idle ring must render the track only, never an arc')
        }
        await hoverRing77()
        await new Promise((r) => setTimeout(r, 600))
        if (!((await js(`document.querySelector('.ctx-ring-pop') === null`)) as boolean)) {
          fail('ticket-77 stage: the idle ring opened a hover popover — 无 usage 灰环无 hover is law')
        }
        log('ctx_ring_idle_ok')

        // ② The usage resume (history_loaded.usage replay path): the READY
        // ring with the seeded numbers — 66,000 used, 37.5% hit rate — and
        // the exact quadruple in the popover. The percentage stays
        // window-dependent (the resumed session's REAL model window), so
        // only the numerator is pinned here; ③ pins the exact fraction.
        const resumedUsage77 = waitFor(
          (e) => e.type === 'session_created' && e.sessionFile === usageFile77,
          'ticket-77 usage resume session_created'
        )
        await clickRow77(usageRow77)
        await resumedUsage77
        if (!(await waitForProbe(win, switchedTo77(usageRow77, USAGE_MARKER_77), 15_000))) {
          fail('ticket-77 stage: the usage session never took over the main zone')
        }
        if (
          !(await waitForProbe(
            win,
            `document.querySelector('${ringInDock77}[data-ring-mode="ready"]') !== null && Number(document.querySelector('${ringInDock77}')?.dataset['ringFraction'] ?? '0') > 0`,
            10_000
          ))
        ) {
          fail('ticket-77 stage: the seeded usage never rendered the ready ring from the replay path')
        }
        await hoverRing77()
        if (!(await waitForProbe(win, `document.querySelector('.ctx-ring-pop-open') !== null`, 5_000))) {
          fail('ticket-77 stage: the ready ring never opened the hover popover')
        }
        const popProbe77 = `(() => {
          const total = document.querySelector('.ctx-ring-pop .ctx-ring-pop-total')?.textContent ?? ''
          const rows = [...document.querySelectorAll('.ctx-ring-pop .ctx-ring-pop-row')].map((r) => r.textContent ?? '').join('|')
          const hit = document.querySelector('.ctx-ring-pop .ctx-ring-pop-hit-value')?.textContent ?? ''
          const barWidth = document.querySelector('.ctx-ring-pop .ctx-ring-pop-bar-fill')?.style.width ?? ''
          return JSON.stringify({ total, rows, hit, barWidth })
        })()`
        const pop77 = JSON.parse((await js(popProbe77)) as string) as {
          total: string
          rows: string
          hit: string
          barWidth: string
        }
        if (!pop77.total.startsWith('66,000 / ')) fail(`ticket-77 stage: popover total must start '66,000 / ', got ${pop77.total}`)
        if (pop77.rows !== 'IN40,000|OUT2,000|cacheRead24,000|cacheWrite0') {
          fail(`ticket-77 stage: popover quadruple wrong, got ${pop77.rows}`)
        }
        if (pop77.hit !== '37.5%') fail(`ticket-77 stage: cache hit rate must be 37.5%, got ${pop77.hit}`)
        if (pop77.barWidth === '' || pop77.barWidth === '0%') fail(`ticket-77 stage: the popover bar never filled, got ${pop77.barWidth}`)
        await leaveRing77()
        if (!(await waitForProbe(win, `document.querySelector('.ctx-ring-pop-open') === null`, 5_000))) {
          fail('ticket-77 stage: the popover never closed after the mouse left the ring')
        }
        log('ctx_ring_resume_usage_ok')

        // ③ The live path with EXACT numbers: inject the smoke model's
        // window (200,000) through composer_state, then a streamed turn
        // whose message_end carries a 100,000-token usage — the arc must
        // read exactly 0.5 and the popover exactly '100,000 / 200,000
        // (50%)' with all four quadruple members.
        emitContractEvent({
          type: 'composer_state',
          model: { providerId: 'picode-smoke', modelId: 'ring-model', name: 'Ring Model', contextWindow: 200_000 },
          thinkingLevel: null,
          availableLevels: ['off', 'high'],
          accessMode: 'standard'
        })
        emitContractEvent({ type: 'user_message', text: 'PICODE_77_RING live turn' })
        emitContractEvent({ type: 'agent_start' })
        emitContractEvent({ type: 'message_start' })
        emitContractEvent({ type: 'text_delta', delta: 'Half the window.' })
        emitContractEvent({
          type: 'message_end',
          usage: { input: 25_000, output: 5_000, cacheRead: 25_000, cacheWrite: 45_000, total: 100_000 }
        })
        emitContractEvent({ type: 'agent_end' })
        if (!(await waitForProbe(win, `document.querySelector('${ringInDock77}[data-ring-fraction="0.5000"]') !== null`, 10_000))) {
          const diag = (await js(
            `JSON.stringify({ mode: document.querySelector('${ringInDock77}')?.dataset['ringMode'], fraction: document.querySelector('${ringInDock77}')?.dataset['ringFraction'] })`
          ).catch(() => 'unavailable')) as string
          fail(`ticket-77 stage: the live message_end usage never drove the arc to 0.5 (saw ${diag})`)
        }
        await hoverRing77()
        if (!(await waitForProbe(win, `document.querySelector('.ctx-ring-pop-open') !== null`, 5_000))) {
          fail('ticket-77 stage: the live ring never opened the hover popover')
        }
        const livePop77 = JSON.parse((await js(popProbe77)) as string) as { total: string; rows: string; hit: string; barWidth: string }
        if (livePop77.total !== '100,000 / 200,000 (50%)') {
          fail(`ticket-77 stage: live popover total must be '100,000 / 200,000 (50%)', got ${livePop77.total}`)
        }
        if (livePop77.rows !== 'IN25,000|OUT5,000|cacheRead25,000|cacheWrite45,000') {
          fail(`ticket-77 stage: live popover quadruple wrong, got ${livePop77.rows}`)
        }
        if (livePop77.hit !== '50%') fail(`ticket-77 stage: live hit rate must be 50%, got ${livePop77.hit}`)
        if (livePop77.barWidth !== '50%') fail(`ticket-77 stage: live bar width must be 50%, got ${livePop77.barWidth}`)
        await leaveRing77()
        log('ctx_ring_live_ok')

        // ④a New Task 界外确认: the empty state's composer renders NO ring
        // (the shared component gets no contextRing input there).
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true })); true`)
        if (!(await waitForProbe(win, `document.querySelector('.empty-state') !== null`, 5_000))) {
          fail('ticket-77 stage: ⌘N never opened the new-task empty state')
        }
        if (!((await js(`document.querySelector('.empty-state .ctx-ring') === null && document.querySelector('.ctx-ring') === null`)) as boolean)) {
          fail('ticket-77 stage: the New Task empty state must render no context ring (ChatView-only)')
        }
        log('ctx_ring_newtask_absent_ok')

        // ④b Follow 界外确认: the live-elsewhere row opens the read-only
        // follow view — no composer, hence no ring anywhere.
        await clickRow77(followRow77)
        if (
          !(await waitForProbe(
            win,
            `document.querySelector('.empty-state') === null && document.querySelector('.follow-badge') !== null && document.querySelector('.ctx-ring') === null`,
            10_000
          ))
        ) {
          fail('ticket-77 stage: the follow view must render no context ring (ChatView-only)')
        }
        // Point back at the focused (usage) row to exit Follow.
        await clickRow77(usageRow77)
        if (
          !(await waitForProbe(
            win,
            `document.querySelector('.follow-badge') === null && document.querySelector('${ringInDock77}[data-ring-mode="ready"]') !== null`,
            10_000
          ))
        ) {
          fail('ticket-77 stage: clicking the focused row never exited Follow back to the ring session')
        }
        log('ctx_ring_follow_absent_ok')
      })
    } finally {
      rmSync(seedProject77, { recursive: true, force: true })
    }
    log('ctx_ring_done')

    // ---- ticket 79: Edit & Resend — the Edit click on a settled user
    // message prefills the composer (original text + restored image) and
    // navigates the leaf to the message's parent (SDK edit-and-resubmit);
    // the send branches in place with the light toast; agentRunning hides
    // the button and the agent_end settle brings it back; the old branch
    // stays reachable in the tree panel. Seeded file + resume = the same
    // driver ticket 43 uses; ONE real model turn supplies the Stop leg. ----
    log('edit_resend_start')
    const editProject79 = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-edit79-'))
    try {
      const editStore79 = process.env['PICODE_SESSION_DIR']
      if (!editStore79) fail('ticket-79 stage: PICODE_SESSION_DIR is not set')
      const stamp79 = new Date().toISOString()
      const editFile79 = path.join(editStore79, 'edit79.jsonl')
      const editPng79 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      writeFileSync(
        editFile79,
        [
          JSON.stringify({ type: 'session', version: 3, id: 'edit79-electron-id', timestamp: stamp79, cwd: editProject79 }),
          JSON.stringify({
            type: 'message', id: 'e79-u1', parentId: null, timestamp: stamp79,
            message: { role: 'user', content: [{ type: 'text', text: 'PICODE_EDIT79 first message' }] }
          }),
          JSON.stringify({
            type: 'message', id: 'e79-a1', parentId: 'e79-u1', timestamp: stamp79,
            message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_EDIT79 first reply' }], stopReason: 'stop' }
          }),
          // The image-carrying message: the prefill must restore its inline
          // base64 ImageContent as a composer attachment (operator decision:
          // images ride back).
          JSON.stringify({
            type: 'message', id: 'e79-u2', parentId: 'e79-a1', timestamp: stamp79,
            message: { role: 'user', content: [
              { type: 'text', text: 'PICODE_EDIT79 second message' },
              { type: 'image', data: editPng79, mimeType: 'image/png' }
            ] }
          }),
          JSON.stringify({
            type: 'message', id: 'e79-a2', parentId: 'e79-u2', timestamp: stamp79,
            message: { role: 'assistant', content: [{ type: 'text', text: 'PICODE_EDIT79 second reply' }], stopReason: 'stop' }
          })
        ].join('\n') + '\n'
      )

      supervisor.handleParentCommand({ type: 'resume_session', sessionFile: editFile79, cwd: editProject79 })
      const created79 = (await waitFor(
        (e) => e.type === 'session_created' && e.sessionFile === editFile79,
        'ticket-79 resume session_created'
      )) as Extract<Scoped, { type: 'session_created' }>
      const editSessionId = created79.sessionId
      await waitFor((e) => e.type === 'history_loaded' && e.sessionId === editSessionId, 'ticket-79 resume replay')

      await withWindow(getWindow, async (win) => {
        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        const toastCount = (needle: string): string =>
          `[...document.querySelectorAll('.toast-message')].filter((n) => (n.textContent ?? '').includes(${JSON.stringify(needle)})).length`
        const userBlocks = (): string => `document.querySelectorAll('.chat-thread > .msg-user-block').length`
        /** Click the Edit button of the index-th user block. */
        const clickEdit79 = (index: number): string => `(() => {
          const blocks = document.querySelectorAll('.chat-thread > .msg-user-block')
          const block = blocks[${index}]
          if (!(block instanceof HTMLElement)) return false
          const btn = [...block.querySelectorAll('.msg-action-btn')].find((b) => b.textContent?.includes('Edit'))
          if (!(btn instanceof HTMLElement)) return false
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`
        const composerValue = (): string => `(document.querySelector('.composer-input')?.value ?? null)`
        const composerDiag = (): string =>
          `JSON.stringify({ value: document.querySelector('.composer-input')?.value ?? null, figures: document.querySelectorAll('.composer-attachments figure').length, disabled: document.querySelector('.composer-input')?.disabled ?? null })`
        const attachmentFigures = (): string => `document.querySelectorAll('.composer-attachments figure').length`

        if (!(await waitForProbe(win, `document.querySelector('.chat-view') !== null`, 10_000))) {
          fail('ticket-79 stage: the resumed session never reached the chat view')
        }
        if (!(await waitForProbe(win, `${userBlocks()} === 2`, 10_000))) {
          fail('ticket-79 stage: the two seeded user blocks never rendered')
        }

        // ① Row shape: Copy + Edit on every settled user block (all-English
        // labels; the ticket-44 stage pins Copy-first). No agent is running,
        // so Edit is on.
        const labels79 = (await js(`(() => {
          const block = document.querySelectorAll('.chat-thread > .msg-user-block')[1]
          if (!(block instanceof HTMLElement)) return null
          return [...block.querySelectorAll('.msg-action-btn span')].map((s) => s.textContent ?? '')
        })()`)) as string[] | null
        if (labels79 === null || labels79.join(',') !== 'Copy,Edit') {
          fail(`ticket-79 stage: the user row shape must be Copy+Edit, got ${JSON.stringify(labels79)}`)
        }
        log('edit_resend_row_shape_ok')

        // ② Draft replacement + imageless edit: a stray draft sits in the
        // composer; clicking Edit on the ROOT message u1 replaces it with
        // u1's original text (no attachments), and the navigate resets the
        // leaf (SDK resetLeaf) — the transcript replays empty.
        if (!(await js(composerTypeJs('PICODE_EDIT79 stray draft')).catch(() => false))) {
          fail('ticket-79 stage: the composer textarea is missing')
        }
        // The replay waiter arms BEFORE the click: the host answers the
        // navigate within milliseconds, and a waiter armed after a DOM probe
        // would starve exactly like the round-1 stream race (the event
        // flows through while the probe polls the renderer's later commit).
        const rootEditReplay = waitFor(
          (e) => e.type === 'history_loaded' && e.sessionId === editSessionId && e.items.length === 0,
          'ticket-79 root-edit replay (empty path)'
        )
        if (!((await js(clickEdit79(0))) as boolean)) fail('ticket-79 stage: the first user row never rendered Edit')
        const draftReplaced = await waitForProbe(
          win,
          `${composerValue()} === ${JSON.stringify('PICODE_EDIT79 first message')}`,
          5_000
        )
        if (!draftReplaced) {
          const diag = (await js(composerDiag()).catch(() => 'diag-failed')) as string
          fail(`ticket-79 stage: Edit never replaced the in-place draft with the original text — ${diag}`)
        }
        if (((await js(attachmentFigures())) as number) !== 0) {
          fail('ticket-79 stage: an imageless edit must not restore attachments')
        }
        await rootEditReplay
        if (!(await waitForProbe(win, `${userBlocks()} === 0`, 5_000))) {
          fail('ticket-79 stage: the root edit never replayed an empty transcript')
        }
        log('edit_resend_draft_replace_ok')

        // ③ The old branch stays reachable: after the root edit the leaf is
        // null (the panel shows u1/a1), so the way back is two hops — click
        // the a1 row (leaf → a1), then the a2 row (leaf → a2, the old leaf)
        // and the full transcript returns. Assistant rows navigate to
        // themselves (user rows carry the edit semantics, landing on the
        // parent — exactly what ② exercised).
        await js(
          `[...document.querySelectorAll('.chat-topbar-btn')].find((el) => el.textContent?.includes('History'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
        )
        if (!(await waitForProbe(win, `document.querySelectorAll('.tree-row').length > 0`, 5_000))) {
          fail('ticket-79 stage: the tree rows never rendered')
        }
        const treeRow79 = (needle: string): string =>
          `[...document.querySelectorAll('.tree-row')].find((el) => el.textContent?.includes(${JSON.stringify(needle)}))`
        // Each hop: WAIT for the row to exist before clicking — the replay's
        // history_loaded may reach the smoke before the renderer processed
        // the paired session_tree, and the row's very VISIBILITY depends on
        // the new leaf (a2 hides whenever the leaf is not on its path). A
        // blind click here silently no-ops and starves the replay wait.
        if (!(await waitForProbe(win, `${treeRow79('PICODE_EDIT79 first reply')} !== undefined`, 5_000))) {
          fail('ticket-79 stage: the a1 tree row never rendered for the way back')
        }
        const backReplayA1 = waitFor(
          (e) => e.type === 'history_loaded' && e.sessionId === editSessionId && e.items.length === 2,
          'ticket-79 tree navigate-back replay (a1)'
        )
        await js(`${treeRow79('PICODE_EDIT79 first reply')}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        await backReplayA1
        if (!(await waitForProbe(win, `${treeRow79('PICODE_EDIT79 second reply')} !== undefined`, 5_000))) {
          fail('ticket-79 stage: the a2 tree row never rendered after the a1 hop')
        }
        const backReplayA2 = waitFor(
          (e) => e.type === 'history_loaded' && e.sessionId === editSessionId && e.items.length === 4,
          'ticket-79 tree navigate-back replay (a2)'
        )
        await js(`${treeRow79('PICODE_EDIT79 second reply')}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        await backReplayA2
        if (!(await waitForProbe(win, `${userBlocks()} === 2`, 5_000))) {
          fail('ticket-79 stage: navigating back to the old leaf never restored the transcript')
        }
        log('edit_resend_old_branch_reachable_ok')

        // ④ THE EDIT: click Edit on the image message u2. The composer must
        // prefill its original text AND restore the image as an attachment;
        // the leaf moves to a1 (the parent) and the transcript replays
        // without the edited message and its tail.
        if (!((await js(clickEdit79(1))) as boolean)) fail('ticket-79 stage: the image message row never rendered Edit')
        // The click must visibly restructure the transcript (the leaf lands
        // on a1 → the replay leaves ONE user block) and the composer must
        // hold the prefill. The DOM is the assertion — an event waiter here
        // adds no proof (the replay IS what the DOM now shows) and its
        // items-length pin can silently mismatch a wrong-target navigate.
        let landed = false
        for (let waited = 0; waited < 15_000 && !landed; waited += 200) {
          landed = (await js(`${userBlocks()} === 1`).catch(() => false)) === true
          if (!landed) await new Promise((r) => setTimeout(r, 200))
        }
        if (!landed) {
          const diag = (await js(`JSON.stringify({
            blocks: document.querySelectorAll('.chat-thread > .msg-user-block').length,
            rows: [...document.querySelectorAll('.chat-thread > .msg-user-block')].map((b) => [...b.querySelectorAll('.msg-action-btn span')].map((s) => s.textContent)),
            composer: { value: document.querySelector('.composer-input')?.value ?? null, disabled: document.querySelector('.composer-input')?.disabled ?? null }
          })`).catch(() => 'diag-failed')) as string
          fail(`ticket-79 stage: the image-message Edit click never restructured the transcript — ${diag}`)
        }
        const imagePrefilled = await waitForProbe(
          win,
          `${composerValue()} === ${JSON.stringify('PICODE_EDIT79 second message')} && ${attachmentFigures()} === 1`,
          5_000
        )
        if (!imagePrefilled) {
          const diag = (await js(composerDiag()).catch(() => 'diag-failed')) as string
          fail(`ticket-79 stage: the image message prefill (text + attachment) never landed — ${diag}`)
        }
        log('edit_resend_prefill_image_ok')

        // ⑤ THE SEND: the edited text goes through the plain prompt path —
        // an in-place branch — and the light resend toast fires. The run
        // hides every Edit button; Stop brings them back with agent_end.
        // The echo/agent_start waiters arm BEFORE Enter — the toast poll
        // between Enter and the waits would otherwise starve on events that
        // flowed through while it polled (the same missed-event race as the
        // steps above).
        const RESENT = 'PICODE_EDIT79 second message EDITED — write a 300-word story about a lighthouse.'
        const resentEcho = waitFor(
          (e) => e.type === 'user_message' && e.sessionId === editSessionId && e.text.includes('EDITED'),
          'ticket-79 resent user_message echo'
        )
        const resentStart = waitFor(
          (e) => e.type === 'agent_start' && e.sessionId === editSessionId,
          'ticket-79 resend agent_start'
        )
        if (!(await js(composerTypeJs(RESENT)).catch(() => false))) {
          fail('ticket-79 stage: the composer textarea is missing for the resend')
        }
        await js(composerKeyJs('Enter'))
        let toastSeen = false
        for (let waited = 0; waited < 5_000 && !toastSeen; waited += 100) {
          toastSeen = ((await js(toastCount(EDIT_RESEND_TOAST)).catch(() => 0)) as number) > 0
          if (!toastSeen) await new Promise((r) => setTimeout(r, 100))
        }
        if (!toastSeen) fail('ticket-79 stage: the light resend toast never fired')
        log('edit_resend_toast_ok')

        await resentStart
        await resentEcho
        // agentRunning hides every Edit button (agent_start landed first —
        // the story turn streams long enough to catch the hidden state).
        if (!(await waitForProbe(win, `${userBlocks()} >= 1 && [...document.querySelectorAll('.chat-thread > .msg-user-block')].every((b) => b.querySelectorAll('.msg-action-btn').length === 1)`, 10_000))) {
          fail('ticket-79 stage: the Edit buttons never hid while the agent ran')
        }
        log('edit_resend_hidden_while_running_ok')

        // The Stop leg (acceptance, verbatim): the click aborts the turn and
        // the agent_end settle must bring the buttons BACK — no stuck-hidden
        // state.
        await js(`document.querySelector('.cmp-stop')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
        await waitFor((e) => e.type === 'agent_end' && e.sessionId === editSessionId, 'ticket-79 stop agent_end')
        if (!(await waitForProbe(win, `${userBlocks()} === 2 && [...document.querySelectorAll('.chat-thread > .msg-user-block')].every((b) => b.querySelectorAll('.msg-action-btn').length === 2)`, 10_000))) {
          fail('ticket-79 stage: the Edit buttons never came back after the Stop agent_end')
        }
        const resentText = (await js(
          `[...document.querySelectorAll('.chat-thread > .msg-user-block .msg-user')].map((n) => n.textContent ?? '').find((t) => t.includes('EDITED')) ?? null`
        )) as string | null
        if (resentText === null) fail('ticket-79 stage: the resent message bubble never rendered')
        log('edit_resend_stop_restore_ok')

        // ⑥ The new branch + the old one, side by side in the tree panel:
        // the abandoned branch's rows still list, the resent message row
        // exists, and exactly one row carries the current-leaf tag. The
        // panel from step ③ may still be open (the History button is a
        // TOGGLE — only click it when no rows render), and the payload is
        // STALE: a prompt does not push a session_tree, so the stage asks
        // for a fresh tree explicitly before asserting the new row.
        if (!((await js(`document.querySelectorAll('.tree-row').length > 0`)) as boolean)) {
          await js(
            `[...document.querySelectorAll('.chat-topbar-btn')].find((el) => el.textContent?.includes('History'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
          )
        }
        const freshTree79 = waitFor(
          (e) => e.type === 'session_tree' && e.sessionId === editSessionId,
          'ticket-79 fresh session_tree for the branch check'
        )
        supervisor.handleParentCommand({
          type: 'session_command',
          sessionId: editSessionId,
          command: { type: 'request_tree' }
        })
        await freshTree79
        if (!(await waitForProbe(win, `document.querySelectorAll('.tree-row').length > 0`, 5_000))) {
          fail('ticket-79 stage: the tree rows never rendered for the branch check')
        }
        const treeShape79 = (await js(`(() => {
          const texts = [...document.querySelectorAll('.tree-row .tree-row-text')].map((el) => el.textContent ?? '')
          return {
            oldMessage: texts.some((t) => t.includes('PICODE_EDIT79 second message')),
            oldReply: texts.some((t) => t.includes('PICODE_EDIT79 second reply')),
            resent: texts.some((t) => t.includes('EDITED')),
            leafTags: document.querySelectorAll('.tree-leaf-tag').length
          }
        })()`)) as { oldMessage: boolean; oldReply: boolean; resent: boolean; leafTags: number } | null
        if (treeShape79 === null) fail('ticket-79 stage: the tree shape probe never ran')
        if (!treeShape79.oldMessage || !treeShape79.oldReply) {
          fail('ticket-79 stage: the abandoned branch is not reachable in the tree panel')
        }
        if (!treeShape79.resent) fail('ticket-79 stage: the resent message row is missing from the tree')
        if (treeShape79.leafTags !== 1) fail(`ticket-79 stage: exactly one current tag expected, got ${treeShape79.leafTags}`)
        log('edit_resend_tree_branches_ok')
      })
    } finally {
      rmSync(editProject79, { recursive: true, force: true })
    }
    log('edit_resend_done')

    // Quit: EVERY remaining host must terminate — no orphans (ticket 20).
    const livePids = supervisor.hostPids
    if (livePids.length < 2) fail(`expected at least 2 live hosts before quit, saw ${livePids.length}`)


    supervisor.shutdownAll()
    for (let waited = 0; waited < 10_000; waited += 100) {
      const alive = livePids.filter((p) => {
        try {
          process.kill(p, 0)
          return true
        } catch {
          return false
        }
      })
      if (alive.length === 0) break
      await new Promise((r) => setTimeout(r, 100))
    }
    const stillAlive = livePids.filter((p) => {
      try {
        process.kill(p, 0)
        return true
      } catch {
        return false
      }
    })
    if (stillAlive.length > 0) fail(`orphaned hosts after shutdownAll: ${stillAlive.join(', ')}`)
    log('multi_shutdown_no_orphans_ok', `${livePids.length} hosts`)
    log('done')
    app.exit(0)
  }

  main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err))
  })

  return {
    onHostEvent,
    onApprovalNotice: (notice: ApprovalNotice): void => {
      approvalNotices.push(notice)
    },
    getAuthReport: async (): Promise<AuthProbeReport | null> => {
      if (!getAuthReport) return null
      try {
        return await getAuthReport()
      } catch {
        return null
      }
    }
  }
}

/** Milliseconds the withWindow re-activation waits for real key state. */
const REFOCUS_WAIT_MS = 5_000

async function withWindow(
  getWindow: () => BrowserWindow | null,
  body: (win: BrowserWindow) => Promise<void>
): Promise<void> {
  const win = getWindow()
  if (!win) throw new Error('smoke window missing')
  // The smoke window must keep running compositor animations (the ticket-45
  // opacity probes) even when another app's windows occlude it mid-run —
  // macOS freezes renderer compositing for occluded windows, which would
  // stick CSS transitions at their start opacity and hang the probes. Same
  // root cause the visual harness disables throttling for (src/main/visual.ts);
  // smoke-mode only, so the shipped app keeps stock throttling.
  win.webContents.setBackgroundThrottling(false)
  // The launcher's frontmost app often lives on another Space (a fullscreen
  // terminal/editor) — a window that only lives on its own Space can never
  // win the ticket-44 real-clipboard focus poll (document.hasFocus() stays
  // false forever, the stage fails before any clipboard assertion). Pin the
  // smoke window to every Space, fullscreen ones included, so the per-stage
  // re-activation below can actually raise it on top. Smoke-mode only; the
  // shipped app keeps stock space behavior.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Re-activate the window for every stage (ticket 47): the operator's real
  // windows can take focus back mid-run, and several stages gate on window
  // state — ticket-44's real-clipboard focus poll, ticket-35's REAL-input
  // hover, and the opacity probes. app.focus({ steal: true }) is verified to
  // work for both the dev app and the LaunchServices-launched packaged app;
  // best-effort — stages with a hard focus gate enforce it themselves.
  win.show()
  if (!win.isFocused()) {
    win.focus()
    app.focus({ steal: true })
    for (let waited = 0; waited < REFOCUS_WAIT_MS && !win.isFocused(); waited += 100) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  await body(win)
}

/** Evaluated inside the page: both sides of the last exchange present? */
const DOM_EXCHANGE_PROBE = `(() => {
  const user = document.querySelector('.msg-user')?.textContent ?? ''
  const assistant = document.querySelector('.msg-assistant')?.textContent ?? ''
  return user.length > 0 && assistant.trim().length > 0
})()`

/** Marker text appended as a simulated TUI turn (distinctive, English). */
const TUI_MARKER = 'PICODE_TUI_SIMULATED_TURN'

/** Marker for the simulated structured turn (ticket 14 replay stage). */
const STRUCTURED_MARKER = 'PICODE_REPLAY_STRUCTURED_TURN'

/** Append one user message entry to a session file, chained to its leaf.
 * The entry id is unique per call — this helper may append several times to
 * the same file (follow stream, wake-for-reject, poke turns), and a session
 * jsonl with duplicate entry ids is rejected by the resume host. */
/** Append one settled call (user + assistant, both carrying the ticket-37
 * growth marker) to a session file, chained to its leaf. This is the live-
 * follow assertion's append: the open trace tab must pick it up without
 * any re-request. */
const TRACE_GROWTH_MARKER = 'PICODE_TRACE_GROWTH_37'

async function appendTraceGrowthTurn(file: string): Promise<boolean> {
  const { appendFile, readFile } = await import('node:fs/promises')
  const text = await readFile(file, 'utf8')
  const leafId = lastEntryId(text)
  if (leafId === null) return false
  const t = new Date().toISOString()
  const entries = [
    {
      type: 'message',
      id: `t37u-${Date.now()}`,
      parentId: leafId,
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: `${TRACE_GROWTH_MARKER}: watch this call appear` }] }
    },
    {
      type: 'message',
      id: `t37a-${Date.now()}`,
      parentId: `t37u-${Date.now()}`,
      timestamp: t,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `${TRACE_GROWTH_MARKER}: the live-followed call` }],
        usage: { input: 101, output: 23 },
        timestamp: Date.parse(t)
      }
    }
  ]
  const separator = text.endsWith('\n') || text === '' ? '' : '\n'
  await appendFile(file, separator + entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return true
}

async function appendSimulatedTuiTurn(file: string): Promise<boolean> {
  const { appendFile, readFile } = await import('node:fs/promises')
  const { randomUUID } = await import('node:crypto')
  const text = await readFile(file, 'utf8')
  const leafId = lastEntryId(text)
  if (leafId === null) return false
  const entry = {
    type: 'message',
    id: `tuisim-${randomUUID().slice(0, 8)}`,
    parentId: leafId,
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: [{ type: 'text', text: `${TUI_MARKER}: still counting over here` }] }
  }
  const separator = text.endsWith('\n') || text === '' ? '' : '\n'
  await appendFile(file, separator + `${JSON.stringify(entry)}\n`)
  return true
}

/** Id of the LAST parseable non-header entry line (the current leaf). */
function lastEntryId(text: string): string | null {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i] as string) as { type?: string; id?: string }
      if (entry.type !== 'session' && typeof entry.id === 'string') return entry.id
    } catch {
      // half-written tail — keep looking upward
    }
  }
  return null
}

/**
 * Seed the ticket-31 panel stage's disposable git workspace: one committed
 * + modified file and one untracked file, so the Review tab lists two
 * deep-linkable rows. Removed by the stage's finally block.
 */
function seedPanelWorkspace(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-panel-'))
  const git = (args: string[]): string => execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString()
  const gitOpt = (args: string[]): string[] => [
    '-c', 'user.email=smoke@picode.local', '-c', 'user.name=PiCode Smoke', '-c', 'commit.gpgsign=false', ...args
  ]
  git(gitOpt(['init', '-q']))
  writeFileSync(path.join(dir, 'panel_alpha.md'), '# alpha\n\nseeded smoke content\n')
  git(gitOpt(['add', '.']))
  git(gitOpt(['commit', '-q', '-m', 'seed']))
  writeFileSync(path.join(dir, 'panel_alpha.md'), '# alpha\n\nmodified by the panel smoke\n')
  writeFileSync(path.join(dir, 'panel_beta.md'), '# beta\n\nuntracked addition\n')
  return dir
}

/**
 * Append one simulated TUI turn carrying the FULL structured shape (ticket
 * 14): user message, assistant message with thinking + toolCall + text, its
 * successful toolResult, then a second thinking + toolCall assistant message
 * whose toolResult failed. Resuming the session must replay all of it.
 */
async function appendSimulatedStructuredTurn(file: string): Promise<boolean> {
  const { appendFile, readFile } = await import('node:fs/promises')
  const text = await readFile(file, 'utf8')
  const leafId = lastEntryId(text)
  if (leafId === null) return false
  const t = new Date().toISOString()
  const entries = [
    {
      type: 'message',
      id: 'simt14u1',
      parentId: leafId,
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: `${STRUCTURED_MARKER}: replay me with full structure` }] }
    },
    {
      type: 'message',
      id: 'simt14a1',
      parentId: 'simt14u1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Simulated replay thinking: check the tool path first.', thinkingSignature: 'sim' },
          { type: 'toolCall', id: 'call_simt14_ok', name: 'bash', arguments: { command: 'echo picode_replay_tool' } },
          { type: 'text', text: 'Checking the replay tool path.' }
        ]
      }
    },
    {
      type: 'message',
      id: 'simt14r1',
      parentId: 'simt14a1',
      timestamp: t,
      message: {
        role: 'toolResult',
        toolCallId: 'call_simt14_ok',
        toolName: 'bash',
        content: [{ type: 'text', text: 'picode_replay_tool' }],
        isError: false,
        timestamp: Date.now()
      }
    },
    {
      type: 'message',
      id: 'simt14a2',
      parentId: 'simt14r1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Simulated replay thinking: now the failing call.', thinkingSignature: 'sim' },
          { type: 'toolCall', id: 'call_simt14_err', name: 'bash', arguments: { command: 'exit 1' } }
        ]
      }
    },
    {
      type: 'message',
      id: 'simt14r2',
      parentId: 'simt14a2',
      timestamp: t,
      message: {
        role: 'toolResult',
        toolCallId: 'call_simt14_err',
        toolName: 'bash',
        content: [{ type: 'text', text: 'boom: simulated replay failure' }],
        isError: true,
        timestamp: Date.now()
      }
    }
  ]
  const separator = text.endsWith('\n') || text === '' ? '' : '\n'
  await appendFile(file, separator + entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return true
}

/**
 * Backdate a session file's mtime past the 120s liveness window WITHOUT
 * touching its content — the only way the smoke can present a quiet session
 * (and thus the Open button) without really waiting two minutes.
 */
function backdateMtime(file: string): void {
  const past = new Date(Date.now() - 5 * 60_000)
  utimesSync(file, past, past)
}

/** Open every folded turn container in the current view (ticket 23 gate:
 * inner rows render only inside an open container; shared by the follow
 * and the replay audit stages). */
const openAllTurnContainers = (win: BrowserWindow): Promise<unknown> =>
  win.webContents.executeJavaScript(
    `(async () => {
      // Containers may mount across several follow/replay updates — click the
      // still-closed ones each round until EVERY container is open.
      for (let round = 0; round < 20; round++) {
        const containers = document.querySelectorAll('.turn-container').length
        const open = document.querySelectorAll('.turn-container-open').length
        if (containers > 0 && open === containers) return 'all-open'
        document
          .querySelectorAll('.turn-container:not(.turn-container-open) > .turn-container-header')
          .forEach((el) => (el instanceof HTMLElement ? el.click() : undefined))
        await new Promise((r) => setTimeout(r, 200))
      }
      return 'timeout'
    })()`
  )

/** Click a specific element (session rows by data-file, the follow Open btn). */
const clickSelector = (win: BrowserWindow, selector: string): Promise<boolean> =>
  waitForProbe(
    win,
    `(() => {
      const row = document.querySelector('${selector}')
      if (!row) return false
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`,
    2_000
  )

/** Poll `win` until the DOM probe passes (max 5s). */
function waitForDom(win: BrowserWindow): Promise<boolean> {
  return waitForProbe(win, DOM_EXCHANGE_PROBE, 5000)
}

/** Sidebar probe: any Task row (or the empty hint) means the index reached the DOM. */
const SIDEBAR_ROWS_PROBE = `(() => {
  const rows = document.querySelectorAll('.sb-task').length
  const emptyHint = document.querySelector('.sb-empty-hint')
  return rows > 0 || emptyHint !== null
})()`

/** Poll `win` until a Task row appears (max 8s — index poll runs at 2s). */
function waitForSidebarRows(win: BrowserWindow): Promise<boolean> {
  return waitForProbe(win, SIDEBAR_ROWS_PROBE, 8000)
}

function waitForProbe(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let elapsed = 0
    const poll = async (): Promise<void> => {
      const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
      if (ok || elapsed >= budgetMs) {
        resolve(ok)
        return
      }
      elapsed += 100
      setTimeout(poll, 100)
    }
    void poll()
  })
}

/** Tolerant sandbox settings read for the ticket-63 poll loops: a missing
 * or half-written document reads as {} — the next poll iteration retries. */
function readSettingsTolerant(file: string): { skills?: string[] } {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as { skills?: string[] }
  } catch {
    return {}
  }
}

// ---- ticket 89: the mock OAuth authorization server ----------------------
// A real OAuth2 authorization-code flow against a throwaway HTTP server:
// protected-resource + authorization-server metadata, dynamic client
// registration, authorize → 302 to the adapter's localhost callback, token
// exchange (code + refresh grants), and a minimal streamable-HTTP MCP
// endpoint for the adapter's post-auth reconnect. PKCE params are accepted
// but not verified — the flow shape is what the smoke proves.

let mockOAuthServer: http.Server | null = null
let mockOAuthBase = ''
const issuedCodes = new Map<string, string>()
const issuedTokens = new Set<string>()

function mockHandle(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', mockOAuthBase)
  console.log(`SMOKE mock-oauth ${req.method} ${url.pathname}`)
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*'
  }
  const json = (code: number, body: unknown): void => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...cors })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }
  if (url.pathname === '/.well-known/oauth-protected-resource') {
    json(200, { resource: mockUrl(), authorization_servers: [mockUrl()] })
    return
  }
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    json(200, {
      issuer: mockUrl(),
      authorization_endpoint: `${mockUrl()}/authorize`,
      token_endpoint: `${mockUrl()}/token`,
      registration_endpoint: `${mockUrl()}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256']
    })
    return
  }
  if (url.pathname === '/register' && req.method === 'POST') {
    json(201, { client_id: `mock-client-${Date.now()}`, client_id_issued_at: Math.floor(Date.now() / 1000), token_endpoint_auth_method: 'none', redirect_uris: [], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] })
    return
  }
  if (url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const code = `code-${randomUUID()}`
    issuedCodes.set(code, url.searchParams.get('client_id') ?? '')
    const redirect = `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    res.writeHead(302, { Location: redirect, ...cors })
    res.end()
    return
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    void readBody(req).then((body) => {
      const params = new URLSearchParams(body)
      if (params.get('grant_type') === 'authorization_code') {
        const code = params.get('code') ?? ''
        if (!issuedCodes.has(code)) {
          json(400, { error: 'invalid_grant' })
          return
        }
        issuedCodes.delete(code)
        const access = `access-${randomUUID()}`
        const refresh = `refresh-${randomUUID()}`
        issuedTokens.add(access)
        json(200, { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, scope: params.get('scope') ?? '' })
        return
      }
      if (params.get('grant_type') === 'refresh_token') {
        const access = `access-${randomUUID()}`
        issuedTokens.add(access)
        json(200, { access_token: access, token_type: 'Bearer', expires_in: 3600 })
        return
      }
      json(400, { error: 'unsupported_grant_type' })
    })
    return
  }
  if (url.pathname === '/mcp') {
    void readBody(req)
      .then((body) => {
        let message: { id?: unknown; method?: string } = {}
        try {
          message = JSON.parse(body) as { id?: unknown; method?: string }
        } catch {
          json(400, { error: 'parse error' })
          return
        }
        if (message.method === 'initialize') {
          json(200, {
            jsonrpc: '2.0',
            id: message.id ?? null,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'picode-mock-mcp', version: '1.0.0' }
            }
          })
          return
        }
        if (message.method === 'tools/list') {
          json(200, { jsonrpc: '2.0', id: message.id ?? null, result: { tools: [] } })
          return
        }
        if (message.method?.startsWith('notifications/')) {
          res.writeHead(202, cors)
          res.end()
          return
        }
        json(400, { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32601, message: 'Method not found' } })
      })
    return
  }
  res.writeHead(404, cors)
  res.end()
}

function mockUrl(): string {
  return mockOAuthBase
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += String(chunk)
    })
    req.on('end', () => resolve(data))
  })
}

/** Boot the mock OAuth server; resolves its base URL. */
function listenMockOAuth(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(mockHandle)
    server.on('error', (err) => reject(err))
    server.listen(0, '127.0.0.1', () => {
      mockOAuthServer = server
      const address = server.address() as AddressInfo
      mockOAuthBase = `http://127.0.0.1:${address.port}`
      resolve(address.port)
    })
  })
}

function stopMockOAuth(): void {
  mockOAuthServer?.close()
  mockOAuthServer = null
  mockOAuthBase = ''
  issuedCodes.clear()
  issuedTokens.clear()
}

/** Complete the authorize leg like a browser would: GET the authorization
 * URL and capture the localhost-callback redirect (the paste string). */
async function completeAuthorize(authorizationUrl: string, base: string): Promise<string> {
  const response = await fetch(authorizationUrl, { redirect: 'manual' })
  const location = response.headers.get('location')
  if (response.status !== 302 || location === null) {
    throw new Error(`the mock authorize endpoint did not redirect (status ${response.status})`)
  }
  return new URL(location, base).toString()
}

/** A free localhost port for the adapter's callback server. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      server.close(() => resolve(address.port))
    })
  })
}
