import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { watch } from 'chokidar'

interface ClaudeDir {
  commands: { name: string; filename: string }[]
  skills: { name: string; dirname: string; isDir: boolean }[]
  context: { name: string; filename: string }[]
  memory: { name: string; filename: string }[]
  outputs: { name: string; filename: string }[]
  settings: Record<string, any> | null
}

let watcher: ReturnType<typeof watch> | null = null
let sessionWatcher: ReturnType<typeof watch> | null = null

export interface Session {
  id: string
  title: string
  messageCount: number
  timestamp: number // ms
}

/** Read/write custom session title overrides */
function getSessionMeta(sessionDir: string): Record<string, string> {
  const metaPath = path.join(sessionDir, 'session-meta.json')
  if (!fs.existsSync(metaPath)) return {}
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) } catch { return {} }
}

function saveSessionMeta(sessionDir: string, meta: Record<string, string>) {
  const metaPath = path.join(sessionDir, 'session-meta.json')
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
}

function extractSessionTitle(userMsg: string, assistantMsg?: string, secondUserMsg?: string): string {
  // Detect commands BEFORE stripping tags
  const hasCommandTag = /<command-name>/.test(userMsg)
  const cmdName = userMsg.match(/<command-name>\s*(.*?)\s*<\/command-name>/)?.[1]
  const cleanUser = userMsg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const isCommand = hasCommandTag || /^\/\w+/.test(cleanUser) || !cleanUser

  if (isCommand) {
    // Try assistant text first (most descriptive), then skill expansion
    const sources = [assistantMsg, secondUserMsg].filter(Boolean) as string[]
    for (const src of sources) {
      for (const line of src.split('\n')) {
        const trimmed = line.replace(/[#*_`>\-]/g, '').trim()
        if (trimmed.length > 5 && trimmed.length < 80
          && !trimmed.startsWith('```')
          && !/^(Step \d|Fast context|Load context)/i.test(trimmed)) {
          return trimmed.slice(0, 60)
        }
      }
    }
    // Fallback: show the command name
    if (cmdName) return cmdName
  }

  return cleanUser.slice(0, 80) || '(no message)'
}

function readSessions(sessionDir: string): Session[] {
  if (!fs.existsSync(sessionDir)) return []
  const meta = getSessionMeta(sessionDir)
  const sessions: Session[] = []
  const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'))
  for (const file of files) {
    const filePath = path.join(sessionDir, file)
    const id = file.replace('.jsonl', '')
    const mtime = fs.statSync(filePath).mtimeMs
    let firstUserMsg = ''
    let secondUserMsg = ''
    let firstAssistantMsg = ''
    let userMsgsSeen = 0
    let msgCount = 0
    let titleReady = false
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        const rec = JSON.parse(line)
        if (rec.type === 'user') {
          msgCount++
          if (!titleReady) {
            const content = rec.message?.content
            let text = ''
            if (Array.isArray(content)) {
              for (const c of content) {
                if (c?.type === 'text' && c.text) { text = c.text; break }
              }
            } else if (typeof content === 'string') {
              text = content
            }
            if (userMsgsSeen === 0 && text) firstUserMsg = text
            else if (userMsgsSeen === 1 && text) secondUserMsg = text
            userMsgsSeen++
            if (userMsgsSeen >= 2 && firstAssistantMsg) titleReady = true
          }
        }
        if (!titleReady && rec.type === 'assistant' && !firstAssistantMsg && Array.isArray(rec.message?.content)) {
          for (const block of rec.message.content) {
            if (block?.type === 'text' && block.text) {
              firstAssistantMsg = block.text
              break
            }
          }
          if (userMsgsSeen >= 2) titleReady = true
        }
      }
    } catch { /* skip corrupt files */ }
    if (msgCount > 0) {
      const title = meta[id] || extractSessionTitle(firstUserMsg, firstAssistantMsg, secondUserMsg)
      sessions.push({ id, title, messageCount: msgCount, timestamp: mtime })
    }
  }
  return sessions.sort((a, b) => b.timestamp - a.timestamp)
}

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  toolCalls?: { id: string; name: string; input?: any; output?: string; status: 'done' | 'error' }[]
}

const MAX_OUTPUT_LEN = 3000   // Truncate tool outputs
const MAX_INPUT_STR = 1000    // Truncate long string inputs
const MAX_THINKING_LEN = 2000 // Truncate thinking

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n... (truncated)' : s
}

function truncateInput(input: any): any {
  if (!input || typeof input !== 'object') return input
  const out: any = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === 'string' && v.length > MAX_INPUT_STR ? truncate(v, MAX_INPUT_STR) : v
  }
  return out
}

function readSessionMessages(sessionDir: string, sessionId: string): SessionMessage[] {
  const filePath = path.join(sessionDir, `${sessionId}.jsonl`)
  if (!fs.existsSync(filePath)) return []

  const messages: SessionMessage[] = []
  // Pending tool calls that need output filled in
  const pendingTools = new Map<string, { id: string; name: string; input?: any; output: string; status: 'done' }>()

  try {
    const data = fs.readFileSync(filePath, 'utf-8')
    // Split by newlines — avoid creating huge arrays for empty lines
    let start = 0
    const len = data.length

    while (start < len) {
      let end = data.indexOf('\n', start)
      if (end === -1) end = len
      if (end > start) {
        const line = data.slice(start, end)
        try {
          const rec = JSON.parse(line)

          if (rec.type === 'user' && rec.message?.content) {
            const content = rec.message.content

            // Extract tool results and backfill pending tools
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block?.type === 'tool_result' && block.tool_use_id) {
                  const pending = pendingTools.get(block.tool_use_id)
                  if (pending) {
                    let output = ''
                    if (typeof block.content === 'string') {
                      output = block.content
                    } else if (Array.isArray(block.content)) {
                      const texts = block.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text)
                      output = texts.join('\n')
                      if (!output) {
                        const ref = block.content.find((c: any) => c?.type === 'tool_reference')
                        if (ref) output = `[${ref.tool_name} output]`
                      }
                    }
                    pending.output = truncate(output, MAX_OUTPUT_LEN)
                    pendingTools.delete(block.tool_use_id)
                  }
                }
              }
            }

            // Extract user text
            let text = ''
            if (typeof content === 'string') {
              text = content
            } else if (Array.isArray(content)) {
              text = content
                .filter((c: any) => c?.type === 'text' && c.text && !c.text.startsWith('<ide_'))
                .map((c: any) => c.text)
                .join('\n')
            }
            if (text.trim()) {
              messages.push({ role: 'user', content: text.trim() })
            }
          }

          if (rec.type === 'assistant' && Array.isArray(rec.message?.content)) {
            let text = ''
            let thinking = ''
            const toolCalls: SessionMessage['toolCalls'] = []

            for (const block of rec.message.content) {
              if (block?.type === 'text' && block.text) text += block.text
              if (block?.type === 'thinking' && block.thinking) thinking += block.thinking
              if (block?.type === 'tool_use') {
                const tc = {
                  id: block.id,
                  name: block.name,
                  input: truncateInput(block.input),
                  output: '',
                  status: 'done' as const,
                }
                toolCalls.push(tc)
                pendingTools.set(block.id, tc) // will be filled when tool_result arrives
              }
            }

            if (thinking) thinking = truncate(thinking, MAX_THINKING_LEN)

            const prev = messages[messages.length - 1]
            if (prev?.role === 'assistant' && !text && !thinking && toolCalls.length === 0) {
              // skip empty assistant blocks
            } else if (prev?.role === 'assistant') {
              if (text) prev.content = prev.content ? prev.content + text : text
              if (thinking) prev.thinking = prev.thinking ? prev.thinking + thinking : thinking
              if (toolCalls.length > 0) prev.toolCalls = [...(prev.toolCalls || []), ...toolCalls]
            } else if (text || thinking || toolCalls.length > 0) {
              messages.push({
                role: 'assistant',
                content: text,
                thinking: thinking || undefined,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              })
            }
          }
        } catch { /* skip malformed line */ }
      }
      start = end + 1
    }
  } catch { /* file read error */ }

  return messages
}

/** Derive Claude's memory dir from a cwd (same encoding Claude uses) */
function getMemoryDir(cwd: string): string {
  const encodedCwd = cwd.replace(/\//g, '-')
  return path.join(process.env.HOME || '', `.claude/projects/${encodedCwd}/memory`)
}

/** Derive Claude's session dir from a cwd */
function getSessionDir(cwd: string): string {
  const encodedCwd = cwd.replace(/\//g, '-')
  return path.join(process.env.HOME || '', `.claude/projects/${encodedCwd}`)
}

export function setupFileHandlers(win: BrowserWindow, cwd: string) {
  // Remove any previously registered handlers
  ipcMain.removeHandler('files:claude-dir')
  ipcMain.removeHandler('files:read')
  ipcMain.removeHandler('files:write')
  ipcMain.removeHandler('files:read-image')
  ipcMain.removeHandler('files:copy-to-context')
  ipcMain.removeHandler('files:save-attachment')
  ipcMain.removeHandler('files:list-attachments')
  ipcMain.removeHandler('sessions:list')
  ipcMain.removeHandler('sessions:messages')
  ipcMain.removeHandler('sessions:rename')
  ipcMain.removeHandler('sessions:delete')

  // Close old watcher
  if (watcher) { watcher.close(); watcher = null }

  const claudeDir = path.join(cwd, '.claude')
  const memoryDir = getMemoryDir(cwd)
  const sessionDir = getSessionDir(cwd)
  const attachmentsDir = path.join(cwd, 'files')

  ipcMain.handle('files:claude-dir', async (): Promise<ClaudeDir> => {
    const result: ClaudeDir = {
      commands: [],
      skills: [],
      context: [],
      memory: [],
      outputs: [],
      settings: null,
    }

    const cmdsDir = path.join(claudeDir, 'commands')
    if (fs.existsSync(cmdsDir)) {
      result.commands = fs.readdirSync(cmdsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f.replace('.md', ''),
          filename: path.join(cmdsDir, f),
        }))
    }

    const skillsDir = path.join(claudeDir, 'skills')
    if (fs.existsSync(skillsDir)) {
      result.skills = fs.readdirSync(skillsDir).map(f => ({
        name: f.replace('.md', ''),
        dirname: path.join(skillsDir, f),
        isDir: fs.statSync(path.join(skillsDir, f)).isDirectory(),
      }))
    }

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

    if (fs.existsSync(memoryDir)) {
      result.memory = fs.readdirSync(memoryDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f.replace('.md', ''),
          filename: path.join(memoryDir, f),
        }))
    }

    const outputsDir = path.join(cwd, 'outputs')
    if (fs.existsSync(outputsDir)) {
      result.outputs = fs.readdirSync(outputsDir)
        .filter(f => !fs.statSync(path.join(outputsDir, f)).isDirectory())
        .map(f => ({ name: f, filename: path.join(outputsDir, f) }))
    }

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
    const mime = ext === 'pdf' ? 'application/pdf'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
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

  ipcMain.handle('sessions:list', async (): Promise<Session[]> => readSessions(sessionDir))

  ipcMain.handle('sessions:messages', async (_event, sessionId: string): Promise<any[]> => {
    try {
      const msgs = readSessionMessages(sessionDir, sessionId)
      console.log(`[AIOS] Session ${sessionId.slice(0, 8)}: ${msgs.length} messages parsed`)
      return msgs
    } catch (err) {
      console.error(`[AIOS] Failed to parse session ${sessionId}:`, err)
      return []
    }
  })

  ipcMain.handle('sessions:rename', async (_event, sessionId: string, newTitle: string) => {
    const meta = getSessionMeta(sessionDir)
    meta[sessionId] = newTitle
    saveSessionMeta(sessionDir, meta)
    return readSessions(sessionDir)
  })

  ipcMain.handle('sessions:delete', async (_event, sessionId: string) => {
    const filePath = path.join(sessionDir, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    // Clean up meta entry
    const meta = getSessionMeta(sessionDir)
    if (meta[sessionId]) {
      delete meta[sessionId]
      saveSessionMeta(sessionDir, meta)
    }
    return readSessions(sessionDir)
  })

  // Watch .claude dir for workspace file changes
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

  // Watch session dir for real-time JSONL changes (separate watcher with debounce)
  if (sessionWatcher) { sessionWatcher.close(); sessionWatcher = null }

  if (fs.existsSync(sessionDir)) {
    let sessionDebounce: ReturnType<typeof setTimeout> | null = null
    const changedSessionIds = new Set<string>()

    sessionWatcher = watch(sessionDir, {
      ignoreInitial: true,
      depth: 0,
    })
    sessionWatcher.on('all', (_event, filePath) => {
      if (typeof filePath !== 'string' || !filePath.endsWith('.jsonl')) return
      const sessionId = path.basename(filePath, '.jsonl')
      changedSessionIds.add(sessionId)

      // Debounce: batch rapid writes into a single update (500ms)
      if (sessionDebounce) clearTimeout(sessionDebounce)
      sessionDebounce = setTimeout(() => {
        if (win.isDestroyed()) return
        const ids = Array.from(changedSessionIds)
        changedSessionIds.clear()
        // Send list of changed session IDs + fresh session list
        const sessions = readSessions(sessionDir)
        win.webContents.send('sessions:changed', { sessionIds: ids, sessions })
      }, 500)
    })
  }
}

export function destroyFileWatcher() {
  watcher?.close()
  sessionWatcher?.close()
}
