import { app, BrowserWindow, ipcMain, nativeImage, dialog, Menu, shell, clipboard } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { initDb, closeDb, createConversation, listConversations, updateConversation, deleteConversation, addMessage, getMessages, getCreditsUsedToday, getCreditHistory, registerUser, loginUser, getUserTier, setUserTier } from './db'
import { runQuery, abortQuery, loadMcpServers } from './sdk'
import { setupFileHandlers, destroyFileWatcher } from './files'
import { setupScheduler, destroyScheduler, updateSchedulerCwd } from './scheduler'
import { setupWhatsApp, destroyWhatsApp } from './whatsapp'
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

const FREE_DAILY_CREDITS = 500

// Fix PATH for packaged app — Electron doesn't inherit shell PATH
if (app.isPackaged) {
  try {
    const { execSync } = require('child_process')
    const shell = process.env.SHELL || '/bin/zsh'
    const shellPath = execSync(`${shell} -ilc 'echo $PATH'`, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (shellPath) process.env.PATH = shellPath
  } catch {
    // Fallback to common paths
    const extraPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      `${process.env.HOME}/.nvm/versions/node/current/bin`,
      `${process.env.HOME}/.volta/bin`,
      '/usr/bin',
      '/bin',
    ]
    const currentPath = process.env.PATH || ''
    process.env.PATH = [...extraPaths, currentPath].join(':')
  }
}

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

  // Open DevTools with Cmd+Shift+I (even in production)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if ((input.meta || input.control) && input.shift && input.key === 'I') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Register IPC handlers BEFORE loading renderer to avoid race condition.
  ensureDefaultInstance()
  const active = getActiveInstance()
  setupFileHandlers(mainWindow, active.path)

  // Scheduler — execute scheduled commands via SDK
  const schedulerCommandSender = (command: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    // Send to renderer so it creates a conversation and runs the query normally
    mainWindow.webContents.send('schedule:execute', { command })
  }
  setupScheduler(mainWindow, active.path, schedulerCommandSender)

  // --- SDK IPC ---
  ipcMain.removeHandler('sdk:query')
  ipcMain.removeHandler('sdk:abort')

  ipcMain.handle('sdk:query', async (_event, opts) => {
    console.log('[MAIN] sdk:query received:', { apiKey: opts.apiKey?.slice(0, 20), convId: opts.conversationId?.slice(0, 8), prompt: opts.prompt?.slice(0, 60) })
    const activeInst = getActiveInstance()
    console.log('[MAIN] activeInst:', activeInst.name, activeInst.path)
    const mcpServers = loadMcpServers(activeInst.path)

    // Check credits (free tier only — owner and pro skip)
    const isOwner = opts.apiKey === '__owner__'
    const isPro = opts.apiKey?.startsWith('user:') && getUserTier(opts.apiKey.replace('user:', '')) === 'pro'
    console.log('[MAIN] isOwner:', isOwner, 'isPro:', isPro)
    if (!isOwner && !isPro) {
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

  // --- MCP Servers IPC ---
  ipcMain.removeHandler('mcp:list')
  ipcMain.removeHandler('mcp:save')

  ipcMain.handle('mcp:list', () => {
    const activeInst = getActiveInstance()
    const mcpPath = join(activeInst.path, '.mcp.json')
    if (!existsSync(mcpPath)) return {}
    try {
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'))
      return config.mcpServers || {}
    } catch {
      return {}
    }
  })

  ipcMain.handle('mcp:save', (_event, servers: Record<string, any>) => {
    const activeInst = getActiveInstance()
    const mcpPath = join(activeInst.path, '.mcp.json')
    const config = { mcpServers: servers }
    writeFileSync(mcpPath, JSON.stringify(config, null, 2))
    return true
  })

  // --- WhatsApp (native WWebJS) ---
  setupWhatsApp(mainWindow)

  // --- Auth IPC ---
  ipcMain.removeHandler('auth:register')
  ipcMain.removeHandler('auth:login')

  ipcMain.handle('auth:register', (_event, data: { email: string; password: string; name: string }) => {
    return registerUser(data.email, data.password, data.name)
  })

  ipcMain.handle('auth:login', (_event, data: { email: string; password: string }) => {
    return loginUser(data.email, data.password)
  })

  // --- Setup / Onboarding IPC ---
  ipcMain.removeHandler('setup:save')
  ipcMain.removeHandler('setup:status')
  ipcMain.removeHandler('auth:set-tier')

  ipcMain.handle('setup:save', (_event, data: any) => {
    const activeInst = getActiveInstance()
    const ctxDir = join(activeInst.path, '.claude', 'context')
    mkdirSync(ctxDir, { recursive: true })

    // Generate personal-info.md
    const personalInfo = `# Team Member

- **Name:** ${data.name || 'Not set'}
- **Role:** ${data.role || 'Not set'}
- **Business:** ${data.businessName || 'Not set'}
- **Onboarded:** ${new Date().toISOString().split('T')[0]}
`
    writeFileSync(join(ctxDir, 'personal-info.md'), personalInfo, 'utf-8')

    // Generate business-info.md
    let bizInfo = `# ${data.businessName || 'Business'}\n\n`
    bizInfo += `## Overview\n${data.businessDescription || 'Not set'}\n\n`
    bizInfo += `## Market\n${data.market || 'Not set'}\n\n`
    bizInfo += `## Industry\n${data.industry || 'Not set'}\n\n`
    bizInfo += `## Currency\n${data.currency || 'RM'}\n\n`

    if (data.products?.length) {
      bizInfo += `## Products & Services\n`
      for (const p of data.products) {
        bizInfo += `- **${p.name}** — ${data.currency || 'RM'}${p.price}${p.description ? ` — ${p.description}` : ''}\n`
      }
      bizInfo += '\n'
    }

    if (data.team?.length) {
      bizInfo += `## Team\n`
      for (const t of data.team) {
        bizInfo += `- **${t.name}** — ${t.role}\n`
      }
      bizInfo += '\n'
    }

    if (data.clients?.length) {
      bizInfo += `## Clients\n`
      for (const c of data.clients) {
        bizInfo += `- **${c.name}** — ${data.currency || 'RM'}${c.revenue}/mo (${c.status})\n`
      }
      bizInfo += '\n'
    }

    if (data.tools?.length) {
      bizInfo += `## Tools & Integrations\n`
      for (const tool of data.tools) {
        bizInfo += `- ${tool}\n`
      }
      bizInfo += '\n'
    }

    writeFileSync(join(ctxDir, 'business-info.md'), bizInfo, 'utf-8')

    // Generate current-data.md
    const currentData = `# Current Data

Last updated: ${new Date().toISOString().split('T')[0]}

## Metrics
- Revenue: Not tracked yet
- Expenses: Not tracked yet

## Recent Activity
- AIOS setup completed
`
    writeFileSync(join(ctxDir, 'current-data.md'), currentData, 'utf-8')

    // Generate customized CLAUDE.md
    const claudeMd = `# AIOS — AI Operating System

You are AIOS, an AI co-founder for ${data.businessName || 'this business'}.

## Identity
- You work with ${data.name || 'the team'}${data.role ? ` (${data.role})` : ''}.
- Talk like a sharp co-founder, not a help desk. Short, direct, opinionated.
- Take action first. If asked to check something, do it immediately.
- NEVER list capabilities. Just do things.

## How This Works
You ARE the interface. No dashboard needed. Just conversation + tools.
- Context: \`.claude/context/\` files (your business knowledge)
- Skills: \`.claude/skills/\` files (specialized capabilities)
- Outputs: \`outputs/\` directory (deliverables)
- Files: \`files/\` directory (uploaded assets)

## 5 Layers
1. **Context** — Memory files in \`.claude/context/\`
2. **Data** — Direct access via MCP tools or scripts
3. **Intelligence** — Skills in \`.claude/skills/\` that analyze data
4. **Automate** — Scripts, integrations, scheduled tasks
5. **Build** — Generate deliverables into \`outputs/\`

## Commands
| Command | Purpose |
|---------|---------|
| \`/prime\` | Load context, check systems, ready to work |
| \`/onboard\` | Update business knowledge |
| \`/create-skill\` | Create a new skill interactively |

## Context Files
- \`.claude/context/personal-info.md\` — Who you're working with
- \`.claude/context/business-info.md\` — Company, products, clients, financials
- \`.claude/context/current-data.md\` — Live metrics, recent activity

## Preferences
- Concise and direct
- Currency: ${data.currency || 'RM'}
- Save outputs to \`outputs/\`
- After important sessions, update \`.claude/context/current-data.md\`
`
    writeFileSync(join(activeInst.path, 'CLAUDE.md'), claudeMd, 'utf-8')

    return { success: true }
  })

  ipcMain.handle('setup:status', () => {
    const activeInst = getActiveInstance()
    // Skip wizard if CLAUDE.md already has real content (existing instance)
    const claudeMdPath = join(activeInst.path, 'CLAUDE.md')
    if (existsSync(claudeMdPath)) {
      const content = readFileSync(claudeMdPath, 'utf-8')
      if (content.length > 100 && !content.includes('[NOT SET]')) {
        return { needsSetup: false }
      }
    }
    // Skip wizard if personal-info.md exists with real content
    const personalPath = join(activeInst.path, '.claude', 'context', 'personal-info.md')
    if (existsSync(personalPath)) {
      const content = readFileSync(personalPath, 'utf-8')
      if (!content.includes('[NOT SET]')) return { needsSetup: false }
    }
    return { needsSetup: true }
  })

  ipcMain.handle('auth:set-tier', (_event, email: string, tier: string) => {
    setUserTier(email, tier)
    return { success: true }
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
  ipcMain.removeHandler('shell:open-path')
  ipcMain.removeHandler('shell:show-in-folder')
  ipcMain.removeHandler('files:save-temp-image')
  ipcMain.removeHandler('clipboard:read-image')

  ipcMain.handle('shell:open-path', (_event, filePath: string) => shell.openPath(filePath))
  ipcMain.handle('shell:show-in-folder', (_event, filePath: string) => { shell.showItemInFolder(filePath) })

  // Save pasted clipboard image to temp file, return path
  ipcMain.handle('files:save-temp-image', (_event, base64Data: string, mimeType: string) => {
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : 'jpg'
    const fileName = `paste-${Date.now()}.${ext}`
    const tmpDir = join(app.getPath('temp'), 'aios-images')
    mkdirSync(tmpDir, { recursive: true })
    const filePath = join(tmpDir, fileName)
    const buffer = Buffer.from(base64Data, 'base64')
    writeFileSync(filePath, buffer)
    return filePath
  })

  // Read image from system clipboard (native Electron API — most reliable)
  ipcMain.handle('clipboard:read-image', () => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    const png = img.toPNG()
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    // Also save to temp file so it can be attached to messages
    const fileName = `paste-${Date.now()}.png`
    const tmpDir = join(app.getPath('temp'), 'aios-images')
    mkdirSync(tmpDir, { recursive: true })
    const filePath = join(tmpDir, fileName)
    writeFileSync(filePath, png)
    return { dataUrl, filePath }
  })

  ipcMain.handle('instances:list', () => listInstances())
  ipcMain.handle('instances:active', () => getActiveInstance())

  ipcMain.handle('instances:switch', (_event, id: string) => {
    const instance = getInstanceById(id)
    if (!instance) return false
    setActiveInstanceId(id)
    setupFileHandlers(mainWindow!, instance.path)
    updateSchedulerCwd(instance.path)
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
  destroyScheduler()
  destroyWhatsApp()
  // macOS: keep app alive so dock click can re-open (like VS Code)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
