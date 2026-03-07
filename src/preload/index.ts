import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('aios', {
  // PTY
  onPtyData: (cb: (data: string) => void) => ipcRenderer.on('pty:data', (_e, data) => cb(data)),
  sendPtyInput: (data: string) => ipcRenderer.send('pty:input', data),
  resizePty: (cols: number, rows: number) => ipcRenderer.send('pty:resize', cols, rows),
  sendCommand: (cmd: string) => ipcRenderer.send('pty:send-command', cmd),
  // Files
  getClaudeDir: () => ipcRenderer.invoke('files:claude-dir'),
  readFile: (path: string) => ipcRenderer.invoke('files:read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('files:write', path, content),
  onFilesChanged: (cb: () => void) => ipcRenderer.on('files:changed', () => cb()),
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:info'),
})
