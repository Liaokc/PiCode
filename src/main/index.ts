import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { homedir } from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { HostToParent, ImageAttachment, ParentToHost } from '../shared/contract'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'
import type { AuthProbeReport } from '../shared/auth-status'
import type { AppPreferences } from '../shared/preferences'
import { createWindowOptions } from './window-options'
import { HostSupervisor, defaultHostEntryPath } from './host-supervisor'
import { collectReview } from './review/collect'
import { readPreview } from './preview/read'
import { SessionIndexService, type FollowUpdate } from './sessions/index-service'
import { SettingsService, type SettingsSnapshot } from './settings/service'
import { runAuthProbeHost } from './settings/probe-runner'
import { startSmokeIfEnabled } from './smoke'
import { startVisualIfEnabled } from './visual'
import { startSettingsVisualIfEnabled } from './visual-settings'
import { startTerminalVisualIfEnabled } from './visual-terminal'
import { startUsageVisualIfEnabled } from './visual-usage'
import { fakeUsageSnapshot } from '../shared/usage/fixture'
import { TerminalService, type TerminalDataMessage, type TerminalExitMessage } from './terminal/service'
import { nodePtyFactory } from './terminal/node-pty-factory'
import { createUsageService } from './usage/service'

let supervisor: HostSupervisor | null = null
let sessionIndex: SessionIndexService | null = null
let terminalService: TerminalService | null = null

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

  let smokeTap: ((event: HostToParent) => void) | null = null
  let mainWindow: BrowserWindow | null = null
  supervisor = new HostSupervisor({
    hostEntryPath: defaultHostEntryPath(),
    onHostEvent: (event) => {
      broadcastToWindows(event)
      smokeTap?.(event)
    },
    onHostLog: (stream, chunk) => console.log(`[host ${stream}]`, chunk.trimEnd())
  })
  smokeTap = startSmokeIfEnabled(supervisor, () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startTerminalVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

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
    newTaskDirectory: 'ask'
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
