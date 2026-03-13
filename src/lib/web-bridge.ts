/**
 * Web Bridge — provides window.aios interface via HTTP/WebSocket
 * Drop-in replacement for the Electron preload bridge.
 * All methods mirror electron/preload.ts exactly.
 */

type Listener = (data: any) => void

let ws: WebSocket | null = null
let token: string | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let loggedOut = false
const eventListeners = new Map<string, Set<Listener>>()
const API_BASE = '' // same origin

// ── Helpers ──

function getToken(): string {
  if (token) return token
  token = sessionStorage.getItem('aios-token')
  return token || ''
}

function setToken(t: string) {
  token = t
  sessionStorage.setItem('aios-token', t)
}

async function api(path: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...(opts?.headers || {}),
    },
  })
  if (res.status === 401) {
    // Token expired or server restarted — signal logout without reloading
    if (!loggedOut) {
      loggedOut = true
      token = null
      sessionStorage.removeItem('aios-token')
      localStorage.removeItem('aios-config')
      window.dispatchEvent(new CustomEvent('aios:logout'))
    }
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

function emit(event: string, data: any) {
  const listeners = eventListeners.get(event)
  if (listeners) {
    for (const fn of listeners) {
      try { fn(data) } catch (e) { console.error('[web-bridge] listener error:', e) }
    }
  }
}

function on(event: string, cb: Listener): () => void {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set())
  eventListeners.get(event)!.add(cb)
  return () => { eventListeners.get(event)?.delete(cb) }
}

// ── WebSocket ──

function connectWs() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${location.host}/ws?token=${encodeURIComponent(getToken())}`
  ws = new WebSocket(url)

  ws.onopen = () => {
    console.log('[web-bridge] ws connected')
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  }

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data)
      handleWsMessage(msg)
    } catch {}
  }

  ws.onclose = () => {
    console.log('[web-bridge] ws disconnected, reconnecting...')
    ws = null
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(connectWs, 2000)
    }
  }

  ws.onerror = () => {
    ws?.close()
  }
}

// Map SDK WebSocket messages to Electron-style events
function handleWsMessage(msg: any) {
  // Claude Code SDK streaming messages
  if (msg.type === 'assistant') {
    emit('sdk:message', {
      conversationId: currentQueryConvId,
      message: { type: 'assistant', message: msg.message || msg },
    })
    return
  }

  if (msg.type === 'result') {
    emit('sdk:result', {
      conversationId: currentQueryConvId,
      sessionId: msg.session_id,
    })
    return
  }

  if (msg.type === 'error') {
    emit('sdk:error', {
      conversationId: currentQueryConvId,
      error: msg.message || msg.error || 'Unknown error',
    })
    return
  }

  if (msg.type === 'query_complete') {
    emit('sdk:complete', { conversationId: currentQueryConvId })
    return
  }

  // Schedule execution
  if (msg.type === 'schedule_execution' && msg.status === 'started') {
    emit('schedule:execute', { command: msg.taskName })
    return
  }

  if (msg.type === 'schedules_changed') {
    emit('schedules:changed', {})
    return
  }

  // WhatsApp status updates
  if (msg.type === 'whatsapp:status') {
    emit('whatsapp:status', {
      connectionId: msg.connectionId,
      connections: msg.connections,
    })
    return
  }
}

let currentQueryConvId: string | null = null

function wsSend(data: any) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

// ── The aios bridge object ──

export const webAios = {
  // ── SDK ──
  query: async (opts: any) => {
    currentQueryConvId = opts.conversationId
    wsSend({
      type: 'query',
      prompt: opts.prompt,
      sessionId: opts.sessionId,
      conversationId: opts.conversationId,
      maxTurns: opts.maxTurns,
      tabId: opts.conversationId,
    })
  },

  abort: async () => {
    wsSend({ type: 'abort' })
  },

  onSdkMessage: (cb: Listener) => on('sdk:message', cb),
  onSdkResult: (cb: Listener) => on('sdk:result', cb),
  onSdkError: (cb: Listener) => on('sdk:error', cb),
  onSdkComplete: (cb: Listener) => on('sdk:complete', cb),

  // ── Conversations ──
  createConversation: (id: string, title: string) =>
    api('/api/conversations', { method: 'POST', body: JSON.stringify({ id, title }) }),

  listConversations: (limit?: number) =>
    api(`/api/conversations?limit=${limit || 50}`),

  updateConversation: (id: string, updates: any) =>
    api(`/api/conversations/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),

  deleteConversation: (id: string) =>
    api(`/api/conversations/${id}`, { method: 'DELETE' }),

  getMessages: (convId: string) =>
    api(`/api/conversations/${convId}/messages`),

  addMessage: (convId: string, role: string, content: string, tokens?: number, toolCalls?: string) =>
    api(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role, content, tokens, toolCalls }),
    }),

  // ── Credits ──
  getCreditsToday: () => api('/api/credits/today').then(r => r.used || 0),
  getCreditHistory: (days?: number) => api(`/api/credits/history?days=${days || 7}`),
  getCreditLimit: () => api('/api/credits/limit').then(r => r.limit || 500),

  // ── Files ──
  getClaudeDir: () => api('/api/claude-dir'),
  readFile: (path: string) => api(`/api/files/read?path=${encodeURIComponent(path)}`).then(r => r.content || ''),
  readImage: (path: string) => api(`/api/files/image?path=${encodeURIComponent(path)}`).then(r => r.dataUrl),
  writeFile: (path: string, content: string) =>
    api('/api/files/write', { method: 'POST', body: JSON.stringify({ path, content }) }),

  onFilesChanged: (cb: () => void) => on('files:changed', cb),

  // ── Instances ──
  listInstances: async () => {
    try { return await api('/api/instances') } catch { return [] }
  },
  getActiveInstance: async () => {
    try { return await api('/api/instances/active') } catch { return null }
  },
  switchInstance: async (id: string) => {
    const result = await api(`/api/instances/${id}/switch`, { method: 'POST' })
    window.dispatchEvent(new CustomEvent('aios:instance-switched', { detail: result }))
    return true
  },
  createInstance: async (name: string) => {
    try {
      return await api('/api/instances', { method: 'POST', body: JSON.stringify({ name }) })
    } catch { return null }
  },
  deleteInstance: async (id: string) => {
    try { await api(`/api/instances/${id}`, { method: 'DELETE' }); return true } catch { return false }
  },
  renameInstance: async (id: string, name: string) => {
    try { await api(`/api/instances/${id}/rename`, { method: 'PUT', body: JSON.stringify({ name }) }); return true } catch { return false }
  },
  addFolder: async (folderPath?: string) => {
    if (!folderPath) {
      // Show the folder browser UI
      window.dispatchEvent(new CustomEvent('aios:show-folder-browser'))
      return null
    }
    try {
      const result = await api('/api/instances/add-folder', {
        method: 'POST',
        body: JSON.stringify({ folderPath }),
      })
      window.dispatchEvent(new CustomEvent('aios:instance-switched', { detail: result }))
      return result
    } catch (e: any) {
      alert(e.message || 'Failed to add folder')
      return null
    }
  },
  browseDir: (dirPath?: string) =>
    api(`/api/browse?path=${encodeURIComponent(dirPath || '')}`),
  onInstanceSwitched: (cb: Listener) => {
    const handler = (e: Event) => cb((e as CustomEvent).detail)
    window.addEventListener('aios:instance-switched', handler)
    return () => window.removeEventListener('aios:instance-switched', handler)
  },

  // ── MCP ──
  getMcpServers: () => api('/api/mcp').catch(() => ({})),
  saveMcpServers: (servers: Record<string, any>) =>
    api('/api/mcp', { method: 'POST', body: JSON.stringify(servers) }),

  // ── Sessions ──
  listSessions: () => api('/api/sessions').catch(() => []),
  getSessionMessages: (sessionId: string) =>
    api(`/api/sessions/${sessionId}/messages`).catch(() => []),
  renameSession: (sessionId: string, title: string) =>
    api(`/api/sessions/${sessionId}/rename`, { method: 'POST', body: JSON.stringify({ title }) })
      .then(() => webAios.listSessions()),
  deleteSession: (sessionId: string) =>
    api(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      .then(() => webAios.listSessions()),
  onSessionsChanged: (_cb: Listener) => () => {}, // not real-time in web

  // ── Auth ──
  registerUser: async (data: { email: string; password: string; name: string }) => {
    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) return { success: false, error: json.error }
      setToken(json.token)
      return { success: true, tier: json.tier, name: json.name }
    } catch {
      return { success: false, error: 'Network error' }
    }
  },
  loginUser: async (data: { email: string; password: string }) => {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) return { success: false, error: json.error }
      setToken(json.token)
      return { success: true, tier: json.tier || 'free', name: json.name }
    } catch {
      return { success: false, error: 'Network error' }
    }
  },
  setUserTier: async (_email: string, _tier: string) => ({ success: true }),

  // ── Schedules ──
  listSchedules: () => api('/api/schedules'),
  getSchedule: (id: string) => api(`/api/schedules/${id}`),
  createSchedule: (data: any) =>
    api('/api/schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: any) =>
    api(`/api/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSchedule: (id: string) =>
    api(`/api/schedules/${id}`, { method: 'DELETE' }),
  toggleSchedule: (id: string) =>
    api(`/api/schedules/${id}/toggle`, { method: 'POST' }),
  runScheduleNow: (id: string) =>
    api(`/api/schedules/${id}/run`, { method: 'POST' }),
  getScheduleRuns: (id: string, _limit?: number) =>
    api(`/api/schedules/${id}/runs`).catch(() => []),
  onSchedulesChanged: (cb: () => void) => on('schedules:changed', cb),
  onScheduleExecute: (cb: Listener) => on('schedule:execute', cb),

  // ── Setup ──
  saveSetupData: (data: any) =>
    api('/api/setup', { method: 'POST', body: JSON.stringify(data) }),
  getSetupStatus: () => api('/api/setup/status'),

  // ── File upload (web-only: convert browser File to server path) ──
  uploadFile: async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        try {
          const res = await api('/api/files/upload', {
            method: 'POST',
            body: JSON.stringify({ name: file.name, base64Data: base64 }),
          })
          resolve(res.path)
        } catch (e) { reject(e) }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  },

  // ── App ──
  getAppInfo: () => api('/api/info'),
  openPath: async (_p: string) => {}, // no-op in web
  showInFolder: async (_p: string) => {}, // no-op in web
  getPathForFile: (_file: File) => '', // no native path in web

  // ── Clipboard (web uses browser API) ──
  saveTempImage: async (base64Data: string, mimeType: string) => {
    const res = await api('/api/files/temp-image', {
      method: 'POST',
      body: JSON.stringify({ base64Data, mimeType }),
    })
    return res.path
  },
  readClipboardImage: async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const buffer = await blob.arrayBuffer()
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
          const dataUrl = `data:${imageType};base64,${base64}`
          // Upload to server for attachment
          const res = await api('/api/files/temp-image', {
            method: 'POST',
            body: JSON.stringify({ base64Data: base64, mimeType: imageType }),
          })
          return { dataUrl, filePath: res.path }
        }
      }
    } catch {}
    return null
  },

  // ── WhatsApp ──
  listWhatsAppConnections: async (_p: string) =>
    api('/api/whatsapp/connections').catch(() => []),

  addWhatsAppConnection: async (d: any) =>
    api('/api/whatsapp/connections', { method: 'POST', body: JSON.stringify({ id: d.id, name: d.name }) }),

  removeWhatsAppConnection: async (id: string, _p: string) =>
    api(`/api/whatsapp/connections/${id}`, { method: 'DELETE' }),

  connectWhatsApp: async (id: string) =>
    api(`/api/whatsapp/connections/${id}/connect`, { method: 'POST' }),

  disconnectWhatsApp: async (id: string) =>
    api(`/api/whatsapp/connections/${id}/disconnect`, { method: 'POST' }),

  getWhatsAppStatuses: async () => {
    try {
      const conns = await api('/api/whatsapp/connections')
      const statuses: Record<string, any> = {}
      for (const c of conns) statuses[c.id] = c
      return statuses
    } catch { return {} }
  },

  onWhatsAppStatusChanged: (cb: Listener) => on('whatsapp:status', cb),
}

// ── Web login flow ──

export async function webLogin(password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error('Wrong password')
  const data = await res.json()
  setToken(data.token)
  return data.token
}

export function isWebAuthenticated(): boolean {
  return !!getToken()
}

export function initWebBridge() {
  if ((window as any).aios) return // Electron preload already loaded

  // Install the bridge
  ;(window as any).aios = webAios
  ;(window as any).__AIOS_WEB__ = true

  // Mark document for CSS (hide Electron-only elements like drag regions)
  document.documentElement.classList.add('web-mode')

  // Validate existing token — if server restarted, token is invalid
  if (getToken()) {
    fetch(`${API_BASE}/api/info`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    }).then(res => {
      if (res.status === 401 && !loggedOut) {
        loggedOut = true
        token = null
        sessionStorage.removeItem('aios-token')
        localStorage.removeItem('aios-config')
        window.dispatchEvent(new CustomEvent('aios:logout'))
      }
    }).catch(() => {})
  }

  // Connect WebSocket if we have a token
  if (getToken()) {
    connectWs()
  }
}

export function connectWebSocket() {
  connectWs()
}
