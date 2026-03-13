import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import logo from '../assets/logo.png'

const FALLBACK_PRIME = `Read the CLAUDE.md and any context files in this workspace. Then briefly greet the user and summarize what this workspace is about and what you can help with. Be concise — 2-3 sentences max.`

const STATUS_CONNECTING = [
  'Connecting...',
  'Reaching out...',
  'Initiating...',
  'Waking up...',
  'Warming up...',
  'Starting up...',
]

const STATUS_THINKING = [
  'Thinking...',
  'Pondering...',
  'Reasoning...',
  'Analyzing...',
  'Processing...',
  'Contemplating...',
  'Working it out...',
  'Figuring it out...',
]

function pickRandom(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export default function ChatView() {
  const { conversations, activeConversationId, isQuerying, setQuerying, addUserMessage, config } = useAppStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const primedRef = useRef<Set<string>>(new Set())
  const [statusText, setStatusText] = useState('')
  const statusPhaseRef = useRef<'idle' | 'connecting' | 'thinking'>('idle')

  const conv = conversations.find((c) => c.id === activeConversationId)
  const messages = conv?.messages || []

  // Rotate status text while querying
  useEffect(() => {
    if (!isQuerying) {
      statusPhaseRef.current = 'idle'
      setStatusText('')
      return
    }
    // Set initial status
    statusPhaseRef.current = 'connecting'
    setStatusText(pickRandom(STATUS_CONNECTING))

    const interval = setInterval(() => {
      const arr = statusPhaseRef.current === 'thinking' ? STATUS_THINKING : STATUS_CONNECTING
      setStatusText(pickRandom(arr))
    }, 3000)

    return () => clearInterval(interval)
  }, [isQuerying])

  // Switch to thinking phase when thinking content arrives
  useEffect(() => {
    if (!isQuerying) return
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && last.thinking && !last.content) {
      if (statusPhaseRef.current !== 'thinking') {
        statusPhaseRef.current = 'thinking'
        setStatusText(pickRandom(STATUS_THINKING))
      }
    }
  }, [isQuerying, messages])

  // Auto-prime: when a new empty conversation is active, send /prime as a visible message
  useEffect(() => {
    if (!activeConversationId || messages.length > 0 || isQuerying) return
    if (conv?.sessionId) return
    if (primedRef.current.has(activeConversationId)) return
    primedRef.current.add(activeConversationId)

    const convId = activeConversationId
    const autoPrime = async () => {
      const aios = (window as any).aios
      if (!aios) return

      await aios.createConversation(convId, 'New chat')

      let prompt = FALLBACK_PRIME
      try {
        const dir = await aios.getClaudeDir()
        if (dir?.commands?.some((c: any) => c.name === 'prime')) {
          prompt = '/prime'
        }
      } catch {}

      // Show as a visible user message so there's immediate feedback
      addUserMessage(prompt)
      setQuerying(true, convId)
      await aios.addMessage(convId, 'user', prompt)
      // Fire-and-forget — runs in main process background
      aios.query({
        prompt,
        conversationId: convId,
        apiKey: config.apiKey,
      }).catch(() => {})
    }

    autoPrime()
  }, [activeConversationId, messages.length, isQuerying, setQuerying, config.apiKey])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Auto-scroll only when user sends a new message (not during AI response)
  const prevMsgCountRef = useRef(messages.length)
  useEffect(() => {
    const prevCount = prevMsgCountRef.current
    prevMsgCountRef.current = messages.length
    // Only scroll when a new message is added (user sent), not on content updates
    if (messages.length > prevCount) {
      const newMsg = messages[messages.length - 1]
      if (newMsg?.role === 'user') {
        scrollToBottom()
      }
    }
  }, [messages.length, scrollToBottom])

  // Show/hide scroll button
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(distFromBottom > 200)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setDroppedFiles((prev) => [...prev, ...files])
    }
  }, [])

  const removeFile = (index: number) => {
    setDroppedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // No active conversation — show landing screen without input
  if (!conv) {
    return (
      <div className="flex flex-col h-full relative">
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <img src={logo} alt="AIOS" className="w-20 h-20 mb-6 opacity-60 accent-glow" />
          <h2 className="text-lg font-semibold text-neutral-300 mb-2">Welcome to AIOS</h2>
          <p className="text-sm text-neutral-500 mb-6 max-w-xs">Start a new chat or select a previous session from the sidebar.</p>
          <button
            onClick={() => {
              const id = useAppStore.getState().createNewChat()
              useAppStore.getState().setActiveConversation(id)
            }}
            className="px-5 py-2.5 rounded-xl accent-bg text-white font-medium text-sm hover:brightness-110 transition-all active:scale-[0.98] accent-shadow"
          >
            + New chat
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 accent-bg-10 border-2 border-dashed accent-border-30 rounded-2xl m-4 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="text-3xl mb-2">📎</div>
            <p className="text-sm font-medium accent-text">Drop files here</p>
            <p className="text-xs text-neutral-500 mt-1">Images, PDFs, videos, and more</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 py-4 md:px-4 md:py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <img
                src={logo}
                alt="AIOS"
                className="w-16 h-16 mb-6 opacity-60 accent-glow"
              />
              {isQuerying ? (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 accent-text animate-spin" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm accent-text font-medium">{statusText || 'Connecting...'}</span>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Start a new conversation</p>
              )}
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Thinking indicator — shown when querying and no streaming content yet */}
          {isQuerying && messages.length > 0 && (
            (() => {
              const last = messages[messages.length - 1]
              const isWaiting = last?.role === 'user' || (last?.role === 'assistant' && !last.content && !last.isStreaming)
              const hasThinkingOnly = last?.role === 'assistant' && last.thinking && !last.content
              if (!isWaiting && !hasThinkingOnly) return null
              return (
                <div className="mb-5 flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    <img src={logo} alt="AIOS" className="w-7 h-7 rounded-lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Status line */}
                    <div className="flex items-center gap-2 py-1.5">
                      <svg className="w-4 h-4 accent-text animate-spin" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
                      </svg>
                      <span className="text-sm font-medium accent-text">
                        {statusText || 'Connecting...'}
                      </span>
                    </div>
                    {/* Thinking preview */}
                    {last?.thinking && (
                      <div className="mt-1.5 text-xs text-neutral-500 bg-white/[0.02] rounded-xl p-3 font-mono whitespace-pre-wrap leading-relaxed border border-white/[0.04] max-h-48 overflow-y-auto">
                        {last.thinking.length > 500 ? '...' + last.thinking.slice(-500) : last.thinking}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[#1a1a1e] border border-white/[0.08] text-xs text-neutral-400 hover:text-neutral-200 shadow-xl transition-all hover:bg-[#222226]"
        >
          ↓ Scroll to bottom
        </button>
      )}

      {/* Input */}
      <ChatInput droppedFiles={droppedFiles} onRemoveFile={removeFile} onClearFiles={() => setDroppedFiles([])} />
    </div>
  )
}
