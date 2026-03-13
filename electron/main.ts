import { app, BrowserWindow, ipcMain, nativeImage, dialog, Menu, shell } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { initDb, closeDb, createConversation, listConversations, updateConversation, deleteConversation, addMessage, getMessages, getCreditsUsedToday, getCreditHistory } from './db'
import { runQuery, abortQuery, loadMcpServers } from './sdk'
import { setupFileHandlers, destroyFileWatcher } from './files'
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

const FREE_DAILY_CREDITS = 10_000

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
  ensureDefaultInstance()
  const active = getActiveInstance()
  setupFileHandlers(mainWindow, active.path)

  // --- SDK IPC ---
  ipcMain.removeHandler('sdk:query')
  ipcMain.removeHandler('sdk:abort')

  ipcMain.handle('sdk:query', async (_event, opts) => {
    const activeInst = getActiveInstance()
    const mcpServers = loadMcpServers(activeInst.path)

    // Check credits (free tier)
    if (!opts.apiKey) {
      const used = getCreditsUsedToday()
      if (used >= FREE_DAILY_CREDITS) {
        mainWindow?.webContents.send('sdk:error', {
          conversationId: opts.conversationId,
          error: `Daily credit limit reached (${FREE_DAILY_CREDITS.toLocaleString()} credits). Upgrade to Pro for unlimited.`,
        })
        mainWindow?.webContents.send('sdk:complete', { conversationId: opts.conversationId })
        return
      }
    }

    await runQuery(mainWindow!, {
      prompt: opts.prompt,
      conversationId: opts.conversationId,
      cwd: activeInst.path,
      sessionId: opts.sessionId,
      maxTurns: opts.maxTurns,
      apiKey: opts.apiKey,
      mcpServers,
    })
  })

  ipcMain.handle('sdk:abort', () => abortQuery())

  // --- Conversation IPC ---
  ipcMain.removeHandler('conv:create')
  ipcMain.removeHandler('conv:list')
  ipcMain.removeHandler('conv:update')
  ipcMain.removeHandler('conv:delete')
  ipcMain.removeHandler('conv:messages')
  ipcMain.removeHandler('conv:add-message')

  ipcMain.handle('conv:create', (_event, id: string, title: string) => createConversation(id, title))
  ipcMain.handle('conv:list', (_event, limit?: number) => listConversations(limit))
  ipcMain.handle('conv:update', (_event, id: string, updates: any) => updateConversation(id, updates))
  ipcMain.handle('conv:delete', (_event, id: string) => deleteConversation(id))
  ipcMain.handle('conv:messages', (_event, convId: string) => getMessages(convId))
  ipcMain.handle('conv:add-message', (_event, convId: string, role: string, content: string, tokens?: number, toolCalls?: string) => addMessage(convId, role, content, tokens, toolCalls))

  // --- Credits IPC ---
  ipcMain.removeHandler('credits:today')
  ipcMain.removeHandler('credits:history')
  ipcMain.removeHandler('credits:limit')

  ipcMain.handle('credits:today', () => getCreditsUsedToday())
  ipcMain.handle('credits:history', (_event, days?: number) => getCreditHistory(days))
  ipcMain.handle('credits:limit', () => FREE_DAILY_CREDITS)

  // --- Instance management IPC ---
  ipcMain.removeHandler('instances:list')
  ipcMain.removeHandler('instances:active')
  ipcMain.removeHandler('instances:switch')
  ipcMain.removeHandler('instances:create')
  ipcMain.removeHandler('instances:delete')
  ipcMain.removeHandler('instances:rename')
  ipcMain.removeHandler('instances:add-folder')
  ipcMain.removeHandler('app:info')
  ipcMain.removeHandler('shell:open-path')
  ipcMain.removeHandler('shell:show-in-folder')

  ipcMain.handle('shell:open-path', (_event, filePath: string) => shell.openPath(filePath))
  ipcMain.handle('shell:show-in-folder', (_event, filePath: string) => { shell.showItemInFolder(filePath) })

  ipcMain.handle('instances:list', () => listInstances())
  ipcMain.handle('instances:active', () => getActiveInstance())

  ipcMain.handle('instances:switch', (_event, id: string) => {
    const instance = getInstanceById(id)
    if (!instance) return false
    setActiveInstanceId(id)
    setupFileHandlers(mainWindow!, instance.path)
    mainWindow!.webContents.send('instance:switched', instance)
    return true
  })

  ipcMain.handle('instances:create', (_event, name: string) => {
    const instance = createInstance(name, TEMPLATE_DIR)
    setActiveInstanceId(instance.id)
    setupFileHandlers(mainWindow!, instance.path)
    mainWindow!.webContents.send('instance:switched', instance)
    return instance
  })

  ipcMain.handle('instances:delete', (_event, id: string) => {
    const wasActive = getActiveInstance().id === id
    const ok = deleteInstance(id)
    if (ok && wasActive) {
      const newActive = getActiveInstance()
      setActiveInstanceId(newActive.id)
      setupFileHandlers(mainWindow!, newActive.path)
      mainWindow!.webContents.send('instance:switched', newActive)
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
    setupFileHandlers(mainWindow!, instance.path)
    mainWindow!.webContents.send('instance:switched', instance)
    return instance
  })

  ipcMain.handle('app:info', () => {
    const activeInst = getActiveInstance()
    return {
      version: '0.3.0',
      cwd: activeInst.path,
      companyName: activeInst.name,
      instanceId: activeInst.id,
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.maximize()
  })
}

// --- New Window (spawns independent process, like VS Code) ---
function openNewWindow() {
  if (process.platform === 'darwin' && app.isPackaged) {
    // macOS: use 'open -n' to launch a new instance of the .app bundle
    const appPath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '')
    spawn('open', ['-n', appPath], { detached: true, stdio: 'ignore' }).unref()
  } else {
    // Dev mode or Windows/Linux: spawn the binary directly
    const args = app.isPackaged ? [] : [app.getAppPath()]
    spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    }).unref()
  }
}

// --- Application menu (includes New Window: Cmd+Shift+N) ---
function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: openNewWindow,
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.setName('AIOS')

app.whenReady().then(() => {
  buildAppMenu()

  // macOS dock menu: right-click dock icon → "New Window"
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(
      Menu.buildFromTemplate([{ label: 'New Window', click: openNewWindow }])
    )
  }

  initDb()
  createWindow()
})

// macOS: re-open window when dock icon clicked and no windows exist
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  closeDb()
  destroyFileWatcher()
  // macOS: keep app alive so dock click can re-open (like VS Code)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
