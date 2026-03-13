export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ToolCall }

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks?: ContentBlock[]
  toolCalls?: ToolCall[]
  thinking?: string
  isStreaming?: boolean
  tokens?: number
  createdAt: number
}

export interface ToolCall {
  id?: string
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
  _messagesLoaded?: boolean
}

export interface AppConfig {
  apiKey?: string
  tier: 'free' | 'pro'
  appearance: 'dark' | 'light'
  theme: {
    name: string
    primaryColor: string
    darkBg: string
    logo?: string
  }
  setupComplete?: boolean
}

export type AppView = 'chat' | 'schedules' | 'settings' | 'editor' | 'setup'

// ── Schedules ──

export type ScheduleType = 'once' | 'daily' | 'weekly' | 'interval'

export interface ScheduledTask {
  id: string
  name: string
  command: string
  type: ScheduleType
  time?: string
  dayOfWeek?: number
  date?: string
  intervalMinutes?: number
  enabled: boolean
  lastRun?: number
  lastStatus?: 'success' | 'error' | 'running'
  lastOutput?: string
  nextRun?: number | null
  runCount: number
  createdAt: number
  updatedAt: number
}

export interface ScheduleRun {
  id: number
  scheduleId: string
  status: 'success' | 'error'
  output?: string
  startedAt: number
  completedAt?: number
}

// ── Onboarding / Setup ──

export interface OnboardingData {
  name: string
  role: string
  businessName: string
  businessDescription: string
  market: string
  industry: string
  currency: string
  products: { name: string; price: string; description: string }[]
  team: { name: string; role: string }[]
  clients: { name: string; revenue: string; status: string }[]
  tools: string[]
}
