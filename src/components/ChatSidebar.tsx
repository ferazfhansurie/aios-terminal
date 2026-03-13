import { useAppStore } from '../stores/app-store'

export default function ChatSidebar() {
  const { conversations, activeConversationId, setActiveConversation, createNewChat, deleteChat, view, setView, sidebarOpen } = useAppStore()

  if (!sidebarOpen) return null

  return (
    <div className="w-60 bg-[#0a0a0c] border-r border-white/[0.06] flex flex-col h-full">
      <div className="p-3 border-b border-white/[0.06]">
        <div className="text-sm font-semibold text-orange-500 mb-3">AIOS</div>
        <button
          onClick={() => { const id = createNewChat(); setActiveConversation(id); setView('chat') }}
          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-sm text-neutral-300 text-left transition-colors"
        >
          + New chat
        </button>
      </div>

      <div className="px-3 pt-3 flex gap-1">
        {(['chat', 'dashboard', 'settings'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
              view === v ? 'bg-white/[0.08] text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center rounded-lg px-2 py-1.5 cursor-pointer text-sm transition-colors ${
              conv.id === activeConversationId
                ? 'bg-white/[0.08] text-neutral-100'
                : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
            }`}
            onClick={() => { setActiveConversation(conv.id); setView('chat') }}
          >
            <span className="truncate flex-1">{conv.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteChat(conv.id) }}
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 ml-1 text-xs"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
