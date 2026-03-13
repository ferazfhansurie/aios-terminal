import { useState } from 'react'
import { useAppStore } from '../stores/app-store'
import logo from '../assets/logo.png'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' })
}

export default function ChatSidebar() {
  const {
    conversations, activeConversationId, setActiveConversation,
    createNewChat, deleteChat, view, setView, sidebarOpen,
  } = useAppStore()
  const [search, setSearch] = useState('')

  if (!sidebarOpen) return null

  const filtered = search
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <div className="w-64 bg-[#09090b] border-r border-white/[0.06] flex flex-col h-full select-none">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2.5 mb-4">
          <img src={logo} alt="AIOS" className="w-7 h-7" />
          <span className="text-sm font-bold text-neutral-100 tracking-tight">AIOS</span>
        </div>
        <button
          onClick={() => {
            const id = createNewChat()
            setActiveConversation(id)
            setView('chat')
          }}
          className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-sm text-neutral-300 text-left transition-all border border-white/[0.04] hover:border-white/[0.08] active:scale-[0.98]"
        >
          <span className="text-neutral-500 mr-1.5">+</span> New chat
        </button>
      </div>

      {/* Search */}
      {conversations.length > 5 && (
        <div className="px-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full bg-white/[0.03] text-neutral-300 rounded-lg px-3 py-1.5 text-xs border border-white/[0.04] focus:border-orange-500/30 focus:outline-none placeholder:text-neutral-600"
          />
        </div>
      )}

      {/* Nav tabs */}
      <div className="px-3 pb-2 flex gap-0.5 bg-white/[0.02] mx-3 rounded-lg p-0.5">
        {(['chat', 'dashboard', 'settings'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium capitalize transition-all ${
              view === v
                ? 'bg-white/[0.08] text-neutral-100 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-px">
        {filtered.length === 0 && (
          <p className="text-xs text-neutral-600 text-center py-8">
            {search ? 'No matching chats' : 'No conversations yet'}
          </p>
        )}
        {filtered.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-all ${
              conv.id === activeConversationId
                ? 'bg-white/[0.08] text-neutral-100'
                : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
            }`}
            onClick={() => { setActiveConversation(conv.id); setView('chat') }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{conv.title}</div>
              <div className="text-[10px] text-neutral-600">{timeAgo(conv.updatedAt)}</div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm('Delete this chat?')) deleteChat(conv.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all text-xs shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
