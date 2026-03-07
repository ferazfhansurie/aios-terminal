import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import os from 'os'

let ptyProcess: pty.IPty | null = null

export function setupPty(win: BrowserWindow, cwd: string) {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh'

  // Spawn claude directly — this is a Claude Code-only terminal
  ptyProcess = pty.spawn(shell, ['-c', 'claude'], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  })

  ptyProcess.onData((data) => {
    win.webContents.send('pty:data', data)
  })

  ptyProcess.onExit(({ exitCode }) => {
    win.webContents.send('pty:exit', exitCode)
  })

  ipcMain.on('pty:input', (_event, data: string) => {
    ptyProcess?.write(data)
  })

  ipcMain.on('pty:resize', (_event, cols: number, rows: number) => {
    ptyProcess?.resize(cols, rows)
  })

  ipcMain.on('pty:send-command', (_event, cmd: string) => {
    ptyProcess?.write(cmd + '\n')
  })
}

export function destroyPty() {
  ptyProcess?.kill()
  ptyProcess = null
}
