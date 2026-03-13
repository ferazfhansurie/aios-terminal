import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('aios', {
  // SDK
  query: (opts: any) => ipcRenderer.invoke('sdk:query', opts),
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

  // Conversations
  createConversation: (id: string, title: string) => ipcRenderer.invoke('conv:create', id, title),
  listConversations: (limit?: number) => ipcRenderer.invoke('conv:list', limit),
  updateConversation: (id: string, updates: any) => ipcRenderer.invoke('conv:update', id, updates),
  deleteConversation: (id: string) => ipcRenderer.invoke('conv:delete', id),
  getMessages: (convId: string) => ipcRenderer.invoke('conv:messages', convId),
  addMessage: (convId: string, role: string, content: string, tokens?: number, toolCalls?: string) =>
    ipcRenderer.invoke('conv:add-message', convId, role, content, tokens, toolCalls),

  // Credits
  getCreditsToday: () => ipcRenderer.invoke('credits:today'),
  getCreditHistory: (days?: number) => ipcRenderer.invoke('credits:history', days),
  getCreditLimit: () => ipcRenderer.invoke('credits:limit'),

  // Files (keep existing)
  getClaudeDir: () => ipcRenderer.invoke('files:claude-dir'),
  readFile: (path: string) => ipcRenderer.invoke('files:read', path),
  readImage: (path: string) => ipcRenderer.invoke('files:read-image', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('files:write', path, content),
  onFilesChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('files:changed', handler)
    return () => ipcRenderer.removeListener('files:changed', handler)
  },

  // Instances (keep existing)
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

  // MCP servers
  getMcpServers: () => ipcRenderer.invoke('mcp:list'),
  saveMcpServers: (servers: Record<string, any>) => ipcRenderer.invoke('mcp:save', servers),

  // Clipboard image
  saveTempImage: (base64Data: string, mimeType: string) => ipcRenderer.invoke('files:save-temp-image', base64Data, mimeType),
  readClipboardImage: () => ipcRenderer.invoke('clipboard:read-image'),

  // Sessions (Claude Code history)
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  getSessionMessages: (sessionId: string) => ipcRenderer.invoke('sessions:messages', sessionId),
  renameSession: (sessionId: string, title: string) => ipcRenderer.invoke('sessions:rename', sessionId, title),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('sessions:delete', sessionId),
  onSessionsChanged: (cb: (data: { sessionIds: string[]; sessions: any[] }) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('sessions:changed', handler)
    return () => ipcRenderer.removeListener('sessions:changed', handler)
  },

  // Auth
  registerUser: (data: { email: string; password: string; name: string }) =>
    ipcRenderer.invoke('auth:register', data),
  loginUser: (data: { email: string; password: string }) =>
    ipcRenderer.invoke('auth:login', data),
  setUserTier: (email: string, tier: string) =>
    ipcRenderer.invoke('auth:set-tier', email, tier),

  // Schedules
  listSchedules: () => ipcRenderer.invoke('schedules:list'),
  getSchedule: (id: string) => ipcRenderer.invoke('schedules:get', id),
  createSchedule: (data: any) => ipcRenderer.invoke('schedules:create', data),
  updateSchedule: (id: string, data: any) => ipcRenderer.invoke('schedules:update', id, data),
  deleteSchedule: (id: string) => ipcRenderer.invoke('schedules:delete', id),
  toggleSchedule: (id: string) => ipcRenderer.invoke('schedules:toggle', id),
  runScheduleNow: (id: string) => ipcRenderer.invoke('schedules:run-now', id),
  getScheduleRuns: (id: string, limit?: number) => ipcRenderer.invoke('schedules:runs', id, limit),
  onSchedulesChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('schedules:changed', handler)
    return () => ipcRenderer.removeListener('schedules:changed', handler)
  },
  onScheduleExecute: (cb: (data: { command: string }) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('schedule:execute', handler)
    return () => ipcRenderer.removeListener('schedule:execute', handler)
  },

  // Setup / Onboarding
  saveSetupData: (data: any) => ipcRenderer.invoke('setup:save', data),
  getSetupStatus: () => ipcRenderer.invoke('setup:status'),

  // WhatsApp (native WWebJS — multi-connection)
  listWhatsAppConnections: (instancePath: string) => ipcRenderer.invoke('whatsapp:list-connections', instancePath),
  addWhatsAppConnection: (data: { id: string; name: string; instancePath: string; configInstancePath: string }) =>
    ipcRenderer.invoke('whatsapp:add-connection', data),
  removeWhatsAppConnection: (connectionId: string, configInstancePath: string) =>
    ipcRenderer.invoke('whatsapp:remove-connection', connectionId, configInstancePath),
  connectWhatsApp: (connectionId: string) => ipcRenderer.invoke('whatsapp:connect', connectionId),
  disconnectWhatsApp: (connectionId: string) => ipcRenderer.invoke('whatsapp:disconnect', connectionId),
  getWhatsAppStatuses: () => ipcRenderer.invoke('whatsapp:statuses'),
  onWhatsAppStatusChanged: (cb: (data: any) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('whatsapp:status-changed', handler)
    return () => ipcRenderer.removeListener('whatsapp:status-changed', handler)
  },

  // App
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
