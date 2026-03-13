import { create } from 'zustand'
import type { Message, Conversation, ToolCall, AppConfig, AppView } from '../types'

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Check if user message is a command */
function isCommand(text: string): boolean {
  return /^\/\w+/.test(text) || /<command-name>/.test(text) || /<command-message>/.test(text)
}

/** Extract clean display from user message — strips command tags and skill content */
function stripCommandTags(text: string): string {
  const cmdName = text.match(/<command-name>\s*(.*?)\s*<\/command-name>/)?.[1]
  if (cmdName) return cmdName
  if (text.includes('<command-message>')) {
    return text.match(/<command-message>\s*(.*?)\s*<\/command-message>/)?.[1] || text
  }
  const slashMatch = text.match(/^(\/\w+)/)
  if (slashMatch) return slashMatch[1]
  return text
}

/** Extract a descriptive title from AI response text */
function extractTitle(text: string): string | null {
  // Skip skill template content
  if (/###\s+Step\s+\d+/i.test(text)) return null
  // Try first markdown heading
  const heading = text.match(/^#+\s+(.+)/m)
  if (heading) {
    const h = heading[1].replace(/[*_`#]/g, '').trim()
    if (h.length > 3 && h.length < 80) return h
  }
  // Try first non-empty, non-code line
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/[#*_`>\-]/g, '').trim()
    if (trimmed.length > 5 && trimmed.length < 80 && !trimmed.startsWith('```')) {
      return trimmed
    }
  }
  return null
}

// Persist config to localStorage
function loadPersistedConfig(): Partial<AppConfig> {
  try {
    const raw = localStorage.getItem('aios-config')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function persistConfig(config: AppConfig) {
  try {
    localStorage.setItem('aios-config', JSON.stringify(config))
  } catch {}
}

interface AppState {
  // Config
  config: AppConfig
  setConfig: (config: Partial<AppConfig>) => void

  // Conversations
  conversations: Conversation[]
  activeConversationId: string | null
  setActiveConversation: (id: string | null) => void
  loadConversations: () => Promise<void>
  loadMessages: (convId: string) => Promise<void>
  createNewChat: () => string
  deleteChat: (id: string) => Promise<void>

  // Session import
  importSession: (sessionId: string, title: string, messages: Message[]) => string

  // Messages
  addUserMessage: (content: string) => void
  appendAssistantContent: (convId: string, content: string) => void
  setAssistantStreaming: (convId: string, streaming: boolean) => void
  addToolCall: (convId: string, tool: ToolCall) => void
  updateToolCall: (convId: string, toolName: string, update: Partial<ToolCall>) => void
  setThinking: (convId: string, thinking: string) => void

  // Query state + message queue
  isQuerying: boolean
  queryingConvId: string | null
  setQuerying: (v: boolean, convId?: string | null) => void
  messageQueue: { prompt: string; convId: string }[]
  enqueueMessage: (msg: { prompt: string; convId: string }) => void
  dequeueMessage: () => { prompt: string; convId: string } | undefined

  // Credits
  creditsUsed: number
  creditLimit: number
  loadCredits: () => Promise<void>

  // View
  view: AppView
  setView: (v: AppView) => void
  editingFile: string | null
  setEditingFile: (path: string | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void

  // Edit user message inline — updates content, trims after, re-sends
  editUserMessage: (messageId: string, newContent?: string) => void

  // Input injection (for skills modal → chat input)
  pendingInput: string | null
  setPendingInput: (v: string | null) => void
}

const persisted = loadPersistedConfig()

export const useAppStore = create<AppState>((set, get) => ({
  // Config — hydrate from localStorage
  config: {
    apiKey: persisted.apiKey,
    tier: persisted.tier || 'free',
    appearance: persisted.appearance || 'dark',
    theme: persisted.theme || {
      name: 'AIOS',
      primaryColor: '#f97316',
      darkBg: '#0a0a0c',
    },
  },
  setConfig: (updates) => {
    const newConfig = { ...get().config, ...updates }
    persistConfig(newConfig)
    set({ config: newConfig })
  },

  // Conversations
  conversations: [],
  activeConversationId: null,

  setActiveConversation: (id) => {
    set({ activeConversationId: id })
    // Auto-load messages if not loaded yet
    if (id) {
      const conv = get().conversations.find((c) => c.id === id)
      console.log('[AIOS] setActiveConversation:', id, {
        found: !!conv,
        msgCount: conv?.messages.length,
        loaded: conv?._messagesLoaded,
        sessionId: conv?.sessionId,
      })
      if (conv && conv.messages.length === 0 && !conv._messagesLoaded) {
        get().loadMessages(id)
      }
    }
  },

  loadConversations: async () => {
    const aios = (window as any).aios
    if (!aios) return
    try {
      const convs = await aios.listConversations(50)
      console.log('[AIOS] loadConversations: got', convs.length, 'from SQLite')
      const existing = get().conversations
      const conversations = convs.map((c: any) => {
        const inMemory = existing.find((e) => e.id === c.id)
        // Clean up old titles with command tags
        let title = c.title
        if (title && (title.includes('<command') || /^prime is running/.test(title))) {
          title = stripCommandTags(title)
        }
        return {
          id: c.id,
          title,
          messages: inMemory?.messages || [],
          sessionId: c.session_id || inMemory?.sessionId,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          _messagesLoaded: inMemory?._messagesLoaded || false,
        }
      })
      set({ conversations })
    } catch (err) {
      console.error('[AIOS] loadConversations error:', err)
    }
  },

  loadMessages: async (convId) => {
    const aios = (window as any).aios
    if (!aios) return
    try {
      const rows = await aios.getMessages(convId)
      console.log('[AIOS] loadMessages:', convId, '→ SQLite rows:', rows.length)
      let messages: Message[] = rows.map((r: any) => ({
        id: r.id?.toString() || generateId(),
        role: r.role,
        content: r.content,
        toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        createdAt: r.created_at,
      }))

      // Fallback: if no SQLite messages and conversation has a sessionId, load from JSONL
      if (messages.length === 0) {
        const conv = get().conversations.find((c) => c.id === convId)
        console.log('[AIOS] loadMessages: no SQLite msgs, sessionId =', conv?.sessionId)
        if (conv?.sessionId && aios.getSessionMessages) {
          const rawMessages = await aios.getSessionMessages(conv.sessionId)
          console.log('[AIOS] loadMessages: JSONL fallback got', rawMessages.length, 'messages')
          messages = rawMessages.map((m: any, i: number) => {
            const blocks: any[] = []
            if (m.content) blocks.push({ type: 'text', text: m.content })
            if (m.toolCalls) {
              for (const tc of m.toolCalls) {
                blocks.push({ type: 'tool', tool: tc })
              }
            }
            return {
              id: `${convId}-${i}`,
              role: m.role,
              content: m.content || '',
              blocks: m.role === 'assistant' ? blocks : undefined,
              toolCalls: m.toolCalls,
              thinking: m.thinking,
              createdAt: (conv.createdAt || Date.now()) - (rawMessages.length - i) * 1000,
            }
          })
        }
      }

      console.log('[AIOS] loadMessages: final count =', messages.length)
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, messages, _messagesLoaded: true } : c
        ),
      }))
    } catch (err) {
      console.error('[AIOS] loadMessages error:', err)
    }
  },

  createNewChat: () => {
    const id = generateId()
    const conv: Conversation = {
      id,
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }))
    return id
  },

  deleteChat: async (id) => {
    const aios = (window as any).aios
    if (aios) await aios.deleteConversation(id)
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    }))
  },

  // Session import — create conversation from Claude Code session data
  importSession: (sessionId, title, messages) => {
    const id = generateId()
    const conv: Conversation = {
      id,
      title,
      messages,
      sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      _messagesLoaded: true,
    }
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
      view: 'chat' as const,
    }))
    return id
  },

  // Messages
  addUserMessage: (content) => {
    const msg: Message = {
      id: generateId(),
      role: 'user',
      content,
      createdAt: Date.now(),
    }
    set((s) => {
      const convId = s.activeConversationId
      if (!convId) return s
      const convs = s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, msg],
              updatedAt: Date.now(),
              title: c.messages.length === 0
                ? (isCommand(content) ? 'New chat' : stripCommandTags(content).slice(0, 60))
                : c.title,
            }
          : c
      )
      return { conversations: convs }
    })
  },

  appendAssistantContent: (convId, content) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = [...c.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && last.isStreaming) {
          // Append text to content and to the last text block (or create one)
          const blocks = [...(last.blocks || [])]
          const lastBlock = blocks[blocks.length - 1]
          if (lastBlock?.type === 'text') {
            blocks[blocks.length - 1] = { type: 'text', text: lastBlock.text + content }
          } else {
            blocks.push({ type: 'text', text: content })
          }
          msgs[msgs.length - 1] = { ...last, content: last.content + content, blocks }
        } else {
          msgs.push({
            id: generateId(),
            role: 'assistant',
            content,
            blocks: [{ type: 'text', text: content }],
            isStreaming: true,
            createdAt: Date.now(),
          })
        }
        // Auto-title from AI response when title is still "New chat"
        let title = c.title
        if (title === 'New chat') {
          const fullContent = msgs[msgs.length - 1]?.content || ''
          const extracted = extractTitle(fullContent)
          if (extracted) title = extracted.slice(0, 60)
        }
        return { ...c, messages: msgs, title, updatedAt: Date.now() }
      })
      return { conversations: convs }
    })
  },

  setAssistantStreaming: (convId, streaming) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = c.messages.map((m, i) =>
          i === c.messages.length - 1 && m.role === 'assistant'
            ? { ...m, isStreaming: streaming }
            : m
        )
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  addToolCall: (convId, tool) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = [...c.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          const tools = [...(last.toolCalls || []), tool]
          const blocks = [...(last.blocks || []), { type: 'tool' as const, tool }]
          msgs[msgs.length - 1] = { ...last, toolCalls: tools, blocks }
        }
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  updateToolCall: (convId, toolIdOrName, update) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = c.messages.map((m) => {
          if (m.role !== 'assistant' || !m.toolCalls) return m
          let matchedId: string | undefined
          const tools = m.toolCalls.map((t) => {
            if (matchedId) return t
            const isMatch = (t.id && t.id === toolIdOrName) ||
              (!t.id && t.name === toolIdOrName && t.status !== 'done')
            if (isMatch) {
              matchedId = t.id || t.name
              return { ...t, ...update }
            }
            return t
          })
          // Also update tool inside blocks
          const blocks = m.blocks?.map((b) => {
            if (b.type !== 'tool') return b
            const t = b.tool
            const isMatch = matchedId && ((t.id && t.id === matchedId) || (!t.id && t.name === matchedId))
            return isMatch ? { ...b, tool: { ...t, ...update } } : b
          })
          return { ...m, toolCalls: tools, blocks }
        })
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  setThinking: (convId, thinking) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = [...c.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, thinking }
        } else {
          msgs.push({
            id: generateId(),
            role: 'assistant',
            content: '',
            blocks: [],
            thinking,
            isStreaming: true,
            createdAt: Date.now(),
          })
        }
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  // Query state + message queue
  isQuerying: false,
  queryingConvId: null,
  setQuerying: (v, convId) => set({ isQuerying: v, queryingConvId: v ? (convId ?? get().activeConversationId) : null }),
  messageQueue: [],
  enqueueMessage: (msg: { prompt: string; convId: string }) => set((s) => ({
    messageQueue: [...s.messageQueue, msg].slice(-20), // cap at 20
  })),
  dequeueMessage: () => {
    const queue = get().messageQueue
    if (queue.length === 0) return undefined
    const [next, ...rest] = queue
    set({ messageQueue: rest })
    return next
  },

  // Credits
  creditsUsed: 0,
  creditLimit: 10_000,
  loadCredits: async () => {
    const aios = (window as any).aios
    if (!aios) return
    const [used, limit] = await Promise.all([
      aios.getCreditsToday(),
      aios.getCreditLimit(),
    ])
    set({ creditsUsed: used, creditLimit: limit })
  },

  // View
  view: 'chat',
  setView: (v) => set({ view: v }),
  editingFile: null,
  setEditingFile: (path) => set({ editingFile: path, view: path ? 'editor' : 'chat' }),
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  // Edit user message — update content, trim everything after, re-query
  editUserMessage: (messageId, newContent) => {
    const state = get()
    const conv = state.conversations.find(c => c.id === state.activeConversationId)
    if (!conv) return
    const msgIndex = conv.messages.findIndex(m => m.id === messageId)
    if (msgIndex < 0) return
    const msg = conv.messages[msgIndex]
    if (msg.role !== 'user') return

    const content = newContent || msg.content
    // Keep messages up to and including the edited one (with new content), trim the rest
    const trimmed = conv.messages.slice(0, msgIndex + 1)
    trimmed[msgIndex] = { ...msg, content }
    set({
      conversations: state.conversations.map(c =>
        c.id === conv.id ? { ...c, messages: trimmed } : c
      ),
    })

    // Re-send to AI
    const aios = (window as any).aios
    if (aios) {
      aios.addMessage(conv.id, 'user', content).catch(() => {})
      set({ isQuerying: true, queryingConvId: conv.id })
      aios.query({
        prompt: content,
        conversationId: conv.id,
        sessionId: conv.sessionId,
        apiKey: state.config.apiKey,
      }).catch(() => {})
    }
  },

  // Input injection
  pendingInput: null,
  setPendingInput: (v) => set({ pendingInput: v }),
}))
