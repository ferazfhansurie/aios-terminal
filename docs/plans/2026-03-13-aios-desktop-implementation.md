# AIOS Desktop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the existing aios-terminal Electron app from a PTY-based terminal into a ChatGPT-style AI chat app powered by Claude Code SDK, with a credit system for freemium monetization.

**Architecture:** Electron main process runs Claude Code SDK via `query()` generator, streaming results over IPC to a React chat UI. Credits are tracked per-query based on token usage (1 credit = 10 tokens). SQLite stores conversation history and credit ledger. The existing PTY/terminal code is replaced entirely.

**Tech Stack:** Electron 33, React 19, Tailwind v4, Zustand, Claude Code SDK (`@anthropic-ai/claude-code`), better-sqlite3, react-markdown, shiki, framer-motion

---

## Task 1: Clean up project and add new dependencies

**Files:**
- Modify: `package.json`
- Delete: `electron/pty.ts` (PTY no longer needed)
- Modify: `electron.vite.config.ts` (remove node-pty external)
- Modify: `electron-builder.yml` (update app name, add better-sqlite3 native rebuild)

**Step 1: Update package.json — remove PTY deps, add SDK + new deps**

Replace the dependencies and devDependencies in `package.json`:

```json
{
  "name": "aios-desktop",
  "version": "0.1.0",
  "description": "AIOS — AI that controls your computer",
  "author": "Adletic",
  "main": "out/main/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder",
    "build:mac": "electron-vite build && electron-builder --mac",
    "build:linux": "electron-vite build && electron-builder --linux",
    "build:win": "electron-vite build && electron-builder --win",
    "preview": "electron-vite preview",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "chokidar": "^4.0.0",
    "electron-store": "^10.0.0",
    "keytar": "^7.9.0"
  },
  "devDependencies": {
    "@electron-toolkit/utils": "^4.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^5.0.0",
    "framer-motion": "^12.0.0",
    "postcss": "^8.4.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0",
    "rehype-highlight": "^7.0.0",
    "rehype-raw": "^7.0.0",
    "remark-gfm": "^4.0.0",
    "shiki": "^1.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "zustand": "^5.0.0"
  }
}
```

**Step 2: Update electron.vite.config.ts — remove node-pty, add better-sqlite3**

```typescript
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts'),
        formats: ['cjs'],
      },
      rollupOptions: {
        external: [
          'electron',
          'better-sqlite3',
          'keytar',
          'electron-store',
          '@anthropic-ai/claude-code',
          'path',
          'os',
          'fs',
          'chokidar',
        ],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
        formats: ['cjs'],
      },
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html'),
      },
    },
    plugins: [react()],
  },
})
```

**Step 3: Update electron-builder.yml**

```yaml
appId: com.adletic.aios
productName: AIOS
copyright: Copyright © 2025 Adletic

directories:
  buildResources: resources
  output: release

files:
  - out/**/*
  - resources/**/*
  - package.json

extraResources:
  - from: template
    to: template
    filter:
      - "**/*"

npmRebuild: true

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.icns
  category: public.app-category.productivity
  identity: null
  hardenedRuntime: false
  gatekeeperAssess: false

dmg:
  title: AIOS
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

linux:
  target:
    - target: AppImage
      arch: [x64, arm64]
  icon: resources/logo.png
  category: Utility

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

**Step 4: Delete pty.ts**

Delete `electron/pty.ts` — no longer needed.

**Step 5: Install dependencies**

Run: `npm install`
Expected: Clean install with no errors.

**Step 6: Commit**

```bash
git add package.json electron.vite.config.ts electron-builder.yml
git rm electron/pty.ts
git commit -m "refactor: strip PTY, add Claude Code SDK + chat dependencies"
```

---

## Task 2: Database layer (SQLite)

**Files:**
- Create: `electron/db.ts`

**Step 1: Create the SQLite database module**

This handles conversations, messages, and credits. File: `electron/db.ts`

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database

export function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'aios.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      tool_calls TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      credits_used REAL NOT NULL DEFAULT 0,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      conversation_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_credits_date ON credits(date);
  `)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ── Conversations ──

export function createConversation(id: string, title: string) {
  const now = Date.now()
  getDb().prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, title, now, now)
  return { id, title, created_at: now, updated_at: now }
}

export function listConversations(limit = 50) {
  return getDb().prepare(
    'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?'
  ).all(limit)
}

export function updateConversation(id: string, updates: { title?: string; session_id?: string }) {
  const sets: string[] = ['updated_at = ?']
  const vals: any[] = [Date.now()]
  if (updates.title) { sets.push('title = ?'); vals.push(updates.title) }
  if (updates.session_id) { sets.push('session_id = ?'); vals.push(updates.session_id) }
  vals.push(id)
  getDb().prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function deleteConversation(id: string) {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

// ── Messages ──

export function addMessage(conversationId: string, role: string, content: string, tokensUsed = 0, toolCalls?: string) {
  getDb().prepare(
    'INSERT INTO messages (conversation_id, role, content, tokens_used, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(conversationId, role, content, tokensUsed, toolCalls || null, Date.now())
}

export function getMessages(conversationId: string) {
  return getDb().prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId)
}

// ── Credits ──

export function addCreditUsage(tokensUsed: number, conversationId?: string) {
  const today = new Date().toISOString().split('T')[0]
  const credits = tokensUsed / 10
  getDb().prepare(
    'INSERT INTO credits (date, credits_used, tokens_used, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(today, credits, tokensUsed, conversationId || null, Date.now())
}

export function getCreditsUsedToday(): number {
  const today = new Date().toISOString().split('T')[0]
  const row = getDb().prepare(
    'SELECT COALESCE(SUM(credits_used), 0) as total FROM credits WHERE date = ?'
  ).get(today) as any
  return row?.total || 0
}

export function getCreditHistory(days = 7) {
  return getDb().prepare(
    `SELECT date, SUM(credits_used) as credits, SUM(tokens_used) as tokens
     FROM credits
     WHERE date >= date('now', ?)
     GROUP BY date
     ORDER BY date DESC`
  ).all(`-${days} days`)
}

export function closeDb() {
  if (db) db.close()
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit electron/db.ts` (or rely on build step)
Expected: No type errors.

**Step 3: Commit**

```bash
git add electron/db.ts
git commit -m "feat: add SQLite database layer for conversations and credits"
```

---

## Task 3: Claude Code SDK integration (main process)

**Files:**
- Create: `electron/sdk.ts`

**Step 1: Create the SDK wrapper module**

This replaces PTY. It runs `query()` from the SDK and streams results via IPC. File: `electron/sdk.ts`

```typescript
import { query } from '@anthropic-ai/claude-code'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { addCreditUsage } from './db'

interface QueryOptions {
  prompt: string
  conversationId: string
  cwd: string
  sessionId?: string
  maxTurns?: number
  apiKey?: string
  mcpServers?: Record<string, any>
}

let activeGenerator: AsyncGenerator<any> | null = null
let shouldAbort = false

export async function runQuery(win: BrowserWindow, opts: QueryOptions) {
  shouldAbort = false

  const sdkOpts: Record<string, any> = {
    permissionMode: 'bypassPermissions',
    cwd: opts.cwd,
    includePartialMessages: true,
    maxTurns: opts.maxTurns || 200,
  }

  // API key — free tier users provide their own
  if (opts.apiKey) {
    sdkOpts.apiKey = opts.apiKey
  }

  // MCP servers from .mcp.json
  if (opts.mcpServers) {
    sdkOpts.mcpServers = opts.mcpServers
  }

  // Resume existing conversation
  if (opts.sessionId) {
    sdkOpts.resume = opts.sessionId
  }

  try {
    const generator = query({ prompt: opts.prompt, options: sdkOpts })
    activeGenerator = generator

    for await (const message of generator) {
      if (shouldAbort) break
      if (!win.isDestroyed()) {
        win.webContents.send('sdk:message', {
          conversationId: opts.conversationId,
          message,
        })
      }

      // Track token usage from result
      if (message.type === 'result') {
        const usage = message.usage || {}
        const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0)
        if (totalTokens > 0) {
          addCreditUsage(totalTokens, opts.conversationId)
        }

        // Send session ID back for resume
        if (!win.isDestroyed()) {
          win.webContents.send('sdk:result', {
            conversationId: opts.conversationId,
            sessionId: message.session_id,
            usage,
          })
        }
      }
    }
  } catch (err: any) {
    if (!win.isDestroyed()) {
      win.webContents.send('sdk:error', {
        conversationId: opts.conversationId,
        error: err.message || 'Query failed',
      })
    }
  }

  activeGenerator = null

  if (!win.isDestroyed()) {
    win.webContents.send('sdk:complete', {
      conversationId: opts.conversationId,
    })
  }
}

export function abortQuery() {
  shouldAbort = true
  if (activeGenerator) {
    activeGenerator.return(undefined).catch(() => {})
    activeGenerator = null
  }
}

export function loadMcpServers(cwd: string): Record<string, any> | undefined {
  const mcpPath = path.join(cwd, '.mcp.json')
  if (!fs.existsSync(mcpPath)) return undefined
  try {
    const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'))
    return config.mcpServers || undefined
  } catch {
    return undefined
  }
}
```

**Step 2: Commit**

```bash
git add electron/sdk.ts
git commit -m "feat: add Claude Code SDK wrapper with streaming and credit tracking"
```

---

## Task 4: Rewrite main process

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

**Step 1: Rewrite electron/main.ts**

Replace the entire file. This removes PTY, adds SDK IPC handlers, initializes DB.

```typescript
import { app, BrowserWindow, ipcMain, nativeImage, Menu, shell } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import crypto from 'crypto'
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

// Paths
const TEMPLATE_DIR = app.isPackaged
  ? join(process.resourcesPath, 'template')
  : join(app.getAppPath(), 'template')

const ICON_PATH = app.isPackaged
  ? join(process.resourcesPath, 'logo.png')
  : join(app.getAppPath(), 'resources/logo.png')

// Daily credit limit for free tier
const FREE_DAILY_CREDITS = 10_000

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
    backgroundColor: '#0a0a0c',
    icon: ICON_PATH,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Init
  ensureDefaultInstance()
  const active = getActiveInstance()
  setupFileHandlers(mainWindow, active.path)

  // Load renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.maximize()
  })

  // ── SDK IPC ──
  ipcMain.removeHandler('sdk:query')
  ipcMain.removeHandler('sdk:abort')

  ipcMain.handle('sdk:query', async (_event, opts: {
    prompt: string
    conversationId: string
    sessionId?: string
    maxTurns?: number
    apiKey?: string
  }) => {
    const active = getActiveInstance()
    const mcpServers = loadMcpServers(active.path)

    // Check credits (free tier)
    if (opts.apiKey) {
      const used = getCreditsUsedToday()
      if (used >= FREE_DAILY_CREDITS) {
        mainWindow?.webContents.send('sdk:error', {
          conversationId: opts.conversationId,
          error: `Daily credit limit reached (${FREE_DAILY_CREDITS.toLocaleString()} credits). Upgrade to Pro for unlimited.`,
        })
        mainWindow?.webContents.send('sdk:complete', {
          conversationId: opts.conversationId,
        })
        return
      }
    }

    await runQuery(mainWindow!, {
      prompt: opts.prompt,
      conversationId: opts.conversationId,
      cwd: active.path,
      sessionId: opts.sessionId,
      maxTurns: opts.maxTurns,
      apiKey: opts.apiKey,
      mcpServers,
    })
  })

  ipcMain.handle('sdk:abort', () => {
    abortQuery()
  })

  // ── Conversation IPC ──
  ipcMain.removeHandler('conv:create')
  ipcMain.removeHandler('conv:list')
  ipcMain.removeHandler('conv:update')
  ipcMain.removeHandler('conv:delete')
  ipcMain.removeHandler('conv:messages')
  ipcMain.removeHandler('conv:add-message')

  ipcMain.handle('conv:create', (_event, id: string, title: string) => {
    return createConversation(id, title)
  })

  ipcMain.handle('conv:list', (_event, limit?: number) => {
    return listConversations(limit)
  })

  ipcMain.handle('conv:update', (_event, id: string, updates: any) => {
    updateConversation(id, updates)
  })

  ipcMain.handle('conv:delete', (_event, id: string) => {
    deleteConversation(id)
  })

  ipcMain.handle('conv:messages', (_event, convId: string) => {
    return getMessages(convId)
  })

  ipcMain.handle('conv:add-message', (_event, convId: string, role: string, content: string, tokens?: number, toolCalls?: string) => {
    addMessage(convId, role, content, tokens, toolCalls)
  })

  // ── Credits IPC ──
  ipcMain.removeHandler('credits:today')
  ipcMain.removeHandler('credits:history')
  ipcMain.removeHandler('credits:limit')

  ipcMain.handle('credits:today', () => getCreditsUsedToday())
  ipcMain.handle('credits:history', (_event, days?: number) => getCreditHistory(days))
  ipcMain.handle('credits:limit', () => FREE_DAILY_CREDITS)

  // ── Instance IPC (kept from existing) ──
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
      const active = getActiveInstance()
      setActiveInstanceId(active.id)
      setupFileHandlers(mainWindow!, active.path)
      mainWindow!.webContents.send('instance:switched', active)
    }
    return ok
  })

  ipcMain.handle('instances:rename', (_event, id: string, newName: string) => {
    return renameInstance(id, newName)
  })

  ipcMain.handle('instances:add-folder', async () => {
    const { dialog } = await import('electron')
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
    const active = getActiveInstance()
    return {
      version: '0.1.0',
      cwd: active.path,
      companyName: active.name,
      instanceId: active.id,
    }
  })
}

// ── New Window ──
function openNewWindow() {
  if (process.platform === 'darwin' && app.isPackaged) {
    const appPath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '')
    spawn('open', ['-n', appPath], { detached: true, stdio: 'ignore' }).unref()
  } else {
    const args = app.isPackaged ? [] : [app.getAppPath()]
    spawn(process.execPath, args, { detached: true, stdio: 'ignore', env: { ...process.env } }).unref()
  }
}

// ── App Menu ──
function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
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
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: openNewWindow },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Lifecycle ──
app.setName('AIOS')

app.whenReady().then(() => {
  initDb()
  buildAppMenu()
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([{ label: 'New Window', click: openNewWindow }]))
  }
  createWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  destroyFileWatcher()
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
```

**Step 2: Rewrite electron/preload.ts**

Replace entirely. New IPC bridge for chat-style app.

```typescript
import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('aios', {
  // ── SDK ──
  query: (opts: { prompt: string; conversationId: string; sessionId?: string; maxTurns?: number; apiKey?: string }) =>
    ipcRenderer.invoke('sdk:query', opts),
  abort: () => ipcRenderer.invoke('sdk:abort'),
  onSdkMessage: (cb: (data: any) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('sdk:message', handler)
    return () => ipcRenderer.removeListener('sdk:message', handler)
  },
  onSdkResult: (cb: (data: any) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('sdk:result', handler)
    return () => ipcRenderer.removeListener('sdk:result', handler)
  },
  onSdkError: (cb: (data: any) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('sdk:error', handler)
    return () => ipcRenderer.removeListener('sdk:error', handler)
  },
  onSdkComplete: (cb: (data: any) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('sdk:complete', handler)
    return () => ipcRenderer.removeListener('sdk:complete', handler)
  },

  // ── Conversations ──
  createConversation: (id: string, title: string) => ipcRenderer.invoke('conv:create', id, title),
  listConversations: (limit?: number) => ipcRenderer.invoke('conv:list', limit),
  updateConversation: (id: string, updates: any) => ipcRenderer.invoke('conv:update', id, updates),
  deleteConversation: (id: string) => ipcRenderer.invoke('conv:delete', id),
  getMessages: (convId: string) => ipcRenderer.invoke('conv:messages', convId),
  addMessage: (convId: string, role: string, content: string, tokens?: number, toolCalls?: string) =>
    ipcRenderer.invoke('conv:add-message', convId, role, content, tokens, toolCalls),

  // ── Credits ──
  getCreditsToday: () => ipcRenderer.invoke('credits:today'),
  getCreditHistory: (days?: number) => ipcRenderer.invoke('credits:history', days),
  getCreditLimit: () => ipcRenderer.invoke('credits:limit'),

  // ── Files ──
  getClaudeDir: () => ipcRenderer.invoke('files:claude-dir'),
  readFile: (path: string) => ipcRenderer.invoke('files:read', path),
  onFilesChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('files:changed', handler)
    return () => ipcRenderer.removeListener('files:changed', handler)
  },

  // ── Instances ──
  listInstances: () => ipcRenderer.invoke('instances:list'),
  getActiveInstance: () => ipcRenderer.invoke('instances:active'),
  switchInstance: (id: string) => ipcRenderer.invoke('instances:switch', id),
  createInstance: (name: string) => ipcRenderer.invoke('instances:create', name),
  deleteInstance: (id: string) => ipcRenderer.invoke('instances:delete', id),
  renameInstance: (id: string, name: string) => ipcRenderer.invoke('instances:rename', id, name),
  addFolder: () => ipcRenderer.invoke('instances:add-folder'),
  onInstanceSwitched: (cb: (instance: any) => void) => {
    const handler = (_e: any, instance: any) => cb(instance)
    ipcRenderer.on('instance:switched', handler)
    return () => ipcRenderer.removeListener('instance:switched', handler)
  },

  // ── App ──
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
```

**Step 3: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat: rewrite main process — SDK-powered chat replaces PTY terminal"
```

---

## Task 5: Zustand store

**Files:**
- Create: `src/stores/app-store.ts`
- Create: `src/types.ts`

**Step 1: Create shared types**

File: `src/types.ts`

```typescript
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  thinking?: string
  isStreaming?: boolean
  tokens?: number
  createdAt: number
}

export interface ToolCall {
  name: string
  input?: any
  output?: string
  status: 'running' | 'done' | 'error'
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  sessionId?: string
  createdAt: number
  updatedAt: number
}

export interface AppConfig {
  apiKey?: string
  tier: 'free' | 'pro'
  theme: {
    name: string
    primaryColor: string
    darkBg: string
    logo?: string
  }
}
```

**Step 2: Create Zustand store**

File: `src/stores/app-store.ts`

```typescript
import { create } from 'zustand'
import type { Message, Conversation, ToolCall, AppConfig } from '../types'

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

interface AppState {
  // Config
  config: AppConfig
  setConfig: (config: Partial<AppConfig>) => void

  // Conversations
  conversations: Conversation[]
  activeConversationId: string | null
  setActiveConversation: (id: string | null) => void
  loadConversations: () => Promise<void>
  createNewChat: () => string
  deleteChat: (id: string) => Promise<void>

  // Messages
  addUserMessage: (content: string) => void
  appendAssistantContent: (convId: string, content: string) => void
  setAssistantStreaming: (convId: string, streaming: boolean) => void
  addToolCall: (convId: string, tool: ToolCall) => void
  updateToolCall: (convId: string, toolName: string, update: Partial<ToolCall>) => void
  setThinking: (convId: string, thinking: string) => void

  // Query state
  isQuerying: boolean
  setQuerying: (v: boolean) => void

  // Credits
  creditsUsed: number
  creditLimit: number
  loadCredits: () => Promise<void>

  // View
  view: 'chat' | 'dashboard' | 'settings'
  setView: (v: 'chat' | 'dashboard' | 'settings') => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Config
  config: {
    tier: 'free',
    theme: {
      name: 'AIOS',
      primaryColor: '#f97316',
      darkBg: '#0a0a0c',
    },
  },
  setConfig: (updates) => set((s) => ({ config: { ...s.config, ...updates } })),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),

  loadConversations: async () => {
    const aios = (window as any).aios
    if (!aios) return
    const convs = await aios.listConversations(50)
    const conversations = convs.map((c: any) => ({
      ...c,
      messages: [],
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }))
    set({ conversations })
  },

  createNewChat: () => {
    const id = generateId()
    const conv: Conversation = {
      id,
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }))
    return id
  },

  deleteChat: async (id) => {
    const aios = (window as any).aios
    if (aios) await aios.deleteConversation(id)
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    }))
  },

  // Messages
  addUserMessage: (content) => {
    const msg: Message = {
      id: generateId(),
      role: 'user',
      content,
      createdAt: Date.now(),
    }
    set((s) => {
      const convId = s.activeConversationId
      if (!convId) return s
      const convs = s.conversations.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now(), title: c.messages.length === 0 ? content.slice(0, 60) : c.title }
          : c
      )
      return { conversations: convs }
    })
  },

  appendAssistantContent: (convId, content) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = [...c.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && last.isStreaming) {
          msgs[msgs.length - 1] = { ...last, content: last.content + content }
        } else {
          msgs.push({
            id: generateId(),
            role: 'assistant',
            content,
            isStreaming: true,
            createdAt: Date.now(),
          })
        }
        return { ...c, messages: msgs, updatedAt: Date.now() }
      })
      return { conversations: convs }
    })
  },

  setAssistantStreaming: (convId, streaming) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = c.messages.map((m, i) =>
          i === c.messages.length - 1 && m.role === 'assistant'
            ? { ...m, isStreaming: streaming }
            : m
        )
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  addToolCall: (convId, tool) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = [...c.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          const tools = [...(last.toolCalls || []), tool]
          msgs[msgs.length - 1] = { ...last, toolCalls: tools }
        }
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  updateToolCall: (convId, toolName, update) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = c.messages.map((m) => {
          if (m.role !== 'assistant' || !m.toolCalls) return m
          const tools = m.toolCalls.map((t) =>
            t.name === toolName ? { ...t, ...update } : t
          )
          return { ...m, toolCalls: tools }
        })
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  setThinking: (convId, thinking) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = [...c.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, thinking }
        }
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  // Query state
  isQuerying: false,
  setQuerying: (v) => set({ isQuerying: v }),

  // Credits
  creditsUsed: 0,
  creditLimit: 10_000,
  loadCredits: async () => {
    const aios = (window as any).aios
    if (!aios) return
    const [used, limit] = await Promise.all([
      aios.getCreditsToday(),
      aios.getCreditLimit(),
    ])
    set({ creditsUsed: used, creditLimit: limit })
  },

  // View
  view: 'chat',
  setView: (v) => set({ view: v }),
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))
```

**Step 3: Commit**

```bash
git add src/types.ts src/stores/app-store.ts
git commit -m "feat: add Zustand store and type definitions for chat app"
```

---

## Task 6: Chat UI components

**Files:**
- Rewrite: `src/App.tsx`
- Create: `src/components/ChatView.tsx`
- Create: `src/components/MessageBubble.tsx`
- Create: `src/components/ChatInput.tsx`
- Create: `src/components/ChatSidebar.tsx`
- Create: `src/components/CreditMeter.tsx`
- Create: `src/components/ToolCard.tsx`
- Modify: `src/styles/globals.css`

This is the largest task. Each component is a separate sub-step.

**Step 1: Create ChatInput.tsx**

The input bar at the bottom of the chat. Textarea that auto-grows, send button, stop button when querying.

```typescript
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

export default function ChatInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isQuerying, activeConversationId, addUserMessage, setQuerying, createNewChat, config } = useAppStore()

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeConversationId])

  const handleSubmit = async () => {
    const text = input.trim()
    if (!text || isQuerying) return

    let convId = activeConversationId
    if (!convId) {
      convId = createNewChat()
      // Persist to DB
      const aios = (window as any).aios
      if (aios) await aios.createConversation(convId, text.slice(0, 60))
    }

    addUserMessage(text)
    setInput('')
    setQuerying(true)

    const aios = (window as any).aios
    if (aios) {
      await aios.addMessage(convId, 'user', text)
      const conv = useAppStore.getState().conversations.find((c) => c.id === convId)
      await aios.query({
        prompt: text,
        conversationId: convId,
        sessionId: conv?.sessionId,
        apiKey: config.apiKey,
      })
    }
  }

  const handleStop = () => {
    const aios = (window as any).aios
    if (aios) aios.abort()
    setQuerying(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }, [input])

  return (
    <div className="border-t border-white/[0.06] bg-[#0c0c0e] p-4">
      <div className="max-w-3xl mx-auto relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message AIOS..."
          rows={1}
          className="w-full bg-[#141416] text-neutral-100 rounded-xl px-4 py-3 pr-24 resize-none border border-white/[0.06] focus:border-orange-500/50 focus:outline-none placeholder:text-neutral-500 text-sm"
          disabled={isQuerying}
        />
        <div className="absolute right-2 bottom-2 flex gap-2">
          {isQuerying ? (
            <button
              onClick={handleStop}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Create ToolCard.tsx**

Compact card showing tool execution (file read, bash, search, etc.)

```typescript
import type { ToolCall } from '../types'

const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '🔧',
  Bash: '⚡',
  Glob: '🔍',
  Grep: '🔎',
  default: '🔨',
}

export default function ToolCard({ tool }: { tool: ToolCall }) {
  const icon = TOOL_ICONS[tool.name] || TOOL_ICONS.default
  const isRunning = tool.status === 'running'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-neutral-400 my-1">
      <span>{icon}</span>
      <span className="font-mono">{tool.name}</span>
      {tool.input?.file_path && (
        <span className="text-neutral-500 truncate max-w-[300px]">{tool.input.file_path}</span>
      )}
      {tool.input?.command && (
        <span className="text-neutral-500 truncate max-w-[300px] font-mono">{tool.input.command}</span>
      )}
      {isRunning && <span className="ml-auto animate-pulse text-orange-400">running</span>}
      {tool.status === 'done' && <span className="ml-auto text-green-400">done</span>}
      {tool.status === 'error' && <span className="ml-auto text-red-400">error</span>}
    </div>
  )
}
```

**Step 3: Create MessageBubble.tsx**

Renders a single message — user or assistant. Assistant messages render markdown.

```typescript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../types'
import ToolCard from './ToolCard'

export default function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-orange-500/15 text-neutral-100 rounded-2xl rounded-br-md px-4 py-3 text-sm">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4">
      {/* Thinking (collapsible) */}
      {message.thinking && (
        <details className="mb-2">
          <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-400">
            Thinking...
          </summary>
          <div className="mt-1 text-xs text-neutral-500 bg-white/[0.02] rounded-lg p-3 font-mono whitespace-pre-wrap">
            {message.thinking}
          </div>
        </details>
      )}

      {/* Tool calls */}
      {message.toolCalls?.map((tool, i) => (
        <ToolCard key={`${tool.name}-${i}`} tool={tool} />
      ))}

      {/* Content */}
      {message.content && (
        <div className="max-w-[80%] text-sm text-neutral-200 prose prose-invert prose-sm max-w-none
          prose-pre:bg-[#141416] prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-lg
          prose-code:text-orange-300 prose-code:font-mono prose-code:text-xs
          prose-a:text-orange-400 prose-a:no-underline hover:prose-a:underline
          prose-headings:text-neutral-100 prose-strong:text-neutral-100
          prose-td:border-white/[0.06] prose-th:border-white/[0.06]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {/* Streaming indicator */}
      {message.isStreaming && !message.content && (
        <div className="flex gap-1 py-2">
          <span className="w-2 h-2 rounded-full bg-orange-500/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-orange-500/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-orange-500/50 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}
    </div>
  )
}
```

**Step 4: Create CreditMeter.tsx**

Shows credits used / total in the status bar.

```typescript
import { useAppStore } from '../stores/app-store'

export default function CreditMeter() {
  const { creditsUsed, creditLimit, config } = useAppStore()
  const remaining = Math.max(0, creditLimit - creditsUsed)
  const pct = creditLimit > 0 ? (creditsUsed / creditLimit) * 100 : 0
  const isPro = config.tier === 'pro'

  if (isPro) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="text-green-400">Pro</span>
        <span>Unlimited</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-neutral-500">
        {remaining.toLocaleString()} credits left
      </span>
    </div>
  )
}
```

**Step 5: Create ChatSidebar.tsx**

Left sidebar with conversation history, new chat button, navigation.

```typescript
import { useAppStore } from '../stores/app-store'

export default function ChatSidebar() {
  const { conversations, activeConversationId, setActiveConversation, createNewChat, deleteChat, view, setView, sidebarOpen } = useAppStore()

  if (!sidebarOpen) return null

  return (
    <div className="w-60 bg-[#0a0a0c] border-r border-white/[0.06] flex flex-col h-full">
      {/* Logo + New Chat */}
      <div className="p-3 border-b border-white/[0.06]">
        <div className="text-sm font-semibold text-orange-500 mb-3">AIOS</div>
        <button
          onClick={() => { const id = createNewChat(); setActiveConversation(id); setView('chat') }}
          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-sm text-neutral-300 text-left transition-colors"
        >
          + New chat
        </button>
      </div>

      {/* Nav */}
      <div className="px-3 pt-3 flex gap-1">
        {(['chat', 'dashboard', 'settings'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
              view === v ? 'bg-white/[0.08] text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center rounded-lg px-2 py-1.5 cursor-pointer text-sm transition-colors ${
              conv.id === activeConversationId
                ? 'bg-white/[0.08] text-neutral-100'
                : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
            }`}
            onClick={() => { setActiveConversation(conv.id); setView('chat') }}
          >
            <span className="truncate flex-1">{conv.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteChat(conv.id) }}
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 ml-1 text-xs"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 6: Create ChatView.tsx**

Main chat area — messages list + input.

```typescript
import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

export default function ChatView() {
  const { conversations, activeConversationId } = useAppStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conv = conversations.find((c) => c.id === activeConversationId)
  const messages = conv?.messages || []

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h2 className="text-lg font-medium text-neutral-200 mb-2">AIOS</h2>
              <p className="text-sm text-neutral-500 max-w-md">
                AI that controls your computer. Ask me to manage files, run commands, build dashboards, or anything else.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  )
}
```

**Step 7: Rewrite App.tsx**

```typescript
import { useEffect } from 'react'
import { useAppStore } from './stores/app-store'
import ChatSidebar from './components/ChatSidebar'
import ChatView from './components/ChatView'
import CreditMeter from './components/CreditMeter'

export default function App() {
  const { view, loadConversations, loadCredits, sidebarOpen, setSidebarOpen } = useAppStore()

  useEffect(() => {
    loadConversations()
    loadCredits()

    // Refresh credits every 30s
    const interval = setInterval(loadCredits, 30_000)
    return () => clearInterval(interval)
  }, [])

  // SDK message handler
  useEffect(() => {
    const aios = (window as any).aios
    if (!aios) return

    const unsubs = [
      aios.onSdkMessage((data: any) => {
        const store = useAppStore.getState()
        const { conversationId, message } = data

        if (message.type === 'assistant' && message.message?.content) {
          // Extract text content
          const textParts = message.message.content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('')
          if (textParts) {
            store.appendAssistantContent(conversationId, textParts)
          }
        }

        if (message.type === 'assistant' && message.message?.content) {
          const toolParts = message.message.content.filter((p: any) => p.type === 'tool_use')
          for (const tool of toolParts) {
            store.addToolCall(conversationId, {
              name: tool.name,
              input: tool.input,
              status: 'running',
            })
          }
        }

        if (message.type === 'tool_result') {
          store.updateToolCall(conversationId, message.tool_name, { status: 'done' })
        }
      }),

      aios.onSdkResult((data: any) => {
        const store = useAppStore.getState()
        const { conversationId, sessionId } = data
        store.setAssistantStreaming(conversationId, false)
        if (sessionId) {
          const convs = store.conversations.map((c) =>
            c.id === conversationId ? { ...c, sessionId } : c
          )
          useAppStore.setState({ conversations: convs })
        }
        store.loadCredits()
      }),

      aios.onSdkError((data: any) => {
        const store = useAppStore.getState()
        store.appendAssistantContent(data.conversationId, `**Error:** ${data.error}`)
        store.setAssistantStreaming(data.conversationId, false)
      }),

      aios.onSdkComplete((data: any) => {
        useAppStore.getState().setQuerying(false)
        useAppStore.getState().setAssistantStreaming(data.conversationId, false)
      }),
    ]

    return () => unsubs.forEach((fn) => fn())
  }, [])

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-neutral-100">
      {/* Sidebar */}
      <ChatSidebar />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Title bar drag region */}
        <div className="h-8 shrink-0 flex items-center px-3 app-drag-region">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-neutral-500 hover:text-neutral-300 text-sm no-drag"
          >
            ☰
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {view === 'chat' && <ChatView />}
          {view === 'dashboard' && (
            <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
              Dashboard — coming in v0.2
            </div>
          )}
          {view === 'settings' && (
            <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
              Settings — coming soon
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="h-7 shrink-0 border-t border-white/[0.06] bg-[#0a0a0c] flex items-center justify-between px-3">
          <span className="text-xs text-neutral-600">AIOS v0.1.0</span>
          <CreditMeter />
        </div>
      </div>
    </div>
  )
}
```

**Step 8: Update globals.css — add drag region + clean styles**

Add to `src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  background: #0a0a0c;
  color: #e4e4e7;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.app-drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Code blocks */
pre code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
}
```

**Step 9: Delete old components that are no longer needed**

Delete:
- `src/components/Terminal.tsx`
- `src/components/CommandPalette.tsx`
- `src/components/FileViewer.tsx`
- `src/components/SchedulePanel.tsx`
- `src/components/StatusBar.tsx`
- `src/components/Sidebar.tsx`

**Step 10: Commit**

```bash
git add src/
git rm src/components/Terminal.tsx src/components/CommandPalette.tsx src/components/FileViewer.tsx src/components/SchedulePanel.tsx src/components/StatusBar.tsx src/components/Sidebar.tsx
git commit -m "feat: complete chat UI — messages, input, sidebar, credits, tool cards"
```

---

## Task 7: Wire everything up and test

**Step 1: Update src/index.html if needed**

Make sure it loads Inter and JetBrains Mono fonts. Check existing `src/index.html`.

**Step 2: Run `npm run dev` and verify:**

- App launches with new chat UI
- Sidebar shows with conversations
- Can type a message and see it appear as user bubble
- SDK streams response back as assistant bubble
- Credit meter updates after query
- Tool cards appear during tool use
- Stop button aborts query

**Step 3: Fix any issues found during testing**

Iterate until the basic flow works end-to-end.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: AIOS Desktop v0.1.0 — SDK-powered chat UI with credits"
```

---

## Task 8: Onboarding screen (API key input)

**Files:**
- Create: `src/components/Onboarding.tsx`
- Modify: `src/App.tsx` (show onboarding if no API key)

**Step 1: Create Onboarding.tsx**

```typescript
import { useState } from 'react'
import { useAppStore } from '../stores/app-store'

export default function Onboarding() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setConfig = useAppStore((s) => s.setConfig)

  const handleSubmit = async () => {
    const key = apiKey.trim()
    if (!key.startsWith('sk-ant-')) {
      setError('Invalid API key. It should start with sk-ant-')
      return
    }
    setLoading(true)
    setError('')
    // Store the key
    setConfig({ apiKey: key, tier: 'free' })
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center h-screen bg-[#0a0a0c]">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold text-neutral-100 mb-2">AIOS</h1>
          <p className="text-sm text-neutral-500">AI that controls your computer</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">Anthropic API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="sk-ant-..."
              className="w-full bg-[#141416] text-neutral-100 rounded-lg px-4 py-3 border border-white/[0.06] focus:border-orange-500/50 focus:outline-none placeholder:text-neutral-600 text-sm"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading || !apiKey.trim()}
            className="w-full py-3 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Validating...' : 'Get started'}
          </button>

          <div className="text-center">
            <button className="text-xs text-neutral-500 hover:text-orange-400 transition-colors">
              Have a Pro account? Login here
            </button>
          </div>
        </div>

        <p className="text-xs text-neutral-600 text-center mt-6">
          Free tier: 10,000 credits/day. Your key stays on your device.
        </p>
      </div>
    </div>
  )
}
```

**Step 2: Update App.tsx to gate on API key**

Add at the top of the App component:

```typescript
const { config } = useAppStore()

if (!config.apiKey) {
  return <Onboarding />
}
```

Add import: `import Onboarding from './components/Onboarding'`

**Step 3: Commit**

```bash
git add src/components/Onboarding.tsx src/App.tsx
git commit -m "feat: add onboarding screen with API key input"
```

---

## Summary

| Task | What | Est. complexity |
|------|------|-----------------|
| 1 | Clean deps, remove PTY | Low |
| 2 | SQLite database layer | Low |
| 3 | SDK wrapper module | Medium |
| 4 | Rewrite main + preload | Medium |
| 5 | Zustand store + types | Medium |
| 6 | Chat UI components (7 files) | High |
| 7 | Integration testing | Medium |
| 8 | Onboarding screen | Low |

After all 8 tasks, you have a working AIOS Desktop v0.1.0:
- Electron app with ChatGPT-style UI
- Claude Code SDK under the hood
- Credit-based freemium (10K credits/day free)
- Conversation history in SQLite
- Tool execution cards
- Onboarding with API key input
