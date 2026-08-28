import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { homedir } from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { HostToParent, ImageAttachment, ParentToHost } from '../shared/contract'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'
import { createWindowOptions } from './window-options'
import { HostSupervisor, defaultHostEntryPath } from './host-supervisor'
import { collectReview } from './review/collect'
import { readPreview } from './preview/read'
import { SessionIndexService, type FollowUpdate } from './sessions/index-service'
import { startSmokeIfEnabled } from './smoke'
import { startVisualIfEnabled } from './visual'
import { startTerminalVisualIfEnabled } from './visual-terminal'
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
  // scans session files (ADR-0002 / Seam-2 contract).
  const usageService = createUsageService()
  ipcMain.handle('usage:snapshot', () => usageService.snapshot())

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
  sessionIndex = new SessionIndexService({
    sessionsDir: path.join(homedir(), '.pi', 'agent', 'sessions'),
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
