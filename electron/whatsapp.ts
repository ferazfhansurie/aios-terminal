import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import QRCode from 'qrcode'

// Dynamic require for whatsapp-web.js (CommonJS module)
const { Client, LocalAuth } = require('whatsapp-web.js')

let win: BrowserWindow | null = null

interface ConnectionState {
  id: string
  name: string
  instancePath: string
  client: any | null
  status: 'offline' | 'disconnected' | 'qr' | 'connecting' | 'ready' | 'error'
  qrDataUrl: string | null
  phoneNumber: string | null
  lastError: string | null
  connectedAt: number | null
}

const connections = new Map<string, ConnectionState>()

function getConnectionStatus(conn: ConnectionState) {
  const authPath = path.join(conn.instancePath, '.wwebjs_auth')
  const sessionPath = path.join(authPath, `session-${conn.id}`, 'Default')
  return {
    id: conn.id,
    name: conn.name,
    instancePath: conn.instancePath,
    status: conn.status,
    qrDataUrl: conn.status === 'qr' ? conn.qrDataUrl : null,
    phoneNumber: conn.phoneNumber,
    lastError: conn.lastError,
    uptime: conn.connectedAt ? Math.floor((Date.now() - conn.connectedAt) / 1000) : undefined,
    sessionExists: fs.existsSync(sessionPath),
  }
}

function getAllStatuses() {
  return Array.from(connections.values()).map(getConnectionStatus)
}

function notify(connectionId?: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('whatsapp:status-changed', {
      connectionId,
      connections: getAllStatuses(),
    })
  }
}

/** Find Chrome executable */
function findChrome(): string | undefined {
  const paths = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']
  return paths.find((p) => fs.existsSync(p))
}

/** Load saved connections from config, and auto-detect existing sessions */
function loadConnections(instancePath: string): Array<{ id: string; name: string; instancePath: string }> {
  // Load from config file
  const configPath = path.join(instancePath, '.claude', 'whatsapp-connections.json')
  let saved: Array<{ id: string; name: string; instancePath: string }> = []
  if (fs.existsSync(configPath)) {
    try {
      saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {}
  }

  // Auto-detect existing .wwebjs_auth sessions in instance path
  const authDir = path.join(instancePath, '.wwebjs_auth')
  if (fs.existsSync(authDir)) {
    try {
      const entries = fs.readdirSync(authDir)
      for (const entry of entries) {
        if (!entry.startsWith('session-')) continue
        const clientId = entry.replace('session-', '')
        // Check it's a real session (has Default/ dir)
        const sessionDefault = path.join(authDir, entry, 'Default')
        if (!fs.existsSync(sessionDefault)) continue
        // Skip if already in saved config
        if (saved.some((s) => s.id === clientId)) continue
        // Auto-add with a friendly name derived from clientId
        const name = clientId.replace(/^aios-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        saved.push({ id: clientId, name, instancePath })
      }
    } catch {}
  }

  return saved
}

/** Save connections config */
function saveConnections(instancePath: string) {
  const dir = path.join(instancePath, '.claude')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const data = Array.from(connections.values()).map((c) => ({
    id: c.id,
    name: c.name,
    instancePath: c.instancePath,
  }))
  fs.writeFileSync(path.join(dir, 'whatsapp-connections.json'), JSON.stringify(data, null, 2))
}

/** Connect a specific WWebJS client */
async function connectClient(connectionId: string): Promise<{ success: boolean; error?: string }> {
  const conn = connections.get(connectionId)
  if (!conn) return { success: false, error: 'Connection not found' }
  if (conn.client) return { success: true } // already connected

  const chrome = findChrome()
  if (!chrome) {
    return { success: false, error: 'Google Chrome not found. Install Chrome to use WhatsApp.' }
  }

  const authPath = path.join(conn.instancePath, '.wwebjs_auth')

  conn.status = 'connecting'
  conn.qrDataUrl = null
  notify(connectionId)

  try {
    conn.client = new Client({
      authStrategy: new LocalAuth({ clientId: conn.id, dataPath: authPath }),
      puppeteer: {
        headless: true,
        executablePath: chrome,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-extensions',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      },
    })

    conn.client.on('qr', async (qr: string) => {
      try {
        conn.qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 })
      } catch {
        conn.qrDataUrl = null
      }
      conn.status = 'qr'
      notify(connectionId)
    })

    conn.client.on('authenticated', () => {
      conn.status = 'connecting'
      conn.qrDataUrl = null
      notify(connectionId)
    })

    conn.client.on('ready', () => {
      conn.status = 'ready'
      conn.qrDataUrl = null
      conn.phoneNumber = conn.client?.info?.wid?.user ? `+${conn.client.info.wid.user}` : null
      conn.connectedAt = Date.now()
      conn.lastError = null
      notify(connectionId)
    })

    conn.client.on('disconnected', (reason: string) => {
      conn.status = 'disconnected'
      conn.phoneNumber = null
      conn.connectedAt = null
      conn.lastError = reason
      conn.client = null
      notify(connectionId)
    })

    conn.client.on('auth_failure', (msg: string) => {
      conn.status = 'error'
      conn.lastError = `Auth failed: ${msg}`
      conn.client = null
      notify(connectionId)
    })

    await conn.client.initialize()
    return { success: true }
  } catch (err: any) {
    conn.status = 'error'
    conn.lastError = err.message
    conn.client = null
    notify(connectionId)
    return { success: false, error: err.message }
  }
}

/** Disconnect a specific client */
async function disconnectClient(connectionId: string): Promise<void> {
  const conn = connections.get(connectionId)
  if (!conn) return
  if (conn.client) {
    try {
      await conn.client.destroy()
    } catch {}
    conn.client = null
  }
  conn.status = 'offline'
  conn.qrDataUrl = null
  conn.phoneNumber = null
  conn.connectedAt = null
  notify(connectionId)
}

/** Setup IPC handlers */
export function setupWhatsApp(window: BrowserWindow) {
  win = window

  ipcMain.removeHandler('whatsapp:list-connections')
  ipcMain.removeHandler('whatsapp:add-connection')
  ipcMain.removeHandler('whatsapp:remove-connection')
  ipcMain.removeHandler('whatsapp:connect')
  ipcMain.removeHandler('whatsapp:disconnect')
  ipcMain.removeHandler('whatsapp:statuses')

  // List all connections (loads from config on first call)
  ipcMain.handle('whatsapp:list-connections', (_event, instancePath: string) => {
    // Load saved connections into memory if not already loaded
    if (connections.size === 0) {
      const saved = loadConnections(instancePath)
      for (const s of saved) {
        if (!connections.has(s.id)) {
          connections.set(s.id, {
            id: s.id,
            name: s.name,
            instancePath: s.instancePath,
            client: null,
            status: 'offline',
            qrDataUrl: null,
            phoneNumber: null,
            lastError: null,
            connectedAt: null,
          })
        }
      }
    }
    return getAllStatuses()
  })

  // Add a new connection
  ipcMain.handle('whatsapp:add-connection', (_event, data: { id: string; name: string; instancePath: string; configInstancePath: string }) => {
    if (connections.has(data.id)) return { success: false, error: 'Connection ID already exists' }
    connections.set(data.id, {
      id: data.id,
      name: data.name,
      instancePath: data.instancePath,
      client: null,
      status: 'offline',
      qrDataUrl: null,
      phoneNumber: null,
      lastError: null,
      connectedAt: null,
    })
    saveConnections(data.configInstancePath)
    notify(data.id)
    return { success: true }
  })

  // Remove a connection
  ipcMain.handle('whatsapp:remove-connection', async (_event, connectionId: string, configInstancePath: string) => {
    await disconnectClient(connectionId)
    connections.delete(connectionId)
    saveConnections(configInstancePath)
    notify()
    return { success: true }
  })

  // Connect a specific connection
  ipcMain.handle('whatsapp:connect', async (_event, connectionId: string) => {
    return connectClient(connectionId)
  })

  // Disconnect a specific connection
  ipcMain.handle('whatsapp:disconnect', async (_event, connectionId: string) => {
    await disconnectClient(connectionId)
    return { success: true }
  })

  // Get all statuses
  ipcMain.handle('whatsapp:statuses', () => {
    return getAllStatuses()
  })
}

export function destroyWhatsApp() {
  const promises = Array.from(connections.keys()).map((id) => disconnectClient(id).catch(() => {}))
  Promise.all(promises).catch(() => {})
}
