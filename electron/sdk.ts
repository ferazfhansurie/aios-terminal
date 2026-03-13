import { query } from '@anthropic-ai/claude-code'
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { addCreditUsage } from './db'

// Resolve the actual cli.js path — in packaged app, asar paths can't be spawned as child processes
let claudeCodeCliPath: string | undefined
try {
  const req = createRequire(import.meta.url)
  const sdkPath = req.resolve('@anthropic-ai/claude-code')
  let cliPath = path.join(path.dirname(sdkPath), 'cli.js')
  // Fix asar path → asar.unpacked (electron can't spawn from inside asar archive)
  if (cliPath.includes('app.asar') && !cliPath.includes('app.asar.unpacked')) {
    cliPath = cliPath.replace('app.asar', 'app.asar.unpacked')
  }
  if (fs.existsSync(cliPath)) claudeCodeCliPath = cliPath
} catch {
  // Fall back to SDK default
}

interface QueryOptions {
  prompt: string
  conversationId: string
  cwd: string
  sessionId?: string
  maxTurns?: number
  apiKey?: string
  mcpServers?: Record<string, any>
}

// Track active queries per conversation so they can run concurrently
const activeQueries = new Map<string, { generator: AsyncGenerator<any>; aborted: boolean }>()

export async function runQuery(win: BrowserWindow, opts: QueryOptions) {
  // Abort any existing query for this conversation
  const existing = activeQueries.get(opts.conversationId)
  if (existing) {
    existing.aborted = true
    existing.generator.return(undefined).catch(() => {})
    activeQueries.delete(opts.conversationId)
  }

  const sdkOpts: Record<string, any> = {
    permissionMode: 'bypassPermissions',
    cwd: opts.cwd,
    includePartialMessages: true,
    maxTurns: opts.maxTurns || 200,
    ...(claudeCodeCliPath ? { pathToClaudeCodeExecutable: claudeCodeCliPath } : {}),
  }

  // API key — only pass real API keys to the SDK
  // __owner__, __local__, and user:* use existing Claude Code auth (no key needed)
  if (opts.apiKey && !opts.apiKey.startsWith('__') && !opts.apiKey.startsWith('user:')) {
    sdkOpts.apiKey = opts.apiKey
  }

  // MCP servers from .mcp.json
  if (opts.mcpServers) {
    sdkOpts.mcpServers = opts.mcpServers
  }

  // Resume existing conversation
  if (opts.sessionId) {
    sdkOpts.resume = opts.sessionId
  }

  // Debug log to file for packaged app diagnosis
  const debugLog = path.join(app.getPath('userData'), 'sdk-debug.log')
  const logLine = (msg: string) => { try { fs.appendFileSync(debugLog, `${new Date().toISOString()} ${msg}\n`) } catch {} }
  logLine(`runQuery: cwd=${opts.cwd} cliPath=${claudeCodeCliPath} PATH=${process.env.PATH?.slice(0, 200)}`)

  console.log('[SDK] runQuery:', { convId: opts.conversationId.slice(0, 8), prompt: opts.prompt.slice(0, 80), cwd: opts.cwd, sessionId: opts.sessionId?.slice(0, 8) })

  const queryState = { generator: null as any, aborted: false }

  try {
    console.log('[SDK] calling query()...')
    logLine(`calling query with opts: ${JSON.stringify({ ...sdkOpts, prompt: opts.prompt.slice(0, 50) })}`)
    const generator = query({ prompt: opts.prompt, options: sdkOpts })
    queryState.generator = generator
    activeQueries.set(opts.conversationId, queryState as any)
    let msgCount = 0

    for await (const message of generator) {
      msgCount++
      if (msgCount <= 3) console.log('[SDK] message #' + msgCount + ':', message.type)
      if (queryState.aborted) break
      if (!win.isDestroyed()) {
        win.webContents.send('sdk:message', {
          conversationId: opts.conversationId,
          message,
        })
      }

      // Track token usage from result
      if (message.type === 'result') {
        console.log('[SDK] result received, session_id:', message.session_id?.slice(0, 8))
        const usage = message.usage || {}
        const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0)
        if (totalTokens > 0) {
          addCreditUsage(totalTokens, opts.conversationId)
        }

        // Send session ID back for resume
        if (!win.isDestroyed()) {
          win.webContents.send('sdk:result', {
            conversationId: opts.conversationId,
            sessionId: message.session_id,
            usage,
          })
        }
      }
    }
    console.log('[SDK] generator done, total messages:', msgCount)
  } catch (err: any) {
    const errMsg = err.message || String(err)
    const stderr = err.stderr || ''
    // Log full error details including all properties
    const errDetails = JSON.stringify({ message: errMsg, stderr, code: err.code, exitCode: err.exitCode, stack: err.stack?.slice(0, 500) })
    logLine(`ERROR: ${errDetails}`)
    console.error('[SDK] ERROR:', errMsg, stderr ? `\nSTDERR: ${stderr}` : '')
    if (!win.isDestroyed()) {
      win.webContents.send('sdk:error', {
        conversationId: opts.conversationId,
        error: stderr ? `${errMsg}\n${stderr}` : errMsg,
      })
    }
  }

  activeQueries.delete(opts.conversationId)

  if (!win.isDestroyed()) {
    win.webContents.send('sdk:complete', {
      conversationId: opts.conversationId,
    })
  }
}

export function abortQuery(conversationId?: string) {
  if (conversationId) {
    const q = activeQueries.get(conversationId)
    if (q) {
      q.aborted = true
      q.generator?.return(undefined).catch(() => {})
      activeQueries.delete(conversationId)
    }
  } else {
    // Abort all
    for (const [id, q] of activeQueries) {
      q.aborted = true
      q.generator?.return(undefined).catch(() => {})
    }
    activeQueries.clear()
  }
}

export function loadMcpServers(cwd: string): Record<string, any> | undefined {
  const mcpPath = path.join(cwd, '.mcp.json')
  if (!fs.existsSync(mcpPath)) return undefined
  try {
    const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'))
    return config.mcpServers || undefined
  } catch {
    return undefined
  }
}
