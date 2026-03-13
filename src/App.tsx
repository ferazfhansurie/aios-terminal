import { useEffect } from 'react'
import { useAppStore } from './stores/app-store'
import ChatSidebar from './components/ChatSidebar'
import ChatView from './components/ChatView'
import CreditMeter from './components/CreditMeter'

export default function App() {
  const { view, loadConversations, loadCredits, sidebarOpen, setSidebarOpen } = useAppStore()

  useEffect(() => {
    loadConversations()
    loadCredits()
    const interval = setInterval(loadCredits, 30_000)
    return () => clearInterval(interval)
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
        }

        if (message.type === 'assistant' && message.message?.content) {
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

        <div className="h-7 shrink-0 border-t border-white/[0.06] bg-[#0a0a0c] flex items-center justify-between px-3">
          <span className="text-xs text-neutral-600">AIOS v0.1.0</span>
          <CreditMeter />
        </div>
      </div>
    </div>
  )
}
