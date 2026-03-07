import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import { setupPty, destroyPty } from './pty'
import { setupFileHandlers, destroyFileWatcher } from './files'

let mainWindow: BrowserWindow | null = null

// Default working directory — the aios-template project
const AIOS_CWD = path.resolve(os.homedir(), 'Repo/firaz/adletic/aios-template')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    setupPty(mainWindow!, AIOS_CWD)
    setupFileHandlers(mainWindow!, AIOS_CWD)
  })

  ipcMain.handle('app:info', () => ({
    version: '0.1.0',
    cwd: AIOS_CWD,
    companyName: 'Juta (0210)',
  }))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  destroyPty()
  destroyFileWatcher()
  app.quit()
})
