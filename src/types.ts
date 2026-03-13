export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  thinking?: string
  isStreaming?: boolean
  tokens?: number
  createdAt: number
}

export interface ToolCall {
  name: string
  input?: any
  output?: string
  status: 'running' | 'done' | 'error'
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  sessionId?: string
  createdAt: number
  updatedAt: number
}

export interface AppConfig {
  apiKey?: string
  tier: 'free' | 'pro'
  theme: {
    name: string
    primaryColor: string
    darkBg: string
    logo?: string
  }
}
