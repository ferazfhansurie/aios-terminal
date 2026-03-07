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

export interface Session {
  id: string
  title: string
  messageCount: number
  timestamp: number // ms
}

function extractSessionTitle(text: string): string {
  // Strip XML-like tags Claude wraps special messages in
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '(no message)'
}

function readSessions(sessionDir: string): Session[] {
  if (!fs.existsSync(sessionDir)) return []
  const sessions: Session[] = []
  const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'))
  for (const file of files) {
    const filePath = path.join(sessionDir, file)
    const id = file.replace('.jsonl', '')
    const mtime = fs.statSync(filePath).mtimeMs
    let firstMsg = ''
    let msgCount = 0
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        const rec = JSON.parse(line)
        if (rec.type === 'user') {
          msgCount++
          if (!firstMsg) {
            const content = rec.message?.content
            if (Array.isArray(content)) {
              for (const c of content) {
                if (c?.type === 'text' && c.text) { firstMsg = c.text; break }
              }
            } else if (typeof content === 'string') {
              firstMsg = content
            }
          }
        }
      }
    } catch { /* skip corrupt files */ }
    if (msgCount > 0) {
      sessions.push({ id, title: extractSessionTitle(firstMsg), messageCount: msgCount, timestamp: mtime })
    }
  }
  return sessions.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30)
}

export function setupFileHandlers(win: BrowserWindow, cwd: string) {
  // Remove any previously registered handlers (e.g. on hot reload)
  ipcMain.removeHandler('files:claude-dir')
  ipcMain.removeHandler('files:read')
  ipcMain.removeHandler('files:write')
  ipcMain.removeHandler('files:read-image')
  ipcMain.removeHandler('files:copy-to-context')
  ipcMain.removeHandler('files:save-attachment')
  ipcMain.removeHandler('files:list-attachments')
  ipcMain.removeHandler('sessions:list')
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

    // Context — markdown + images
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
    const ctxDir = path.join(claudeDir, 'context')
    if (fs.existsSync(ctxDir)) {
      result.context = fs.readdirSync(ctxDir)
        .filter(f => f.endsWith('.md') || IMAGE_EXTS.has(path.extname(f).toLowerCase()))
        .map(f => ({
          name: f.endsWith('.md') ? f.replace('.md', '') : f,
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

  ipcMain.handle('files:read-image', async (_event, filePath: string): Promise<string> => {
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : ext === 'svg' ? 'image/svg+xml'
      : 'image/png'
    const data = fs.readFileSync(filePath)
    return `data:${mime};base64,${data.toString('base64')}`
  })

  ipcMain.handle('files:copy-to-context', async (_event, srcPath: string): Promise<string> => {
    const ctxDir = path.join(claudeDir, 'context')
    if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true })
    const dest = path.join(ctxDir, path.basename(srcPath))
    fs.copyFileSync(srcPath, dest)
    return dest
  })

  const attachmentsDir = path.join(cwd, 'files')

  ipcMain.handle('files:save-attachment', async (_event, srcPath: string): Promise<string> => {
    if (!fs.existsSync(attachmentsDir)) fs.mkdirSync(attachmentsDir, { recursive: true })
    const dest = path.join(attachmentsDir, path.basename(srcPath))
    fs.copyFileSync(srcPath, dest)
    return dest
  })

  ipcMain.handle('files:list-attachments', async (): Promise<{ name: string; filename: string }[]> => {
    if (!fs.existsSync(attachmentsDir)) return []
    return fs.readdirSync(attachmentsDir)
      .filter(f => !fs.statSync(path.join(attachmentsDir, f)).isDirectory())
      .map(f => ({ name: f, filename: path.join(attachmentsDir, f) }))
  })

  // Sessions — derive project folder from cwd (same encoding Claude uses)
  const encodedCwd = cwd.replace(/\//g, '-')
  const sessionDir = path.join(process.env.HOME || '', `.claude/projects/${encodedCwd}`)
  ipcMain.handle('sessions:list', async (): Promise<Session[]> => readSessions(sessionDir))

  // Watch for changes
  const watchPaths = [claudeDir]
  if (fs.existsSync(memoryDir)) watchPaths.push(memoryDir)
  if (fs.existsSync(attachmentsDir)) watchPaths.push(attachmentsDir)

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
