import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { HostToParent, ImageAttachment, ParentToHost } from '../shared/contract'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'
import type { AuthProbeReport } from '../shared/auth-status'
import type { AppPreferences } from '../shared/preferences'
import { SIDEBAR_WIDTH_PX } from '../shared/layout-model'
import { PANEL_DEFAULT_WIDTH_PX } from '../shared/panel-model'
import { createWindowOptions } from './window-options'
import { HostSupervisor, defaultHostEntryPath } from './host-supervisor'
import { createApprovalNotifier, parseApprovalNotice } from './notifications'
import { collectReview } from './review/collect'
import { readPreview } from './preview/read'
import { SessionIndexService, type FollowUpdate } from './sessions/index-service'
import { SessionContextActionService } from './sessions/context-actions'
import { SettingsService, type SettingsSnapshot } from './settings/service'
import { runAuthProbeHost } from './settings/probe-runner'
import { startSmokeIfEnabled, smokeEnabled, type SmokeHooks } from './smoke'
import { startVisualIfEnabled } from './visual'
import { startDensityVisualIfEnabled } from './visual-density'
import { startSettingsVisualIfEnabled } from './visual-settings'
import { startTerminalVisualIfEnabled } from './visual-terminal'
import { startMultiSessionVisualIfEnabled, isolateVisualUserData } from './visual-multisession'
import { startRowGeometryVisualIfEnabled, isolateRowGeometryUserData } from './visual-row-geometry'
import { startFilterVisualIfEnabled, isolateFilterUserData } from './visual-filter'
import { startContextMenuVisualIfEnabled, isolateContextMenuUserData } from './visual-context-menu'
import { startApprovalVisualIfEnabled } from './visual-approval'
import { startUsageVisualIfEnabled } from './visual-usage'
import { startPerfIfEnabled } from './visual-perf'
import { fakeUsageSnapshot } from '../shared/usage/fixture'
import { TerminalService, type TerminalDataMessage, type TerminalExitMessage } from './terminal/service'
import { nodePtyFactory } from './terminal/node-pty-factory'
import { createUsageService } from './usage/service'

let supervisor: HostSupervisor | null = null
let sessionIndex: SessionIndexService | null = null
let terminalService: TerminalService | null = null

// Ticket-19 visual harness: the hide/restore captures drive the REAL
// settings service, so the multi-session visual run gets throwaway userData
// (no-op unless PICODE_VISUAL_MULTI=1). Must run before app.whenReady.
isolateVisualUserData()
// Ticket-34 row-geometry harness pins through the REAL pin button (writes
// the pin preference) — throwaway userData for it too (no-op unless
// PICODE_VISUAL_ROW_GEOMETRY=1).
isolateRowGeometryUserData()
// Ticket-33 filter-dropdown harness drives the REAL preferences (dropdown
// choices + pin) — throwaway userData for it too (no-op unless
// PICODE_VISUAL_FILTER=1).
isolateFilterUserData()
// Ticket-35 context-menu harness archives/restores through the REAL
// preferences channel — same throwaway-userData rule (no-op unless
// PICODE_VISUAL_CONTEXT_MENU=1).
isolateContextMenuUserData()

// Ticket-13 hygiene, extended by ticket 31: the smoke drives the REAL
// settings service too (panel recently closed round-trip), so it gets the
// same throwaway userData — the operator's PiCode preferences are never
// touched by a smoke run. No-op unless PICODE_SMOKE=1.
if (smokeEnabled()) {
  app.setPath('userData', path.join(tmpdir(), `picode-smoke-userdata-${process.pid}`))
}

// Ticket-29 layout smoke: the drag + restart persistence assertions run
// against throwaway userData so a real profile is never touched (no-op
// unless the smoke driver sets the env). Must run before app.whenReady.
const layoutSmokeUserData = process.env['PICODE_LAYOUT_SMOKE_USER_DATA']
if (typeof layoutSmokeUserData === 'string' && layoutSmokeUserData !== '') {
  app.setPath('userData', layoutSmokeUserData)
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions(path.join(__dirname, '../preload/index.js')))
  win.once('ready-to-show', () => win.show())

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

function broadcastToWindows(event: HostToParent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('chat:from-host', event)
  }
}

function broadcastChannel(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

app.whenReady().then(() => {
  // Usage charts consume only this aggregated snapshot — the renderer never
  // scans session files (ADR-0002 / Seam-2 contract). PICODE_FAKE_USAGE=1
  // serves the deterministic visual-QA fixture instead of the real scan.
  const usageService = createUsageService()
  const fakeUsage = process.env['PICODE_FAKE_USAGE'] === '1'
  ipcMain.handle('usage:snapshot', () => (fakeUsage ? Promise.resolve(fakeUsageSnapshot()) : usageService.snapshot()))

  // Settings + read-only auth status (ticket 11). Preferences persist to
  // PiCode's own file — never Pi's settings.json; the auth report comes from
  // a short-lived probe host (ADR-0003: the SDK never loads here).
  const hostEntry = defaultHostEntryPath()
  const fakeSettings = process.env['PICODE_FAKE_SETTINGS'] === '1'
  const settings = new SettingsService({
    file: path.join(app.getPath('userData'), 'picode-settings.json'),
    probe: () => runAuthProbeHost(hostEntry)
  })
  ipcMain.handle('settings:get', (): Promise<SettingsSnapshot> =>
    fakeSettings
      ? Promise.resolve({ preferences: fakePreferences(), lastUsedDirectory: process.cwd() })
      : settings.getSnapshot()
  )
  ipcMain.handle('settings:set', (_event, patch: unknown): Promise<AppPreferences> => {
    if (fakeSettings) return Promise.resolve(fakePreferences())
    return settings.setPreferences(patch)
  })
  ipcMain.handle('settings:refresh-auth', (): Promise<AuthProbeReport> =>
    fakeSettings
      ? Promise.resolve(fakeAuthReport())
      : settings.authReport(true)
  )

  let smokeHooks: SmokeHooks | null = null
  let mainWindow: BrowserWindow | null = null
  const smokeWindow = (): BrowserWindow | null => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
  // Read-only context-menu actions (ticket 35): the session row menu's
  // Reveal in Finder + copy actions. Main validates every payload and the
  // performed actions land in a bounded log the electron smoke asserts
  // against — the renderer has no direct shell/clipboard access.
  const contextActions = new SessionContextActionService({
    reveal: (file) => shell.showItemInFolder(file),
    copy: (text) => clipboard.writeText(text)
  })
  ipcMain.handle('sessions:context-action', (_event, action: unknown) => contextActions.perform(action))
  supervisor = new HostSupervisor({
    hostEntryPath: defaultHostEntryPath(),
    onHostEvent: (event) => {
      broadcastToWindows(event)
      smokeHooks?.onHostEvent(event)
    },
    onHostLog: (stream, chunk) => console.log(`[host ${stream}]`, chunk.trimEnd())
  })
  smokeHooks = startSmokeIfEnabled(supervisor, smokeWindow, contextActions)
  // System notifications for background-session approval gates (ticket 25):
  // the renderer asks only for sessions whose pill is not on screen; the
  // click deep-links back to the waiting session and approves nothing.
  const approvalNotifier = createApprovalNotifier({
    getWindow: smokeWindow,
    onNotice: (notice) => smokeHooks?.onApprovalNotice(notice)
  })
  ipcMain.on('notifications:approval-request', (_event, payload: unknown) => {
    const notice = parseApprovalNotice(payload)
    if (notice !== null) approvalNotifier.notify(notice)
  })
  startVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startDensityVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startTerminalVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-20 dot/alignment harness must run BEFORE the session index is
  // constructed: it seeds an isolated store via PICODE_SESSION_DIR.
  startMultiSessionVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-25 badge/parked-pill harness — same seeding constraint.
  startApprovalVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-34 row-geometry harness — same seeding constraint (it also pins
  // through the real button, which needs the seeded rows).
  startRowGeometryVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-33 filter-dropdown harness — same seeding constraint (it also
  // pins and persists dropdown choices through the real UI).
  startFilterVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-35 context-menu/archive harness — same seeding constraint.
  startContextMenuVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

  // Renderer → host relay (Seam-1: the only chat channel the renderer has).
  ipcMain.on('chat:to-host', (_event, message: ParentToHost) => {
    // Startup preference bookkeeping: remember the last working directory a
    // session actually used (create or resume) for "reuse last folder".
    if (message.type === 'create_session' || message.type === 'resume_session') {
      void settings.recordLastUsedDirectory(message.cwd)
    }
    supervisor?.handleParentCommand(message)
  })

  ipcMain.handle('chat:pick-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Choose a working directory',
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Composer image attachments (ticket 05): picked images are read in the
  // main process and delivered to the renderer as base64 contract payloads.
  ipcMain.handle('chat:pick-images', async (event): Promise<ImageAttachment[]> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Attach images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    })
    if (result.canceled) return []
    const attachments: ImageAttachment[] = []
    for (const file of result.filePaths) {
      try {
        const buffer = await fs.readFile(file)
        const ext = path.extname(file).toLowerCase().replace('.', '')
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
        attachments.push({ mimeType, data: buffer.toString('base64') })
      } catch {
        // Unreadable file — skip it rather than failing the whole pick.
      }
    }
    return attachments
  })

  // Review tab (ticket 06): git workspace-vs-HEAD snapshots, read-only.
  ipcMain.handle('review:load', (_event, cwd: unknown): Promise<ReviewResult> => {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      return Promise.resolve({ ok: false, reason: 'failed', message: 'No working directory selected.' })
    }
    return collectReview(cwd)
  })

  // File Preview tab (ticket 07): file contents + directory listings for the
  // breadcrumb navigation, read-only, with the policy's hard size cap.
  ipcMain.handle('preview:load', (_event, cwd: unknown, target: unknown): Promise<PreviewResult> => {
    if (typeof cwd !== 'string' || cwd.length === 0 || typeof target !== 'string') {
      return Promise.resolve({ ok: false, reason: 'failed', message: 'No preview target selected.' })
    }
    return readPreview(cwd, target)
  })
  // Terminal tab (ticket 08, Seam-3): the REAL pty lives here, behind the
  // node-pty factory adapter; bytes flow over terminal-dedicated batched
  // channels, never the chat contract stream (ADR-0004). Read-only guard:
  // every channel validates types before touching the service.
  const terminals = new TerminalService(nodePtyFactory(), {
    data: (message: TerminalDataMessage) => broadcastChannel('terminal:data', message),
    exit: (message: TerminalExitMessage) => broadcastChannel('terminal:exit', message)
  })
  terminalService = terminals
  ipcMain.handle('terminal:start', (_event, id: unknown, cwd: unknown, cols: unknown, rows: unknown) => {
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof cwd !== 'string' ||
      cwd.length === 0 ||
      typeof cols !== 'number' ||
      typeof rows !== 'number'
    ) {
      return null
    }
    return terminals.start(id, { cwd, cols, rows })
  })
  ipcMain.on('terminal:input', (_event, id: unknown, data: unknown) => {
    if (typeof id !== 'string' || typeof data !== 'string') return
    terminals.write(id, data)
  })
  ipcMain.on('terminal:resize', (_event, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id !== 'string' || typeof cols !== 'number' || typeof rows !== 'number') return
    terminals.resize(id, cols, rows)
  })
  ipcMain.on('terminal:kill', (_event, id: unknown) => {
    if (typeof id !== 'string') return
    terminals.dispose(id)
  })

  // Session index + Live Follow (ticket 04): read-only scan of the shared Pi
  // session store; the only write is the rename write-back for non-active
  // sessions (the active session renames through its host process).
  // PICODE_SESSION_DIR (ticket 13 smoke isolation) points the whole app at a
  // throwaway store so smoke runs never touch the real session files.
  sessionIndex = new SessionIndexService({
    sessionsDir: process.env['PICODE_SESSION_DIR'] || path.join(homedir(), '.pi', 'agent', 'sessions'),
    onIndexChanged: () => broadcastChannel('sessions:index-changed', null),
    onFollowUpdate: (update: FollowUpdate) => broadcastChannel('sessions:follow-update', update)
  })
  ipcMain.handle('sessions:list', () => sessionIndex?.list())
  ipcMain.handle('sessions:rename', (_event, file: string, name: string) => {
    if (typeof file !== 'string' || typeof name !== 'string') return null
    return sessionIndex?.renameSession(file, name)
  })
  ipcMain.handle('sessions:follow', async (_event, file: string) => {
    if (typeof file !== 'string') return null
    await sessionIndex?.startFollowing(file)
    return sessionIndex?.followSnapshot(file)
  })
  ipcMain.on('sessions:unfollow', () => sessionIndex?.stopFollowing())
  sessionIndex.start()

  startSettingsVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startUsageVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-30 perf harness: seeds a heavy markdown transcript + open panel/
  // dock resizers, then parks the window for the CDP flamegraph driver.
  startPerfIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// No orphaned agent hosts on quit (ticket acceptance): polite shutdown first.
// Also no orphaned pty shells (ticket 08).
app.on('before-quit', () => {
  supervisor?.shutdownAll()
  sessionIndex?.stop()
  terminalService?.disposeAll()
})

// ---- visual-QA fixtures (PICODE_FAKE_SETTINGS=1): deterministic settings
// data for the settings-window screenshot pass. Never used in normal runs. ----
function fakePreferences(): AppPreferences {
  return {
    defaultModel: { providerId: 'bella', modelId: 'GLM-5.3' },
    defaultThinkingLevel: 'high',
    newTaskDirectory: 'fixed',
    newTaskFixedProject: '/Users/demo/Projects/picode',
    hiddenGroups: ['/Users/demo/Projects/archive'],
    archivedSessions: [],
    readStates: {},
    recentlyClosedTabs: [],
    sidebarView: 'projects',
    sidebarSort: 'updated',
    sidebarWidth: SIDEBAR_WIDTH_PX,
    panelWidth: PANEL_DEFAULT_WIDTH_PX
  }
}

function fakeAuthReport(): AuthProbeReport {
  return {
    scannedAt: Date.now(),
    error: null,
    models: [
      { providerId: 'anthropic', modelId: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
      { providerId: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { providerId: 'openai', modelId: 'gpt-5.1', name: 'GPT-5.1' },
      { providerId: 'bella', modelId: 'GLM-5.3', name: 'GLM-5.3' },
      { providerId: 'bella', modelId: 'GLM-5.3-flash', name: 'GLM-5.3-flash' },
      { providerId: 'google', modelId: 'gemini-3-pro', name: 'Gemini 3 Pro' }
    ],
    providers: [
      { providerId: 'anthropic', name: 'Anthropic', modelCount: 12, authType: 'oauth', source: 'OAuth', oauthExpiresAt: Date.now() + 86_400_000 },
      { providerId: 'openai', name: 'OpenAI', modelCount: 8, authType: 'api_key', source: 'OPENAI_API_KEY', oauthExpiresAt: null },
      { providerId: 'google', name: 'Google', modelCount: 6, authType: 'oauth', source: 'OAuth', oauthExpiresAt: Date.now() - 3_600_000 },
      { providerId: 'bella', name: 'Bella', modelCount: 3, authType: 'api_key', source: 'bella.apiKey', oauthExpiresAt: null },
      { providerId: 'github-copilot', name: 'GitHub Copilot', modelCount: 5, authType: null, source: null, oauthExpiresAt: null },
      { providerId: 'zai', name: 'Z.ai', modelCount: 4, authType: null, source: null, oauthExpiresAt: null }
    ]
  }
}
