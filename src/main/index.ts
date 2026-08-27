import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { createWindowOptions } from './window-options'

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions(path.join(__dirname, '../preload/index.js')))
  win.webContents.once('did-finish-load', () => console.log('[shell] renderer finished loading'))
  win.once('ready-to-show', () => {
    console.log('[shell] showing main window')
    win.show()
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
