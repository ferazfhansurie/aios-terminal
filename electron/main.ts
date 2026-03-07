import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import os from 'os'
import { setupPty, destroyPty } from './pty'
import { setupFileHandlers, destroyFileWatcher } from './files'

let mainWindow: BrowserWindow | null = null

// Default working directory — always aios-template
const AIOS_CWD = join(os.homedir(), 'Repo/firaz/adletic/aios-template')

// Icon — resolve from project root in dev, or from resources in prod
const ICON_PATH = app.isPackaged
  ? join(process.resourcesPath, 'logo.png')
  : join(app.getAppPath(), 'resources/logo.png')

function createWindow() {
  // Set dock icon on macOS (also handles dev mode where electron-builder hasn't run)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(ICON_PATH))
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    icon: ICON_PATH,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.maximize()
    setupPty(mainWindow!, AIOS_CWD)
    setupFileHandlers(mainWindow!, AIOS_CWD)
  })

  ipcMain.removeHandler('app:info')
  ipcMain.handle('app:info', () => ({
    version: '0.1.0',
    cwd: AIOS_CWD,
    companyName: 'Adletic (0210)',
  }))
}

app.setName('AIOS Terminal')
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  destroyPty()
  destroyFileWatcher()
  app.quit()
})
