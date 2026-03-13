import { useEffect } from 'react'
import { useAppStore } from './stores/app-store'
import ChatSidebar from './components/ChatSidebar'
import ChatView from './components/ChatView'
import CreditMeter from './components/CreditMeter'
import Onboarding from './components/Onboarding'

export default function App() {
  const { config, view, loadConversations, loadCredits, sidebarOpen, setSidebarOpen } = useAppStore()

  useEffect(() => {
    loadConversations()
    loadCredits()
    const interval = setInterval(loadCredits, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        const id = useAppStore.getState().createNewChat()
        useAppStore.getState().setActiveConversation(id)
        useAppStore.getState().setView('chat')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // SDK message handler
  useEffect(() => {
    const aios = (window as any).aios
    if (!aios) return

    const unsubs = [
      aios.onSdkMessage((data: any) => {
        const store = useAppStore.getState()
        const { conversationId, message } = data

        if (message.type === 'assistant' && message.message?.content) {
          const textParts = message.message.content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('')
          if (textParts) {
            store.appendAssistantContent(conversationId, textParts)
          }

          const toolParts = message.message.content.filter((p: any) => p.type === 'tool_use')
          for (const tool of toolParts) {
            store.addToolCall(conversationId, {
              name: tool.name,
              input: tool.input,
              status: 'running',
            })
          }
        }

        if (message.type === 'tool_result') {
          store.updateToolCall(conversationId, message.tool_name, { status: 'done' })
        }
      }),

      aios.onSdkResult((data: any) => {
        const store = useAppStore.getState()
        const { conversationId, sessionId } = data
        store.setAssistantStreaming(conversationId, false)
        if (sessionId) {
          const convs = store.conversations.map((c) =>
            c.id === conversationId ? { ...c, sessionId } : c
          )
          useAppStore.setState({ conversations: convs })
        }
        store.loadCredits()
      }),

      aios.onSdkError((data: any) => {
        const store = useAppStore.getState()
        store.appendAssistantContent(data.conversationId, `**Error:** ${data.error}`)
        store.setAssistantStreaming(data.conversationId, false)
      }),

      aios.onSdkComplete((data: any) => {
        useAppStore.getState().setQuerying(false)
        useAppStore.getState().setAssistantStreaming(data.conversationId, false)
      }),
    ]

    return () => unsubs.forEach((fn) => fn())
  }, [])

  if (!config.apiKey) {
    return <Onboarding />
  }

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-neutral-100">
      <ChatSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-8 shrink-0 flex items-center px-3 app-drag-region">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-neutral-500 hover:text-neutral-300 text-sm no-drag"
          >
            ☰
          </button>
        </div>

        <div className="flex-1 min-h-0">
          {view === 'chat' && <ChatView />}
          {view === 'dashboard' && (
            <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
              Dashboard — coming in v0.2
            </div>
          )}
          {view === 'settings' && (
            <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
              Settings — coming soon
            </div>
          )}
        </div>

        <div className="h-7 shrink-0 border-t border-white/[0.04] bg-[#09090b] flex items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-700">AIOS v0.1.0</span>
            <span className="flex items-center gap-1 text-[11px] text-neutral-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
              Ready
            </span>
          </div>
          <CreditMeter />
        </div>
      </div>
    </div>
  )
}
