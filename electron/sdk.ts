import { query } from '@anthropic-ai/claude-code'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { addCreditUsage } from './db'

interface QueryOptions {
  prompt: string
  conversationId: string
  cwd: string
  sessionId?: string
  maxTurns?: number
  apiKey?: string
  mcpServers?: Record<string, any>
}

let activeGenerator: AsyncGenerator<any> | null = null
let shouldAbort = false

export async function runQuery(win: BrowserWindow, opts: QueryOptions) {
  shouldAbort = false

  const sdkOpts: Record<string, any> = {
    permissionMode: 'bypassPermissions',
    cwd: opts.cwd,
    includePartialMessages: true,
    maxTurns: opts.maxTurns || 200,
  }

  // API key — free tier users provide their own
  if (opts.apiKey) {
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

  try {
    const generator = query({ prompt: opts.prompt, options: sdkOpts })
    activeGenerator = generator

    for await (const message of generator) {
      if (shouldAbort) break
      if (!win.isDestroyed()) {
        win.webContents.send('sdk:message', {
          conversationId: opts.conversationId,
          message,
        })
      }

      // Track token usage from result
      if (message.type === 'result') {
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
  } catch (err: any) {
    if (!win.isDestroyed()) {
      win.webContents.send('sdk:error', {
        conversationId: opts.conversationId,
        error: err.message || 'Query failed',
      })
    }
  }

  activeGenerator = null

  if (!win.isDestroyed()) {
    win.webContents.send('sdk:complete', {
      conversationId: opts.conversationId,
    })
  }
}

export function abortQuery() {
  shouldAbort = true
  if (activeGenerator) {
    activeGenerator.return(undefined).catch(() => {})
    activeGenerator = null
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
