import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import os from 'os'

let ptyProcess: pty.IPty | null = null
const BUFFER_LIMIT = 500
let outputBuffer: string[] = []

const home = os.homedir()
const claudeBin = `${home}/.local/bin/claude`
const fullPath = [
  `${home}/.local/bin`,
  `${home}/.npm-global/bin`,
  '/opt/homebrew/bin',
  '/usr/local/bin',
  process.env.PATH || '',
].join(':')

function spawnClaude(win: BrowserWindow, cwd: string, resumeId?: string) {
  if (ptyProcess) {
    try { ptyProcess.kill() } catch { /* already dead */ }
    ptyProcess = null
  }
  outputBuffer = []

  const args = resumeId ? ['--resume', resumeId] : []
  ptyProcess = pty.spawn(claudeBin, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: { ...process.env, PATH: fullPath, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  })

  ptyProcess.onData((data) => {
    if (outputBuffer.length < BUFFER_LIMIT) outputBuffer.push(data)
    win.webContents.send('pty:data', data)
  })

  ptyProcess.onExit(({ exitCode }) => {
    ptyProcess = null
    win.webContents.send('pty:exit', exitCode)
  })
}

export function setupPty(win: BrowserWindow, cwd: string) {
  ipcMain.removeAllListeners('pty:input')
  ipcMain.removeAllListeners('pty:resize')
  ipcMain.removeAllListeners('pty:send-command')
  ipcMain.removeHandler('pty:replay')
  ipcMain.removeHandler('pty:restart')

  spawnClaude(win, cwd)

  ipcMain.handle('pty:replay', () => outputBuffer.join(''))

  ipcMain.handle('pty:restart', (_event, resumeId?: string) => {
    spawnClaude(win, cwd, resumeId)
    win.webContents.send('pty:restarted')
  })

  ipcMain.on('pty:input', (_event, data: string) => {
    ptyProcess?.write(data)
  })

  ipcMain.on('pty:resize', (_event, cols: number, rows: number) => {
    if (!ptyProcess) return
    try { ptyProcess.resize(cols, rows) } catch { /* fd closed */ }
  })

  ipcMain.on('pty:send-command', (_event, cmd: string) => {
    ptyProcess?.write(cmd + '\n')
  })
}

export function destroyPty() {
  ptyProcess?.kill()
  ptyProcess = null
}
