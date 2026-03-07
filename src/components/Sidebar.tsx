import { useState, useEffect } from 'react'
import CommandList from './CommandList'
import logo from '../assets/logo.png'

interface ClaudeDir {
  commands: { name: string; filename: string }[]
  skills: { name: string; dirname: string; isDir: boolean }[]
  context: { name: string; filename: string }[]
  memory: { name: string; filename: string }[]
  settings: Record<string, any> | null
}

interface Session {
  id: string
  title: string
  messageCount: number
  timestamp: number
}

interface SidebarSection {
  id: string
  label: string
  isOpen: boolean
}


export default function Sidebar({ onFileSelect }: { onFileSelect: (path: string) => void }) {
  const [claudeDir, setClaudeDir] = useState<ClaudeDir | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [images, setImages] = useState<{ name: string; filename: string }[]>([])
  const [resumingId, setResumingId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [sections, setSections] = useState<SidebarSection[]>([
    { id: 'sessions', label: 'Sessions', isOpen: true },
    { id: 'files', label: 'Files', isOpen: true },
    { id: 'commands', label: 'Commands', isOpen: true },
    { id: 'context', label: 'Context', isOpen: true },
    { id: 'memory', label: 'Memory', isOpen: false },
    { id: 'skills', label: 'Skills', isOpen: false },
    { id: 'settings', label: 'Settings', isOpen: false },
  ])

  const loadClaudeDir = async () => {
    const dir = await window.aios.getClaudeDir()
    setClaudeDir(dir)
  }

  const loadSessions = async () => {
    const list = await window.aios.listSessions()
    setSessions(list)
  }

  const loadImages = async () => {
    const list = await window.aios.listFiles()
    setImages(list)
  }

  useEffect(() => {
    loadClaudeDir()
    loadSessions()
    loadImages()
    window.aios.onFilesChanged(() => { loadClaudeDir(); loadImages() })
  }, [])

  const toggleSection = (id: string) => {
    setSections(prev =>
      prev.map(s => s.id === id ? { ...s, isOpen: !s.isOpen } : s)
    )
  }

  const resumeSession = async (id: string) => {
    setResumingId(id)
    await window.aios.restartSession(id === '__new__' ? undefined : id)
    setResumingId(null)
    loadSessions()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Accept any file drag
    if (Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) {
      setDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const filePath = window.aios.getPathForFile(file)
      if (filePath) await window.aios.saveFile(filePath)
    }
    if (files.length) loadImages()
  }

  if (!claudeDir) {
    return (
      <div className="p-4 text-neutral-500 text-sm">Loading...</div>
    )
  }

  return (
    <div
      className={`flex flex-col h-full transition-colors ${dragging ? 'bg-orange-500/5 ring-1 ring-inset ring-orange-500/30' : ''}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header / Logo */}
      <div className="px-4 pt-7 pb-4 border-b border-neutral-800/70 flex flex-col items-center gap-2.5">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-orange-500/10 blur-xl" />
          <img
            src={logo}
            alt="AIOS"
            className="relative w-14 h-14 rounded-xl"
          />
        </div>
        <div className="text-center">
          <h1 className="text-xs font-bold tracking-[0.2em] text-orange-400 uppercase">AIOS</h1>
          <p className="text-[9px] text-neutral-600 tracking-widest uppercase mt-0.5">AI Operating System</p>
        </div>
      </div>

      {dragging && (
        <div className="mx-3 mb-2 mt-1 rounded-md border border-dashed border-orange-500/40 bg-orange-500/5
                        text-[10px] text-orange-500/60 text-center py-2 pointer-events-none">
          Drop image to add to context
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sections.map((section) => (
          <div key={section.id} className="border-b border-neutral-800/30">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between px-4 py-2
                         text-[9px] font-semibold uppercase tracking-[0.15em]
                         text-neutral-600 hover:text-neutral-400 transition-colors group"
            >
              <span className="flex items-center gap-1.5">
                {section.label}
                {section.id === 'sessions' && sessions.length > 0 && (
                  <span className="text-orange-500/40 text-[9px] font-normal normal-case tabular-nums">
                    {sessions.length}
                  </span>
                )}
                {section.id === 'files' && images.length > 0 && (
                  <span className="text-orange-500/40 text-[9px] font-normal normal-case tabular-nums">
                    {images.length}
                  </span>
                )}
              </span>
              <span className="text-neutral-700 group-hover:text-neutral-500 transition-colors text-[10px]">
                {section.isOpen ? '▾' : '▸'}
              </span>
            </button>

            {section.isOpen && (
              <div className="px-2 pb-2">
                {section.id === 'sessions' && (
                  <SessionList
                    sessions={sessions}
                    resumingId={resumingId}
                    onResume={resumeSession}
                    onRefresh={loadSessions}
                  />
                )}
                {section.id === 'files' && (
                  <ImageList items={images} onSelect={onFileSelect} />
                )}
                {section.id === 'commands' && (
                  <CommandList commands={claudeDir.commands} />
                )}
                {section.id === 'context' && (
                  <FileList items={claudeDir.context} onSelect={onFileSelect} />
                )}
                {section.id === 'memory' && (
                  <FileList items={claudeDir.memory} onSelect={onFileSelect} />
                )}
                {section.id === 'skills' && (
                  <SkillList skills={claudeDir.skills} />
                )}
                {section.id === 'settings' && claudeDir.settings && (
                  <SettingsPreview settings={claudeDir.settings} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SessionList({ sessions, resumingId, onResume, onRefresh }: {
  sessions: Session[]
  resumingId: string | null
  onResume: (id: string) => void
  onRefresh: () => void
}) {
  if (sessions.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-neutral-700">No sessions found</div>
    )
  }

  return (
    <div className="space-y-0.5">
      {/* New session */}
      <button
        onClick={() => onResume('__new__')}
        disabled={resumingId !== null}
        className="w-full text-left px-3 py-1.5 rounded-md text-xs
                   text-orange-500/60 hover:bg-orange-500/8 hover:text-orange-400
                   border border-transparent hover:border-orange-500/15
                   transition-all flex items-center gap-2 group disabled:opacity-40"
      >
        <span className="text-orange-500/50 group-hover:text-orange-400 text-sm leading-none transition-colors">+</span>
        <span className="text-[11px]">New session</span>
      </button>

      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onResume(s.id)}
          disabled={resumingId !== null}
          className="w-full text-left px-3 py-1.5 rounded-md
                     text-neutral-400 hover:bg-neutral-800/80 hover:text-neutral-200
                     transition-all group disabled:opacity-40"
        >
          <div className="flex items-start gap-2">
            <span className={`text-[10px] mt-0.5 shrink-0 transition-colors ${resumingId === s.id ? 'text-orange-500 animate-spin' : 'text-neutral-700 group-hover:text-orange-500/40'}`}>
              {resumingId === s.id ? '◌' : '●'}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] truncate leading-snug">{s.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-neutral-600">{formatTime(s.timestamp)}</span>
                <span className="text-[9px] text-neutral-700 tabular-nums">{s.messageCount}m</span>
              </div>
            </div>
          </div>
        </button>
      ))}

      <button
        onClick={onRefresh}
        className="w-full text-center py-1 text-[9px] text-neutral-700 hover:text-neutral-500 transition-colors tracking-wide"
      >
        ↻ refresh
      </button>
    </div>
  )
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const diffH = (now.getTime() - ms) / 3600000
  if (diffH < 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button
      onClick={copy}
      title={path}
      className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity
                 text-[9px] text-neutral-600 hover:text-orange-400 px-1 py-0.5 rounded"
    >
      {copied ? '✓' : 'copy'}
    </button>
  )
}

function ImageList({ items, onSelect }: {
  items: { name: string; filename: string }[]
  onSelect: (path: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-neutral-700 leading-relaxed">
        Drag images here to add them.
        <br />
        <span className="text-neutral-800">Saved to: project/files/</span>
      </div>
    )
  }
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <div
          key={item.name}
          className="flex items-center rounded-md group hover:bg-neutral-800 transition-colors"
        >
          <button
            onClick={() => onSelect(item.filename)}
            className="flex-1 min-w-0 text-left px-3 py-1.5 text-xs
                       text-neutral-400 group-hover:text-neutral-100
                       transition-colors flex items-center gap-2"
          >
            <span className="text-neutral-700 group-hover:text-orange-500/50 transition-colors text-[10px] shrink-0">▪</span>
            <span className="truncate">{item.name}</span>
          </button>
          <CopyPathButton path={item.filename} />
        </div>
      ))}
    </div>
  )
}

const FILE_IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])

function FileList({ items, onSelect }: {
  items: { name: string; filename: string }[]
  onSelect: (path: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
        const isImg = FILE_IMG_EXTS.has(ext)
        return (
          <div
            key={item.name}
            className="flex items-center rounded-md group hover:bg-neutral-800 transition-colors"
          >
            <button
              onClick={() => onSelect(item.filename)}
              className="flex-1 min-w-0 text-left px-3 py-1.5 text-xs
                         text-neutral-400 group-hover:text-neutral-100
                         transition-colors flex items-center gap-2"
            >
              <span className="text-neutral-700 group-hover:text-orange-500/50 transition-colors text-[10px] shrink-0">
                {isImg ? '▪' : '◆'}
              </span>
              <span className="truncate">{item.name}</span>
            </button>
            <CopyPathButton path={item.filename} />
          </div>
        )
      })}
    </div>
  )
}

function SkillList({ skills }: { skills: { name: string; dirname: string; isDir: boolean }[] }) {
  return (
    <div className="space-y-0.5">
      {skills.map((skill) => (
        <div
          key={skill.name}
          className="px-3 py-1.5 rounded-md text-xs text-neutral-500
                     flex items-center gap-2"
        >
          <span className="text-neutral-700 text-[10px]">{skill.isDir ? '▸' : '◆'}</span>
          {skill.name}
        </div>
      ))}
    </div>
  )
}

function SettingsPreview({ settings }: { settings: Record<string, any> }) {
  return (
    <div className="px-3 py-2 text-[10px] text-neutral-600 font-mono space-y-1">
      {Object.entries(settings).map(([key, val]) => (
        <div key={key}>
          <span className="text-neutral-500">{key}:</span>{' '}
          <span className="text-neutral-600">{typeof val === 'object' ? '{ ... }' : String(val)}</span>
        </div>
      ))}
    </div>
  )
}
