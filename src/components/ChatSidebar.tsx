import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import logo from '../assets/logo.png'

interface ClaudeDir {
  commands: { name: string; filename: string }[]
  skills: { name: string; dirname: string; isDir: boolean }[]
  context: { name: string; filename: string }[]
  memory: { name: string; filename: string }[]
  outputs: { name: string; filename: string }[]
  settings: Record<string, any> | null
}

interface Instance {
  id: string
  name: string
  path: string
}

interface Session {
  id: string
  title: string
  messageCount: number
  timestamp: number
}

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

function Section({ label, count, children, defaultOpen = false }: {
  label: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-[10px] text-neutral-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-[11px] text-neutral-600 tabular-nums">{count}</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

function FileItem({ name, icon, onClick }: { name: string; icon: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-5 py-1.5 text-left text-xs text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04] transition-colors truncate"
    >
      <span className="text-[10px] opacity-60">{icon}</span>
      <span className="truncate">{name}</span>
    </button>
  )
}

// Convert raw session messages from JSONL parser to our Message format
function convertSessionMessages(rawMessages: any[], convId: string, timestamp: number) {
  return rawMessages.map((m: any, i: number) => {
    const blocks: any[] = []
    if (m.content) blocks.push({ type: 'text', text: m.content })
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        blocks.push({ type: 'tool', tool: tc })
      }
    }
    return {
      id: `${convId}-${i}`,
      role: m.role,
      content: m.content || '',
      blocks: m.role === 'assistant' ? blocks : undefined,
      toolCalls: m.toolCalls,
      thinking: m.thinking,
      createdAt: timestamp - (rawMessages.length - i) * 1000,
    }
  })
}

export default function ChatSidebar() {
  const {
    conversations, activeConversationId, setActiveConversation,
    createNewChat, importSession, view, setView, sidebarOpen, setSidebarOpen,
    queryingConvId,
  } = useAppStore()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'chats' | 'workspace'>('chats')
  const [claudeDir, setClaudeDir] = useState<ClaudeDir | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [activeInstance, setActiveInstance] = useState<Instance | null>(null)
  const [showInstances, setShowInstances] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loadingSession, setLoadingSession] = useState<string | null>(null)
  const [creatingInstance, setCreatingInstance] = useState(false)
  const [newInstanceName, setNewInstanceName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: Session } | null>(null)
  const [renamingSession, setRenamingSession] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showFolderBrowser, setShowFolderBrowser] = useState(false)
  const [browseDir, setBrowseDir] = useState('')
  const [browseDirs, setBrowseDirs] = useState<string[]>([])
  const [browseParent, setBrowseParent] = useState('')
  const [browseHasClaude, setBrowseHasClaude] = useState(false)
  const [browseLoading, setBrowseLoading] = useState(false)
  const instanceRef = useRef<HTMLDivElement>(null)
  const newInstanceInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Load workspace data + instances + sessions
  useEffect(() => {
    const load = async () => {
      const aios = (window as any).aios
      if (!aios) return
      try {
        const dir = await aios.getClaudeDir()
        setClaudeDir(dir)
        const list = await aios.listInstances()
        setInstances(list || [])
        const active = await aios.getActiveInstance()
        setActiveInstance(active)
        if (aios.listSessions) {
          const sess = await aios.listSessions()
          setSessions(sess || [])
        }
      } catch {}
    }
    load()

    const aios = (window as any).aios
    const unsubs: (() => void)[] = []
    if (aios?.onFilesChanged) unsubs.push(aios.onFilesChanged(load))
    if (aios?.onInstanceSwitched) unsubs.push(aios.onInstanceSwitched((inst: Instance) => {
      setActiveInstance(inst)
      load()
    }))

    // Real-time session sync — watch JSONL file changes
    if (aios?.onSessionsChanged) {
      unsubs.push(aios.onSessionsChanged((data: { sessionIds: string[]; sessions: Session[] }) => {
        // Update session list in sidebar
        setSessions(data.sessions)

        // If the active conversation is linked to a changed session, live-reload its messages
        const store = useAppStore.getState()
        const activeConv = store.conversations.find((c) => c.id === store.activeConversationId)
        if (activeConv?.sessionId && data.sessionIds.includes(activeConv.sessionId)) {
          aios.getSessionMessages(activeConv.sessionId).then((rawMessages: any[]) => {
            const convId = activeConv.id
            const messages = convertSessionMessages(rawMessages, convId, Date.now())
            useAppStore.setState((s) => ({
              conversations: s.conversations.map((c) =>
                c.id === convId ? { ...c, messages, _messagesLoaded: true } : c
              ),
            }))
          }).catch(() => {})
        }
      }))
    }

    return () => unsubs.forEach((fn) => fn())
  }, [])

  // Close instance dropdown on outside click
  useEffect(() => {
    if (!showInstances) return
    const handleClick = (e: MouseEvent) => {
      if (instanceRef.current && !instanceRef.current.contains(e.target as Node)) {
        setShowInstances(false)
        setCreatingInstance(false)
        setNewInstanceName('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showInstances])

  const handleSwitchInstance = async (id: string) => {
    const aios = (window as any).aios
    if (aios) await aios.switchInstance(id)
    setShowInstances(false)
  }

  const handleDeleteInstance = async (id: string) => {
    const aios = (window as any).aios
    if (!aios?.deleteInstance) return
    try {
      await aios.deleteInstance(id)
      const list = await aios.listInstances()
      setInstances(list || [])
      const active = await aios.getActiveInstance()
      setActiveInstance(active)
    } catch (err) {
      console.error('[AIOS] Failed to delete instance:', err)
    }
  }

  // Listen for folder browser event from web bridge
  useEffect(() => {
    const handler = () => {
      setShowInstances(false)
      setShowFolderBrowser(true)
      loadBrowseDir('')
    }
    window.addEventListener('aios:show-folder-browser', handler)
    return () => window.removeEventListener('aios:show-folder-browser', handler)
  }, [])

  const loadBrowseDir = async (dirPath: string) => {
    const aios = (window as any).aios
    if (!aios?.browseDir) return
    setBrowseLoading(true)
    try {
      const data = await aios.browseDir(dirPath || undefined)
      setBrowseDir(data.path)
      setBrowseDirs(data.entries || [])
      setBrowseParent(data.parent || '')
      setBrowseHasClaude(data.hasClaude || false)
    } catch {
      setBrowseDirs([])
    }
    setBrowseLoading(false)
  }

  const handleSelectFolder = async () => {
    const aios = (window as any).aios
    if (!aios || !browseDir) return
    setShowFolderBrowser(false)
    await aios.addFolder(browseDir)
    const list = await aios.listInstances()
    setInstances(list || [])
    const active = await aios.getActiveInstance()
    setActiveInstance(active)
  }

  const handleAddFolder = async () => {
    const aios = (window as any).aios
    if (!aios) return
    await aios.addFolder()
    setShowInstances(false)
  }

  const handleCreateInstance = async () => {
    const name = newInstanceName.trim()
    if (!name) return
    const aios = (window as any).aios
    if (!aios) return
    try {
      const instance = await aios.createInstance(name)
      if (instance) {
        const list = await aios.listInstances()
        setInstances(list || [])
        setActiveInstance(instance)
        // Trigger setup wizard for new instance
        useAppStore.getState().setConfig({ justRegistered: true } as any)
        window.location.reload()
      }
    } catch (err) {
      console.error('[AIOS] Failed to create instance:', err)
    }
    setNewInstanceName('')
    setCreatingInstance(false)
    setShowInstances(false)
  }

  const setEditingFile = useAppStore((s) => s.setEditingFile)
  const deleteChat = useAppStore((s) => s.deleteChat)

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingSession) renameInputRef.current?.focus()
  }, [renamingSession])

  const handleRenameSession = async (sessionId: string) => {
    const title = renameValue.trim()
    if (!title) { setRenamingSession(null); return }
    const aios = (window as any).aios
    if (aios?.renameSession) {
      const updated = await aios.renameSession(sessionId, title)
      setSessions(updated || [])
    }
    setRenamingSession(null)
    setRenameValue('')
  }

  const handleDeleteSession = async (sessionId: string) => {
    const aios = (window as any).aios
    if (aios?.deleteSession) {
      const updated = await aios.deleteSession(sessionId)
      setSessions(updated || [])
    }
    // Also remove the loaded conversation if any
    const loadedConv = conversations.find((c) => c.sessionId === sessionId)
    if (loadedConv) deleteChat(loadedConv.id)
    setContextMenu(null)
  }

  // Close sidebar on mobile after selecting something
  const closeMobile = () => {
    if (window.innerWidth < 768) setSidebarOpen(false)
  }

  // Open a Claude Code session — load its messages into a conversation
  const handleOpenSession = async (session: Session) => {
    console.log('[AIOS] handleOpenSession:', session.id.slice(0, 8), session.title)
    // Check if we already have a conversation for this session
    const existing = conversations.find((c) => c.sessionId === session.id)
    console.log('[AIOS] existing conv for session:', existing ? { id: existing.id, msgs: existing.messages.length, loaded: existing._messagesLoaded } : 'none')
    if (existing) {
      setActiveConversation(existing.id)
      setView('chat')
      closeMobile()
      return
    }

    setLoadingSession(session.id)
    const aios = (window as any).aios

    try {
      // Load messages from JSONL
      const rawMessages = aios?.getSessionMessages
        ? await aios.getSessionMessages(session.id)
        : []

      // Use the store action to create the conversation
      const tempId = `temp-${Date.now()}`
      const messages = convertSessionMessages(rawMessages, tempId, session.timestamp)
      const convId = importSession(session.id, session.title, messages)

      // Persist to DB (fire and forget)
      if (aios) {
        aios.createConversation(convId, session.title).catch(() => {})
        aios.updateConversation(convId, { session_id: session.id, title: session.title }).catch(() => {})
      }
      closeMobile()
    } catch (err) {
      console.error('[AIOS] Failed to open session:', err)
    } finally {
      setLoadingSession(null)
    }
  }

  // Open .md/.json files inline, others externally
  const handleOpenFile = async (filename: string) => {
    if (filename.endsWith('.md') || filename.endsWith('.json')) {
      setEditingFile(filename)
    } else {
      const aios = (window as any).aios
      if (aios?.openPath) await aios.openPath(filename)
    }
  }

  // Collapsed sidebar - show minimal toggle (desktop only, mobile uses hamburger)
  if (!sidebarOpen) {
    return (
      <div className="hidden md:flex w-12 bg-[#09090b] border-r border-white/[0.06] flex-col h-full select-none">
        <div className="h-10 shrink-0 app-drag-region" />
        <div className="px-2 pt-1">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 rounded-lg opacity-60 hover:opacity-100 transition-opacity no-drag"
            title="Open sidebar"
          >
            <img src={logo} alt="AIOS" className="w-full h-full" />
          </button>
        </div>
      </div>
    )
  }

  // Filter sessions by search
  const filteredSessions = search
    ? sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sessions

  // Group sessions by date
  const groupedSessions = filteredSessions.reduce<{ label: string; sessions: Session[] }[]>((groups, session) => {
    const now = new Date()
    const date = new Date(session.timestamp)
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    let label: string
    if (diffDays === 0 && now.getDate() === date.getDate()) label = 'Today'
    else if (diffDays <= 1 && now.getDate() - date.getDate() === 1) label = 'Yesterday'
    else if (diffDays < 7) label = 'This week'
    else if (diffDays < 30) label = 'This month'
    else label = date.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

    const last = groups[groups.length - 1]
    if (last?.label === label) last.sessions.push(session)
    else groups.push({ label, sessions: [session] })
    return groups
  }, [])

  // Active conversations (currently in-progress, not from sessions)
  const activeConvs = conversations.filter((c) => {
    // Show conversations that have an active streaming message or are the current one
    return c.id === activeConversationId
  })

  return (
    <div className="w-72 md:w-64 bg-[#09090b] border-r border-white/[0.06] flex flex-col h-full select-none">
      {/* macOS traffic light spacer */}
      <div className="h-10 shrink-0 app-drag-region" />

      {/* Header */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2.5 mb-3">
          <img src={logo} alt="AIOS" className="w-7 h-7 accent-glow" />
          <span className="text-sm font-bold accent-text tracking-tight">AIOS</span>
        </div>

        {/* Instance selector */}
        <div className="relative mb-3" ref={instanceRef}>
          <button
            onClick={() => setShowInstances(!showInstances)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-green-500/80 shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <span className="text-xs text-neutral-300 truncate block">
                {activeInstance?.name || 'AIOS'}
              </span>
              {activeInstance?.path && (
                <span className="text-[10px] text-neutral-600 truncate block leading-tight">
                  {activeInstance.path.split('/').slice(-2).join('/')}
                </span>
              )}
            </div>
            <span className={`text-[10px] text-neutral-600 transition-transform shrink-0 ${showInstances ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showInstances && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#18181b] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
              {instances.map((inst) => (
                <div
                  key={inst.id}
                  className={`group/inst flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors cursor-pointer ${
                    inst.id === activeInstance?.id
                      ? 'accent-bg-10 accent-text'
                      : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
                  }`}
                  onClick={() => handleSwitchInstance(inst.id)}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inst.id === activeInstance?.id ? 'bg-green-500' : 'bg-neutral-600'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{inst.name}</span>
                    {inst.path && (
                      <span className="text-[10px] text-neutral-600 truncate block leading-tight">
                        {inst.path.split('/').slice(-2).join('/')}
                      </span>
                    )}
                  </div>
                  {instances.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteInstance(inst.id)
                      }}
                      className="opacity-0 group-hover/inst:opacity-100 p-1 rounded-md text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                      title="Remove instance"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              ))}
              <div className="border-t border-white/[0.06]">
                <button
                  onClick={() => { setShowInstances(false); setCreatingInstance(true) }}
                  className="w-full px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04] text-left transition-colors flex items-center gap-1.5"
                >
                  <span className="accent-text">+</span> Create new instance
                </button>
                <button
                  onClick={handleAddFolder}
                  className="w-full px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04] text-left transition-colors flex items-center gap-1.5"
                >
                  <span className="text-neutral-600">⌕</span> Add existing folder...
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            const id = createNewChat()
            setActiveConversation(id)
            setView('chat')
            setTab('chats')
            closeMobile()
          }}
          className="w-full px-3 py-2.5 rounded-xl accent-bg hover:brightness-110 text-sm text-white font-medium text-left transition-all active:scale-[0.98] accent-shadow"
        >
          <span className="opacity-70 mr-1.5">+</span> New chat
        </button>
      </div>

      {/* Tab toggle */}
      <div className="px-3 pb-2 flex gap-0.5 bg-white/[0.02] mx-3 rounded-lg p-0.5">
        {(['chats', 'workspace'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium capitalize transition-all ${
              tab === t
                ? 'accent-bg-15 accent-text shadow-sm'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'chats' && (
          <>
            {(sessions.length > 5 || conversations.length > 5) && (
              <div className="px-3 py-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sessions..."
                  className="w-full bg-white/[0.03] text-neutral-300 rounded-lg px-3 py-1.5 text-xs border border-white/[0.04] accent-ring focus:outline-none placeholder:text-neutral-600"
                />
              </div>
            )}

            <div className="px-2 py-1">
              {filteredSessions.length === 0 && activeConvs.length === 0 && (
                <p className="text-xs text-neutral-600 text-center py-8">
                  {search ? 'No matching sessions' : 'No sessions yet — start a new chat'}
                </p>
              )}

              {/* Session list — grouped by date */}
              {groupedSessions.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pt-3 pb-1">
                    <span className="text-[10px] font-medium text-neutral-600 uppercase tracking-wider">{group.label}</span>
                  </div>
                  <div className="space-y-px">
                    {group.sessions.map((session) => {
                      const loadedConv = conversations.find((c) => c.sessionId === session.id)
                      const isActive = loadedConv?.id === activeConversationId
                      const isRunning = loadedConv?.id === queryingConvId

                      return (
                        <div
                          key={session.id}
                          className={`group flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-all ${
                            isActive
                              ? 'accent-bg-10 accent-border-30 border text-neutral-100'
                              : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200 border border-transparent'
                          }`}
                          onClick={() => renamingSession !== session.id && handleOpenSession(session)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenu({ x: e.clientX, y: e.clientY, session })
                          }}
                        >
                          {loadingSession === session.id ? (
                            <span className="flex gap-0.5 shrink-0">
                              <span className="w-1 h-1 rounded-full accent-pulse animate-pulse" />
                              <span className="w-1 h-1 rounded-full accent-pulse animate-pulse" style={{ animationDelay: '150ms' }} />
                            </span>
                          ) : isRunning ? (
                            <span className="w-2 h-2 rounded-full accent-bg animate-pulse shrink-0" />
                          ) : (
                            <span className={`text-[10px] shrink-0 ${isActive ? 'accent-text' : 'text-neutral-600'}`}>
                              {isActive ? '●' : '○'}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            {renamingSession === session.id ? (
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => handleRenameSession(session.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameSession(session.id)
                                  if (e.key === 'Escape') { setRenamingSession(null); setRenameValue('') }
                                }}
                                className="w-full bg-white/[0.06] text-neutral-200 rounded px-1.5 py-0.5 text-sm border border-white/[0.1] focus:outline-none accent-ring"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="text-sm truncate">{session.title}</div>
                            )}
                            <div className="text-[10px] text-neutral-600">
                              {isRunning ? (
                                <span className="accent-text">Working...</span>
                              ) : (
                                <>{session.messageCount} msgs · {timeAgo(session.timestamp)}</>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'workspace' && claudeDir && (
          <div className="py-1">
            <Section label="Commands" count={claudeDir.commands.length} defaultOpen>
              {claudeDir.commands.map((cmd) => (
                <FileItem key={cmd.name} name={cmd.name} icon="⚡" onClick={() => handleOpenFile(cmd.filename)} />
              ))}
            </Section>

            <Section label="Context" count={claudeDir.context.length}>
              {claudeDir.context.map((ctx) => (
                <FileItem key={ctx.name} name={ctx.name} icon="📋" onClick={() => handleOpenFile(ctx.filename)} />
              ))}
            </Section>

            <Section label="Skills" count={claudeDir.skills.length}>
              {claudeDir.skills.map((skill) => (
                <FileItem key={skill.name} name={skill.name} icon="🧠" onClick={() => handleOpenFile(skill.dirname)} />
              ))}
            </Section>

            <Section label="Memory" count={claudeDir.memory.length}>
              {claudeDir.memory.map((mem) => (
                <FileItem key={mem.name} name={mem.name} icon="💾" onClick={() => handleOpenFile(mem.filename)} />
              ))}
            </Section>

            <Section label="Outputs" count={claudeDir.outputs.length}>
              {claudeDir.outputs.map((out) => (
                <FileItem key={out.name} name={out.name} icon="📄" onClick={() => handleOpenFile(out.filename)} />
              ))}
            </Section>
          </div>
        )}
      </div>

      {/* View tabs at bottom */}
      <div className="px-3 py-2 border-t border-white/[0.04]">
        <div className="flex gap-0.5 bg-white/[0.02] rounded-lg p-0.5">
          {(['chat', 'schedules', 'settings'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium capitalize transition-all ${
                view === v
                  ? 'accent-bg-15 accent-text shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Create Instance Modal */}
      {/* Session context menu */}
      {contextMenu && (
        <div
          className="fixed z-[200] bg-[#18181b] border border-white/[0.1] rounded-xl shadow-2xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setRenamingSession(contextMenu.session.id)
              setRenameValue(contextMenu.session.title)
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.06] text-left transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => handleDeleteSession(contextMenu.session.id)}
            className="w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 text-left transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {creatingInstance && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={() => { setCreatingInstance(false); setNewInstanceName('') }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#18181b] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4">
              <h2 className="text-base font-semibold text-neutral-100 mb-1">Create New Instance</h2>
              <p className="text-xs text-neutral-500 mb-4">A fresh AIOS workspace will be created from the template.</p>
              <form onSubmit={(e) => { e.preventDefault(); handleCreateInstance() }}>
                <input
                  ref={newInstanceInputRef}
                  type="text"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Instance name (e.g. Client Name)"
                  autoFocus
                  className="w-full bg-[#0f0f13] text-neutral-200 rounded-xl px-4 py-3 text-sm border border-white/[0.08] accent-ring focus:outline-none placeholder:text-neutral-600"
                  onKeyDown={(e) => { if (e.key === 'Escape') { setCreatingInstance(false); setNewInstanceName('') } }}
                />
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => { setCreatingInstance(false); setNewInstanceName('') }}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newInstanceName.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl accent-bg text-white text-sm font-medium hover:brightness-110 transition-all disabled:opacity-30 accent-shadow"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Folder Browser Modal */}
      {showFolderBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowFolderBrowser(false)}>
          <div
            className="w-[480px] max-w-[90vw] max-h-[70vh] bg-[#141416] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-neutral-200">Select Folder</h3>
              <button onClick={() => setShowFolderBrowser(false)} className="text-neutral-500 hover:text-neutral-200 transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Current path */}
            <div className="px-4 py-2 border-b border-white/[0.04] flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 font-mono truncate flex-1">{browseDir || '~'}</span>
              {browseHasClaude && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">.claude</span>
              )}
            </div>

            {/* Directory listing */}
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {browseLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Go up */}
                  {browseParent && browseParent !== browseDir && (
                    <button
                      onClick={() => loadBrowseDir(browseParent)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="text-neutral-600">↑</span>
                      <span>..</span>
                    </button>
                  )}
                  {browseDirs.length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-neutral-600">No subdirectories</div>
                  )}
                  {browseDirs.map((name) => (
                    <button
                      key={name}
                      onClick={() => loadBrowseDir(`${browseDir}/${name}`)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-300 hover:text-neutral-100 hover:bg-white/[0.04] transition-colors text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-neutral-500">
                        <path d="M2 4.5V12.5C2 13.0523 2.44772 13.5 3 13.5H13C13.5523 13.5 14 13.0523 14 12.5V6.5C14 5.94772 13.5523 5.5 13 5.5H8L6.5 3.5H3C2.44772 3.5 2 3.94772 2 4.5Z" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                      <span className="truncate">{name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Footer: select button */}
            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] text-neutral-600">Navigate to a folder, then select it</span>
              <button
                onClick={handleSelectFolder}
                disabled={!browseDir}
                className="px-4 py-2 rounded-lg text-xs font-medium accent-bg text-white hover:brightness-110 transition-all disabled:opacity-30"
              >
                Select this folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
