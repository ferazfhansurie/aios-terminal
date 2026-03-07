import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('aios', {
  // PTY
  onPtyData: (cb: (data: string) => void) => ipcRenderer.on('pty:data', (_e, data) => cb(data)),
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
  onFilesChanged: (cb: () => void) => ipcRenderer.on('files:changed', () => cb()),
  // PTY replay (get buffered output for late-mounting renderer)
  replayPty: () => ipcRenderer.invoke('pty:replay'),
  // Session management
  restartSession: (resumeId?: string) => ipcRenderer.invoke('pty:restart', resumeId),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  onPtyRestarted: (cb: () => void) => ipcRenderer.on('pty:restarted', () => cb()),
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  // File drag-and-drop (contextIsolation-safe path resolution)
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
