import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('aios', {
  // PTY
  onPtyData: (cb: (data: string) => void) => {
    const handler = (_e: any, data: string) => cb(data)
    ipcRenderer.on('pty:data', handler)
    return () => { ipcRenderer.removeListener('pty:data', handler) }
  },
  sendPtyInput: (data: string) => ipcRenderer.send('pty:input', data),
  resizePty: (cols: number, rows: number) => ipcRenderer.send('pty:resize', cols, rows),
  sendCommand: (cmd: string) => ipcRenderer.send('pty:send-command', cmd),
  // Files
  getClaudeDir: () => ipcRenderer.invoke('files:claude-dir'),
  readFile: (path: string) => ipcRenderer.invoke('files:read', path),
  readImage: (path: string) => ipcRenderer.invoke('files:read-image', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('files:write', path, content),
  copyToContext: (srcPath: string) => ipcRenderer.invoke('files:copy-to-context', srcPath),
  saveFile: (srcPath: string) => ipcRenderer.invoke('files:save-attachment', srcPath),
  listFiles: () => ipcRenderer.invoke('files:list-attachments'),
  onFilesChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('files:changed', handler)
    return () => { ipcRenderer.removeListener('files:changed', handler) }
  },
  // PTY replay
  replayPty: () => ipcRenderer.invoke('pty:replay'),
  // Session management
  restartSession: (resumeId?: string) => ipcRenderer.invoke('pty:restart', resumeId),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  onPtyRestarted: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('pty:restarted', handler)
    return () => { ipcRenderer.removeListener('pty:restarted', handler) }
  },
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  // File drag-and-drop
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // Instance management
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
    return () => { ipcRenderer.removeListener('instance:switched', handler) }
  },
  // Terminal tabs
  listTabs: () => ipcRenderer.invoke('pty:tabs:list'),
  createTab: (label?: string) => ipcRenderer.invoke('pty:tabs:create', label),
  closeTab: (id: string) => ipcRenderer.invoke('pty:tabs:close', id),
  switchTab: (id: string) => ipcRenderer.invoke('pty:tabs:switch', id),
  renameTab: (id: string, label: string) => ipcRenderer.invoke('pty:tabs:rename', id, label),
  onTabsChanged: (cb: (tabs: any[]) => void) => {
    const handler = (_e: any, tabList: any[]) => cb(tabList)
    ipcRenderer.on('pty:tabs:changed', handler)
    return () => { ipcRenderer.removeListener('pty:tabs:changed', handler) }
  },
  onTabSwitched: (cb: (buffer: string) => void) => {
    const handler = (_e: any, buffer: string) => cb(buffer)
    ipcRenderer.on('pty:tab-switched', handler)
    return () => { ipcRenderer.removeListener('pty:tab-switched', handler) }
  },
  // Schedule management
  listSchedules: () => ipcRenderer.invoke('schedules:list'),
  createSchedule: (data: any) => ipcRenderer.invoke('schedules:create', data),
  updateSchedule: (id: string, data: any) => ipcRenderer.invoke('schedules:update', id, data),
  deleteSchedule: (id: string) => ipcRenderer.invoke('schedules:delete', id),
  toggleSchedule: (id: string) => ipcRenderer.invoke('schedules:toggle', id),
  runScheduleNow: (id: string) => ipcRenderer.invoke('schedules:run-now', id),
  onSchedulesChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('schedules:changed', handler)
    return () => { ipcRenderer.removeListener('schedules:changed', handler) }
  },
})
