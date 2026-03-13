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

  // App
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
