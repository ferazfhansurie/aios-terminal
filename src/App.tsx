import { useEffect, useState } from 'react'
import { useAppStore } from './stores/app-store'
import ChatSidebar from './components/ChatSidebar'
import ChatView from './components/ChatView'
import FileEditor from './components/FileEditor'
import SettingsView from './components/SettingsView'
import ScheduleView from './components/ScheduleView'
import CreditMeter from './components/CreditMeter'
import Onboarding from './components/Onboarding'
import SetupWizard from './components/SetupWizard'
import SkillsModal from './components/SkillsModal'

function AppContent() {
  const { config, view, loadConversations, loadCredits, sidebarOpen, setSidebarOpen, isQuerying, messageQueue } = useAppStore()
  const [showSkills, setShowSkills] = useState(false)

  useEffect(() => {
    loadConversations()
    loadCredits()
    const interval = setInterval(loadCredits, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Apply theme CSS variables + appearance mode
  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', config.theme.primaryColor)
    document.documentElement.style.setProperty('--accent', config.theme.primaryColor)
    document.documentElement.style.setProperty('--dark-bg', config.theme.darkBg)
    document.documentElement.classList.toggle('light', config.appearance === 'light')
    document.documentElement.classList.toggle('dark', config.appearance !== 'light')
  }, [config.theme, config.appearance])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + N: New chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        const id = useAppStore.getState().createNewChat()
        useAppStore.getState().setActiveConversation(id)
        useAppStore.getState().setView('chat')
      }
      // Cmd/Ctrl + B: Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen(!sidebarOpen)
      }
      // Cmd/Ctrl + ,: Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        useAppStore.getState().setView('settings')
      }
      // Cmd/Ctrl + K: Skills modal
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSkills((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen, setSidebarOpen])

  // SDK message handler
  useEffect(() => {
    const aios = (window as any).aios
    if (!aios) return

    const unsubs = [
      aios.onSdkMessage((data: any) => {
        const store = useAppStore.getState()
        const { conversationId, message } = data

        if (message.type === 'assistant' && message.message?.content) {
          const content = message.message.content

          // Extract thinking blocks
          const thinkingParts = content
            .filter((p: any) => p.type === 'thinking')
            .map((p: any) => p.thinking)
            .join('')
          if (thinkingParts) {
            store.setThinking(conversationId, thinkingParts)
          }

          // Extract text
          const textParts = content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('')
          if (textParts) {
            store.appendAssistantContent(conversationId, textParts)
          }

          // Extract tool use
          const toolParts = content.filter((p: any) => p.type === 'tool_use')
          for (const tool of toolParts) {
            store.addToolCall(conversationId, {
              id: tool.id,
              name: tool.name,
              input: tool.input,
              status: 'running',
            })
          }
        }

        // Tool results — capture output content
        if (message.type === 'tool_result') {
          let output = ''
          if (message.content) {
            if (typeof message.content === 'string') {
              output = message.content
            } else if (Array.isArray(message.content)) {
              output = message.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('\n')
            }
          }
          store.updateToolCall(conversationId, message.tool_use_id || message.tool_name, {
            status: 'done',
            output: output || undefined,
          })
        }
      }),

      aios.onSdkResult((data: any) => {
        const store = useAppStore.getState()
        const { conversationId, sessionId } = data
        store.setAssistantStreaming(conversationId, false)

        // Save session_id to DB for resume + persist assistant message
        if (sessionId) {
          const convs = store.conversations.map((c) =>
            c.id === conversationId ? { ...c, sessionId } : c
          )
          useAppStore.setState({ conversations: convs })
          aios.updateConversation(conversationId, { session_id: sessionId })
        }

        // Save assistant response to DB
        const conv = store.conversations.find((c) => c.id === conversationId)
        if (conv) {
          const lastMsg = conv.messages[conv.messages.length - 1]
          if (lastMsg?.role === 'assistant') {
            const toolJson = lastMsg.toolCalls ? JSON.stringify(lastMsg.toolCalls) : undefined
            aios.addMessage(conversationId, 'assistant', lastMsg.content, 0, toolJson)
          }
          // Update conversation title in DB
          if (conv.title !== 'New chat') {
            aios.updateConversation(conversationId, { title: conv.title })
          }
        }

        store.loadCredits()
      }),

      aios.onSdkError((data: any) => {
        const store = useAppStore.getState()
        store.appendAssistantContent(data.conversationId, `**Error:** ${data.error}`)
        store.setAssistantStreaming(data.conversationId, false)
        store.setQuerying(false)
      }),

      aios.onSdkComplete((data: any) => {
        const store = useAppStore.getState()
        store.setQuerying(false)
        store.setAssistantStreaming(data.conversationId, false)

        // Process message queue — send next queued message
        const next = store.dequeueMessage()
        if (next) {
          // Use fresh state after mutations above (sessionId may have been set by onSdkResult)
          const freshState = useAppStore.getState()
          const conv = freshState.conversations.find((c) => c.id === next.convId)
          freshState.setQuerying(true, next.convId)
          aios.query({
            prompt: next.prompt,
            conversationId: next.convId,
            sessionId: conv?.sessionId,
            apiKey: freshState.config.apiKey,
          }).catch(() => {})
        }
      }),
    ]

    return () => unsubs.forEach((fn) => fn())
  }, [])

  // Scheduled task execution — listens for commands from the scheduler
  useEffect(() => {
    const aios = (window as any).aios
    if (!aios?.onScheduleExecute) return

    const unsub = aios.onScheduleExecute((data: { command: string }) => {
      const store = useAppStore.getState()
      // Create a new conversation for the scheduled task (also sets it active)
      const convId = store.createNewChat()
      const title = `[Scheduled] ${data.command.slice(0, 40)}`

      // Update title
      useAppStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, title } : c
        ),
      }))
      aios.createConversation(convId, title)

      // Add user message (uses activeConversationId which createNewChat just set)
      store.addUserMessage(data.command)
      aios.addMessage(convId, 'user', data.command)

      // Run the query — assistant message will be created by appendAssistantContent
      store.setQuerying(true, convId)
      aios.query({
        prompt: data.command,
        conversationId: convId,
        apiKey: store.config.apiKey,
      }).catch(() => {})
    })

    return unsub
  }, [])

  // Show setup wizard only on first register or new instance (not on login)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  useEffect(() => {
    if (!config.apiKey) return
    // Only show wizard if user just registered
    if ((config as any).justRegistered) {
      const aios = (window as any).aios
      if (!aios?.getSetupStatus) { setNeedsSetup(false); return }
      aios.getSetupStatus().then((res: any) => setNeedsSetup(res?.needsSetup ?? false)).catch(() => setNeedsSetup(false))
    } else {
      setNeedsSetup(false)
    }
  }, [config.apiKey])

  if (!config.apiKey) {
    return <Onboarding />
  }

  // Show setup wizard for new registrations / new instances
  if (needsSetup && view !== 'settings') {
    return (
      <SetupWizard onComplete={() => {
        setNeedsSetup(false)
        // Clear justRegistered flag
        const { justRegistered, ...rest } = config as any
        useAppStore.getState().setConfig(rest)
        useAppStore.getState().setView('chat')
      }} />
    )
  }

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-neutral-100 overflow-hidden">
      {/* Sidebar — overlay on mobile, inline on desktop */}
      <div className={`
        md:relative md:flex md:shrink-0
        ${sidebarOpen ? 'fixed inset-0 z-40 flex' : 'hidden md:flex'}
      `}>
        {/* Backdrop on mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 md:hidden z-30" onClick={() => setSidebarOpen(false)} />
        )}
        <div className="relative z-40">
          <ChatSidebar />
        </div>
      </div>

      <SkillsModal
        open={showSkills}
        onClose={() => setShowSkills(false)}
        onInsert={(text) => {
          useAppStore.getState().setPendingInput(text)
          useAppStore.getState().setView('chat')
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — mobile: hamburger + title, desktop: sidebar toggle */}
        <div className="h-10 md:h-8 shrink-0 flex items-center px-3 gap-2 app-drag-region border-b border-white/[0.04] md:border-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-neutral-500 hover:text-neutral-300 no-drag transition-colors p-1"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="md:hidden">
              <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="hidden md:inline text-sm">{sidebarOpen ? '←' : '→'}</span>
          </button>
          <span className="text-xs text-neutral-500 font-medium md:hidden truncate">AIOS</span>
          {isQuerying && (
            <span className="ml-auto flex items-center gap-1 text-[11px] accent-text md:hidden">
              <span className="w-1.5 h-1.5 rounded-full accent-bg animate-pulse" />
              Working
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0">
          {view === 'chat' && <ChatView />}
          {view === 'editor' && <FileEditor />}
          {view === 'schedules' && <ScheduleView />}
          {view === 'settings' && <SettingsView />}
        </div>

        {/* Status bar — hidden on mobile to save space */}
        <div className="hidden md:flex h-7 shrink-0 border-t border-white/[0.04] bg-[#09090b] items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-700">AIOS v0.4.0</span>
            <span className="flex items-center gap-1 text-[11px] text-neutral-600">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: config.theme.primaryColor }}
              />
              {config.theme.name}
            </span>
            {isQuerying ? (
              <span className="flex items-center gap-1 text-[11px] accent-text">
                <span className="w-1.5 h-1.5 rounded-full accent-bg animate-pulse" />
                Working{messageQueue.length > 0 ? ` · ${messageQueue.length} queued` : ''}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-neutral-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
                Ready
              </span>
            )}
          </div>
          <CreditMeter />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const setConfig = useAppStore((s) => s.setConfig)

  // Listen for logout signal from web-bridge (401 expired token)
  useEffect(() => {
    const handler = () => {
      // Clear apiKey so the app shows Onboarding — no page reload needed
      setConfig({ apiKey: undefined } as any)
    }
    window.addEventListener('aios:logout', handler)
    return () => window.removeEventListener('aios:logout', handler)
  }, [setConfig])

  return <AppContent />
}
