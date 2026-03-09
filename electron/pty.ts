import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import os from 'os'
import fs from 'fs'

const BUFFER_LIMIT = 500

interface PtyTab {
  id: string
  label: string
  process: pty.IPty | null
  buffer: string[]
  cwd: string
  hasSentPrime: boolean
  createdAt: number
}

const tabs = new Map<string, PtyTab>()
let activeTabId: string = ''
let currentCwd: string = ''
let tabCounter = 0

const home = os.homedir()
const claudeSymlink = `${home}/.local/bin/claude`
const claudeBin = fs.existsSync(claudeSymlink) ? fs.realpathSync(claudeSymlink) : claudeSymlink
const fullPath = [
  `${home}/.local/bin`,
  `${home}/.npm-global/bin`,
  '/opt/homebrew/bin',
  '/usr/local/bin',
  process.env.PATH || '',
].join(':')

function generateTabId(): string {
  return `tab-${++tabCounter}-${Date.now().toString(36)}`
}

function spawnClaudeForTab(win: BrowserWindow, tab: PtyTab, resumeId?: string) {
  if (tab.process) {
    try { tab.process.kill() } catch { /* already dead */ }
    tab.process = null
  }
  tab.buffer = []
  tab.hasSentPrime = false

  const args = resumeId ? ['--resume', resumeId] : []
  try {
    tab.process = pty.spawn(claudeBin, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: tab.cwd,
      env: { ...process.env, PATH: fullPath, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    })
  } catch (err) {
    console.error('Failed to spawn Claude CLI:', err)
    if (tab.id === activeTabId) {
      win.webContents.send('pty:data', `\r\n\x1b[31mFailed to start Claude CLI\x1b[0m\r\nPath: ${claudeBin}\r\nError: ${err}\r\n`)
    }
    return
  }

  tab.process.onData((data) => {
    if (tab.buffer.length < BUFFER_LIMIT) tab.buffer.push(data)
    // Only send to renderer if this tab is active
    if (tab.id === activeTabId) {
      win.webContents.send('pty:data', data)
    }

    // Auto-prime for new sessions
    if (!tab.hasSentPrime && !resumeId && tab.buffer.length > 3) {
      const allOutput = tab.buffer.join('')
      if (allOutput.includes('❯') || allOutput.includes('/help')) {
        tab.hasSentPrime = true
        setTimeout(() => {
          if (tab.process) {
            tab.process.write('/prime\r')
          }
        }, 1500)
      }
    }
  })

  tab.process.onExit(({ exitCode }) => {
    tab.process = null
    if (tab.id === activeTabId) {
      win.webContents.send('pty:exit', exitCode)
    }
  })
}

function getActiveTab(): PtyTab | undefined {
  return tabs.get(activeTabId)
}

function getTabList() {
  return Array.from(tabs.values()).map(t => ({
    id: t.id,
    label: t.label,
    active: t.id === activeTabId,
    alive: t.process !== null,
    createdAt: t.createdAt,
  }))
}

/** Register IPC handlers only (no process spawn). Safe to call before window loads. */
export function registerPtyHandlers(win: BrowserWindow, cwd: string) {
  ipcMain.removeAllListeners('pty:input')
  ipcMain.removeAllListeners('pty:resize')
  ipcMain.removeAllListeners('pty:send-command')
  ipcMain.removeHandler('pty:replay')
  ipcMain.removeHandler('pty:restart')
  ipcMain.removeHandler('pty:tabs:list')
  ipcMain.removeHandler('pty:tabs:create')
  ipcMain.removeHandler('pty:tabs:close')
  ipcMain.removeHandler('pty:tabs:switch')
  ipcMain.removeHandler('pty:tabs:rename')

  currentCwd = cwd

  ipcMain.handle('pty:replay', () => {
    const tab = getActiveTab()
    return tab ? tab.buffer.join('') : ''
  })

  ipcMain.handle('pty:restart', (_event, resumeId?: string) => {
    const tab = getActiveTab()
    if (tab) {
      spawnClaudeForTab(win, tab, resumeId)
    }
    win.webContents.send('pty:restarted')
  })

  ipcMain.on('pty:input', (_event, data: string) => {
    getActiveTab()?.process?.write(data)
  })

  ipcMain.on('pty:resize', (_event, cols: number, rows: number) => {
    const proc = getActiveTab()?.process
    if (!proc) return
    try { proc.resize(cols, rows) } catch { /* fd closed */ }
  })

  ipcMain.on('pty:send-command', (_event, cmd: string) => {
    getActiveTab()?.process?.write(cmd + '\n')
  })

  // --- Tab management ---
  ipcMain.handle('pty:tabs:list', () => getTabList())

  ipcMain.handle('pty:tabs:create', (_event, label?: string) => {
    const id = generateTabId()
    const tab: PtyTab = {
      id,
      label: label || `Session ${tabs.size + 1}`,
      process: null,
      buffer: [],
      cwd: currentCwd,
      hasSentPrime: false,
      createdAt: Date.now(),
    }
    tabs.set(id, tab)
    activeTabId = id
    spawnClaudeForTab(win, tab)
    win.webContents.send('pty:restarted')
    win.webContents.send('pty:tabs:changed', getTabList())
    return { id, label: tab.label }
  })

  ipcMain.handle('pty:tabs:close', (_event, tabId: string) => {
    const tab = tabs.get(tabId)
    if (!tab) return false
    // Kill the process
    if (tab.process) {
      try { tab.process.kill() } catch { /* */ }
    }
    tabs.delete(tabId)

    // If we closed the active tab, switch to another
    if (tabId === activeTabId) {
      const remaining = Array.from(tabs.values())
      if (remaining.length > 0) {
        activeTabId = remaining[remaining.length - 1].id
        const newActive = tabs.get(activeTabId)!
        win.webContents.send('pty:tab-switched', newActive.buffer.join(''))
      } else {
        // No tabs left — create a new one
        const newId = generateTabId()
        const newTab: PtyTab = {
          id: newId,
          label: 'Session 1',
          process: null,
          buffer: [],
          cwd: currentCwd,
          hasSentPrime: false,
          createdAt: Date.now(),
        }
        tabs.set(newId, newTab)
        activeTabId = newId
        spawnClaudeForTab(win, newTab)
        win.webContents.send('pty:restarted')
      }
    }
    win.webContents.send('pty:tabs:changed', getTabList())
    return true
  })

  ipcMain.handle('pty:tabs:switch', (_event, tabId: string) => {
    const tab = tabs.get(tabId)
    if (!tab) return false
    activeTabId = tabId
    // Send tab-switched (clear + replay) instead of restarted (full reinit)
    win.webContents.send('pty:tab-switched', tab.buffer.join(''))
    win.webContents.send('pty:tabs:changed', getTabList())
    return true
  })

  ipcMain.handle('pty:tabs:rename', (_event, tabId: string, newLabel: string) => {
    const tab = tabs.get(tabId)
    if (!tab) return false
    tab.label = newLabel
    win.webContents.send('pty:tabs:changed', getTabList())
    return true
  })
}

/** Spawn the first Claude PTY tab. Call after window is ready to show. */
export function startPty(win: BrowserWindow, cwd: string) {
  currentCwd = cwd
  const id = generateTabId()
  const tab: PtyTab = {
    id,
    label: 'Session 1',
    process: null,
    buffer: [],
    cwd,
    hasSentPrime: false,
    createdAt: Date.now(),
  }
  tabs.set(id, tab)
  activeTabId = id
  spawnClaudeForTab(win, tab)
  win.webContents.send('pty:tabs:changed', getTabList())
}

/** Full setup (register + spawn). Use when handlers are already registered (e.g. instance switch). */
export function setupPty(win: BrowserWindow, cwd: string) {
  registerPtyHandlers(win, cwd)
  // Kill all existing tabs
  for (const tab of tabs.values()) {
    if (tab.process) try { tab.process.kill() } catch { /* */ }
  }
  tabs.clear()
  startPty(win, cwd)
}

/** Switch working directory and restart all PTYs */
export function switchCwd(win: BrowserWindow, newCwd: string) {
  currentCwd = newCwd
  // Kill all existing tabs and create a fresh one
  for (const tab of tabs.values()) {
    if (tab.process) try { tab.process.kill() } catch { /* */ }
  }
  tabs.clear()
  tabCounter = 0
  startPty(win, newCwd)
  win.webContents.send('pty:restarted')
}

export function destroyPty() {
  for (const tab of tabs.values()) {
    if (tab.process) try { tab.process.kill() } catch { /* */ }
  }
  tabs.clear()
}
