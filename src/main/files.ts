import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { watch } from 'chokidar'

interface ClaudeDir {
  commands: { name: string; filename: string }[]
  skills: { name: string; dirname: string; isDir: boolean }[]
  context: { name: string; filename: string }[]
  memory: { name: string; filename: string }[]
  settings: Record<string, any> | null
}

let watcher: ReturnType<typeof watch> | null = null

export function setupFileHandlers(win: BrowserWindow, cwd: string) {
  const claudeDir = path.join(cwd, '.claude')
  const memoryDir = path.join(
    process.env.HOME || '',
    '.claude/projects/-Users-firazfhansurie-Repo-firaz-adletic-aios-template/memory'
  )

  ipcMain.handle('files:claude-dir', async (): Promise<ClaudeDir> => {
    const result: ClaudeDir = {
      commands: [],
      skills: [],
      context: [],
      memory: [],
      settings: null,
    }

    // Commands
    const cmdsDir = path.join(claudeDir, 'commands')
    if (fs.existsSync(cmdsDir)) {
      result.commands = fs.readdirSync(cmdsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f.replace('.md', ''),
          filename: path.join(cmdsDir, f),
        }))
    }

    // Skills
    const skillsDir = path.join(claudeDir, 'skills')
    if (fs.existsSync(skillsDir)) {
      result.skills = fs.readdirSync(skillsDir).map(f => ({
        name: f.replace('.md', ''),
        dirname: path.join(skillsDir, f),
        isDir: fs.statSync(path.join(skillsDir, f)).isDirectory(),
      }))
    }

    // Context
    const ctxDir = path.join(claudeDir, 'context')
    if (fs.existsSync(ctxDir)) {
      result.context = fs.readdirSync(ctxDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f.replace('.md', ''),
          filename: path.join(ctxDir, f),
        }))
    }

    // Memory
    if (fs.existsSync(memoryDir)) {
      result.memory = fs.readdirSync(memoryDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f.replace('.md', ''),
          filename: path.join(memoryDir, f),
        }))
    }

    // Settings
    const settingsPath = path.join(claudeDir, 'settings.json')
    if (fs.existsSync(settingsPath)) {
      try {
        result.settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      } catch { /* ignore parse errors */ }
    }

    return result
  })

  ipcMain.handle('files:read', async (_event, filePath: string): Promise<string> => {
    return fs.readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('files:write', async (_event, filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, 'utf-8')
  })

  // Watch for changes
  const watchPaths = [claudeDir]
  if (fs.existsSync(memoryDir)) watchPaths.push(memoryDir)

  watcher = watch(watchPaths, {
    ignoreInitial: true,
    depth: 2,
  })
  watcher.on('all', () => {
    win.webContents.send('files:changed')
  })
}

export function destroyFileWatcher() {
  watcher?.close()
}
