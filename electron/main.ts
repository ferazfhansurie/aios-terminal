import { app, BrowserWindow, ipcMain, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { registerPtyHandlers, startPty, destroyPty, switchCwd } from './pty'
import { setupFileHandlers, destroyFileWatcher } from './files'
import { setupScheduler, updateSchedulerCwd, destroyScheduler } from './scheduler'
import {
  listInstances,
  getActiveInstance,
  getInstanceById,
  setActiveInstanceId,
  createInstance,
  deleteInstance,
  renameInstance,
  ensureDefaultInstance,
  addExistingFolder,
  isAiosFolder,
} from './instances'

let mainWindow: BrowserWindow | null = null

// Template directory — bundled with the app
const TEMPLATE_DIR = app.isPackaged
  ? join(process.resourcesPath, 'template')
  : join(app.getAppPath(), 'template')

// Icon
const ICON_PATH = app.isPackaged
  ? join(process.resourcesPath, 'logo.png')
  : join(app.getAppPath(), 'resources/logo.png')

function createWindow() {
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

  // Register IPC handlers BEFORE loading renderer to avoid race condition.
  // PTY spawn is deferred to ready-to-show (node-pty needs full app env).
  ensureDefaultInstance()
  const active = getActiveInstance()
  registerPtyHandlers(mainWindow, active.path)
  setupFileHandlers(mainWindow, active.path)
  setupScheduler(mainWindow, active.path, (cmd) => {
    mainWindow?.webContents.send('pty:data', `\r\n\x1b[33m[scheduler]\x1b[0m Running: ${cmd}\r\n`)
    ipcMain.emit('pty:send-command', null, cmd)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.maximize()
    startPty(mainWindow!, active.path)
  })

  // --- Instance management IPC ---
  ipcMain.removeHandler('instances:list')
  ipcMain.removeHandler('instances:active')
  ipcMain.removeHandler('instances:switch')
  ipcMain.removeHandler('instances:create')
  ipcMain.removeHandler('instances:delete')
  ipcMain.removeHandler('instances:rename')
  ipcMain.removeHandler('instances:add-folder')
  ipcMain.removeHandler('app:info')

  ipcMain.handle('instances:list', () => listInstances())
  ipcMain.handle('instances:active', () => getActiveInstance())

  ipcMain.handle('instances:switch', (_event, id: string) => {
    const instance = getInstanceById(id)
    if (!instance) return false
    setActiveInstanceId(id)
    switchCwd(mainWindow!, instance.path)
    setupFileHandlers(mainWindow!, instance.path)
    updateSchedulerCwd(instance.path)
    mainWindow!.webContents.send('instance:switched', instance)
    return true
  })

  ipcMain.handle('instances:create', (_event, name: string) => {
    const instance = createInstance(name, TEMPLATE_DIR)
    setActiveInstanceId(instance.id)
    switchCwd(mainWindow!, instance.path)
    setupFileHandlers(mainWindow!, instance.path)
    updateSchedulerCwd(instance.path)
    mainWindow!.webContents.send('instance:switched', instance)
    return instance
  })

  ipcMain.handle('instances:delete', (_event, id: string) => {
    const wasActive = getActiveInstance().id === id
    const ok = deleteInstance(id)
    if (ok && wasActive) {
      const active = getActiveInstance()
      setActiveInstanceId(active.id)
      switchCwd(mainWindow!, active.path)
      setupFileHandlers(mainWindow!, active.path)
      updateSchedulerCwd(active.path)
      mainWindow!.webContents.send('instance:switched', active)
    }
    return ok
  })

  ipcMain.handle('instances:rename', (_event, id: string, newName: string) => {
    return renameInstance(id, newName)
  })

  ipcMain.handle('instances:add-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select AIOS Folder',
      message: 'Choose a folder with .claude/ directory',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const folderPath = result.filePaths[0]
    if (!isAiosFolder(folderPath)) {
      return { error: 'not-aios', message: 'Selected folder does not contain a .claude/ directory' }
    }
    const instance = addExistingFolder(folderPath)
    if (!instance) return null
    setActiveInstanceId(instance.id)
    switchCwd(mainWindow!, instance.path)
    setupFileHandlers(mainWindow!, instance.path)
    updateSchedulerCwd(instance.path)
    mainWindow!.webContents.send('instance:switched', instance)
    return instance
  })

  ipcMain.handle('app:info', () => {
    const active = getActiveInstance()
    return {
      version: '0.2.0',
      cwd: active.path,
      companyName: active.name,
      instanceId: active.id,
    }
  })
}

app.setName('AIOS Terminal')
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  destroyPty()
  destroyFileWatcher()
  destroyScheduler()
  app.quit()
})
