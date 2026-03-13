import { create } from 'zustand'
import type { Message, Conversation, ToolCall, AppConfig } from '../types'

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
  createNewChat: () => string
  deleteChat: (id: string) => Promise<void>

  // Messages
  addUserMessage: (content: string) => void
  appendAssistantContent: (convId: string, content: string) => void
  setAssistantStreaming: (convId: string, streaming: boolean) => void
  addToolCall: (convId: string, tool: ToolCall) => void
  updateToolCall: (convId: string, toolName: string, update: Partial<ToolCall>) => void
  setThinking: (convId: string, thinking: string) => void

  // Query state
  isQuerying: boolean
  setQuerying: (v: boolean) => void

  // Credits
  creditsUsed: number
  creditLimit: number
  loadCredits: () => Promise<void>

  // View
  view: 'chat' | 'dashboard' | 'settings'
  setView: (v: 'chat' | 'dashboard' | 'settings') => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Config
  config: {
    tier: 'free',
    theme: {
      name: 'AIOS',
      primaryColor: '#f97316',
      darkBg: '#0a0a0c',
    },
  },
  setConfig: (updates) => set((s) => ({ config: { ...s.config, ...updates } })),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),

  loadConversations: async () => {
    const aios = (window as any).aios
    if (!aios) return
    const convs = await aios.listConversations(50)
    const conversations = convs.map((c: any) => ({
      ...c,
      messages: [],
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }))
    set({ conversations })
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
              title: c.messages.length === 0 ? content.slice(0, 60) : c.title,
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
          msgs[msgs.length - 1] = { ...last, content: last.content + content }
        } else {
          msgs.push({
            id: generateId(),
            role: 'assistant',
            content,
            isStreaming: true,
            createdAt: Date.now(),
          })
        }
        return { ...c, messages: msgs, updatedAt: Date.now() }
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
          msgs[msgs.length - 1] = { ...last, toolCalls: tools }
        }
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  updateToolCall: (convId, toolName, update) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== convId) return c
        const msgs = c.messages.map((m) => {
          if (m.role !== 'assistant' || !m.toolCalls) return m
          const tools = m.toolCalls.map((t) =>
            t.name === toolName ? { ...t, ...update } : t
          )
          return { ...m, toolCalls: tools }
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
        }
        return { ...c, messages: msgs }
      })
      return { conversations: convs }
    })
  },

  // Query state
  isQuerying: false,
  setQuerying: (v) => set({ isQuerying: v }),

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
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))
