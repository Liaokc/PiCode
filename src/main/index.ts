import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import type { HostToParent, ParentToHost } from '../shared/contract'
import { createWindowOptions } from './window-options'
import { HostSupervisor, defaultHostEntryPath } from './host-supervisor'
import { startSmokeIfEnabled } from './smoke'
import { createUsageService } from './usage/service'

let supervisor: HostSupervisor | null = null

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

  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// No orphaned agent hosts on quit (ticket acceptance): polite shutdown first.
app.on('before-quit', () => {
  supervisor?.shutdownAll()
})
