import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

export default function ChatInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isQuerying, activeConversationId, addUserMessage, setQuerying, createNewChat, config } = useAppStore()

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeConversationId])

  const handleSubmit = async () => {
    const text = input.trim()
    if (!text || isQuerying) return

    let convId = activeConversationId
    if (!convId) {
      convId = createNewChat()
      const aios = (window as any).aios
      if (aios) await aios.createConversation(convId, text.slice(0, 60))
    }

    addUserMessage(text)
    setInput('')
    setQuerying(true)

    const aios = (window as any).aios
    if (aios) {
      await aios.addMessage(convId, 'user', text)
      const conv = useAppStore.getState().conversations.find((c) => c.id === convId)
      await aios.query({
        prompt: text,
        conversationId: convId,
        sessionId: conv?.sessionId,
        apiKey: config.apiKey,
      })
    }
  }

  const handleStop = () => {
    const aios = (window as any).aios
    if (aios) aios.abort()
    setQuerying(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }, [input])

  return (
    <div className="border-t border-white/[0.06] bg-[#0c0c0e] p-4">
      <div className="max-w-3xl mx-auto relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message AIOS..."
          rows={1}
          className="w-full bg-[#141416] text-neutral-100 rounded-xl px-4 py-3 pr-24 resize-none border border-white/[0.06] focus:border-orange-500/50 focus:outline-none placeholder:text-neutral-500 text-sm"
          disabled={isQuerying}
        />
        <div className="absolute right-2 bottom-2 flex gap-2">
          {isQuerying ? (
            <button
              onClick={handleStop}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
