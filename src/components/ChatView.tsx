import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import logo from '../assets/logo.png'

export default function ChatView() {
  const { conversations, activeConversationId } = useAppStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  const conv = conversations.find((c) => c.id === activeConversationId)
  const messages = conv?.messages || []

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages.length, messages[messages.length - 1]?.content, scrollToBottom])

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

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-orange-500/5 border-2 border-dashed border-orange-500/30 rounded-2xl m-4 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="text-3xl mb-2">📎</div>
            <p className="text-sm font-medium text-orange-400">Drop files here</p>
            <p className="text-xs text-neutral-500 mt-1">Images, PDFs, videos, and more</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <img
                src={logo}
                alt="AIOS"
                className="w-16 h-16 mb-6 opacity-60 drop-shadow-[0_0_20px_rgba(249,115,22,0.15)]"
              />
              <h2 className="text-lg font-semibold text-neutral-200 mb-2 tracking-tight">
                What can I help you with?
              </h2>
              <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
                I can manage files, run commands, build dashboards, analyze data, and control your computer.
              </p>
              <div className="flex flex-wrap gap-2 mt-6 justify-center">
                {['Build me a dashboard', 'Check my files', 'Run a script', 'Analyze this data'].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      // Trigger input with suggestion
                      const input = document.querySelector('textarea') as HTMLTextAreaElement
                      if (input) {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                          window.HTMLTextAreaElement.prototype, 'value'
                        )?.set
                        nativeInputValueSetter?.call(input, s)
                        input.dispatchEvent(new Event('input', { bubbles: true }))
                        input.focus()
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-neutral-400 hover:text-neutral-200 transition-all border border-white/[0.04] hover:border-white/[0.08]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
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
