import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

export default function ChatView() {
  const { conversations, activeConversationId } = useAppStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conv = conversations.find((c) => c.id === activeConversationId)
  const messages = conv?.messages || []

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h2 className="text-lg font-medium text-neutral-200 mb-2">AIOS</h2>
              <p className="text-sm text-neutral-500 max-w-md">
                AI that controls your computer. Ask me to manage files, run commands, build dashboards, or anything else.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <ChatInput />
    </div>
  )
}
