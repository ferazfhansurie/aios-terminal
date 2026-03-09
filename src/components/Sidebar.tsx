import { useState, useEffect, useRef } from 'react'
import CommandList from './CommandList'
import logo from '../assets/logo.png'

interface ClaudeDir {
  commands: { name: string; filename: string }[]
  skills: { name: string; dirname: string; isDir: boolean }[]
  context: { name: string; filename: string }[]
  memory: { name: string; filename: string }[]
  settings: Record<string, any> | null
}

interface Instance {
  id: string
  name: string
  path: string
  created: number
}

interface SidebarSection {
  id: string
  label: string
  icon: string
  isOpen: boolean
}

interface ScheduledTask {
  id: string
  name: string
  command: string
  type: 'once' | 'daily' | 'weekly' | 'interval'
  time?: string
  dayOfWeek?: number
  date?: string
  intervalMinutes?: number
  enabled: boolean
  lastRun?: number
  lastStatus?: string
  nextRun?: number | null
  createdAt: number
  history: { timestamp: number; status: string }[]
}

export default function Sidebar({ onFileSelect, onScheduleOpen }: {
  onFileSelect: (path: string) => void
  onScheduleOpen: () => void
}) {
  const [claudeDir, setClaudeDir] = useState<ClaudeDir | null>(null)
  const [images, setImages] = useState<{ name: string; filename: string }[]>([])
  const [schedules, setSchedules] = useState<ScheduledTask[]>([])
  const [dragging, setDragging] = useState(false)

  // Instance state
  const [instances, setInstances] = useState<Instance[]>([])
  const [activeInstance, setActiveInstance] = useState<Instance | null>(null)
  const [instanceDropdown, setInstanceDropdown] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const [sections, setSections] = useState<SidebarSection[]>([
    { id: 'commands', label: 'Commands', icon: '⌘', isOpen: false },
    { id: 'context', label: 'Context', icon: '◆', isOpen: false },
    { id: 'files', label: 'Files', icon: '◫', isOpen: false },
    { id: 'schedule', label: 'Schedule', icon: '⏱', isOpen: false },
    { id: 'skills', label: 'Skills', icon: '⚡', isOpen: false },
    { id: 'memory', label: 'Memory', icon: '◇', isOpen: false },
    { id: 'settings', label: 'Settings', icon: '⚙', isOpen: false },
  ])

  const loadClaudeDir = async () => {
    const dir = await window.aios.getClaudeDir()
    setClaudeDir(dir)
  }

  const loadImages = async () => {
    const list = await window.aios.listFiles()
    setImages(list)
  }

  const loadInstances = async () => {
    const [list, active] = await Promise.all([
      window.aios.listInstances(),
      window.aios.getActiveInstance(),
    ])
    setInstances(list)
    setActiveInstance(active)
  }

  const loadSchedules = async () => {
    try {
      const list = await window.aios.listSchedules()
      setSchedules(list)
    } catch { setSchedules([]) }
  }

  useEffect(() => {
    loadClaudeDir()
    loadImages()
    loadInstances()
    loadSchedules()
    const removeFilesChanged = window.aios.onFilesChanged(() => { loadClaudeDir(); loadImages() })
    const removeSchedulesChanged = window.aios.onSchedulesChanged(() => { loadSchedules() })
    const removeInstanceSwitched = window.aios.onInstanceSwitched((instance) => {
      setActiveInstance(instance)
      loadClaudeDir()
      loadImages()
      loadInstances()
      loadSchedules()
    })
    return () => { removeFilesChanged(); removeSchedulesChanged(); removeInstanceSwitched() }
  }, [])

  const toggleSection = (id: string) => {
    setSections(prev =>
      prev.map(s => s.id === id ? { ...s, isOpen: !s.isOpen } : s)
    )
  }

  const handleSwitchInstance = async (id: string) => {
    setInstanceDropdown(false)
    if (id === activeInstance?.id) return
    await window.aios.switchInstance(id)
  }

  const handleCreateInstance = async (name: string) => {
    setShowCreateModal(false)
    await window.aios.createInstance(name)
  }

  const handleDeleteInstance = async (id: string) => {
    if (id === 'aios-firaz') return // can't delete default
    await window.aios.deleteInstance(id)
    loadInstances()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
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

  const sectionCounts: Record<string, number> = {
    files: images.length,
    commands: claudeDir?.commands.length || 0,
    context: claudeDir?.context.length || 0,
    memory: claudeDir?.memory.length || 0,
    skills: claudeDir?.skills.length || 0,
    schedule: schedules.length,
  }

  if (!claudeDir) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
        <span className="text-[10px] text-neutral-700 tracking-widest uppercase">Loading</span>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col h-full transition-all duration-200 ${dragging ? 'bg-orange-500/5 ring-1 ring-inset ring-orange-500/30' : ''}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header / Logo */}
      <div className="px-3 pt-7 pb-2.5 border-b border-neutral-800/50 flex items-center gap-2.5">
        <div className="relative group cursor-default shrink-0">
          <div className="absolute inset-0 rounded-xl bg-orange-500/10 blur-lg group-hover:bg-orange-500/20 transition-all duration-500" />
          <img
            src={logo}
            alt="AIOS"
            className="relative w-8 h-8 rounded-lg shadow-lg shadow-black/30"
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-[11px] font-bold tracking-[0.2em] text-orange-400 uppercase leading-tight">AIOS</h1>
          <p className="text-[8px] text-neutral-700 tracking-[0.15em] uppercase">Terminal</p>
        </div>
      </div>

      {/* Instance Switcher */}
      <div className="px-3 py-2 border-b border-neutral-800/40 relative">
        <button
          onClick={() => setInstanceDropdown(p => !p)}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg
                     bg-neutral-900/80 hover:bg-neutral-800/80 border border-neutral-800/50 hover:border-neutral-700/50
                     transition-all duration-150 group"
        >
          <span className="w-2 h-2 rounded-full bg-green-500/80 shadow-[0_0_6px_#22c55e60] shrink-0" />
          <span className="text-[11px] text-neutral-300 truncate flex-1 text-left font-medium">
            {activeInstance?.name || 'Loading...'}
          </span>
          <span className={`text-[9px] text-neutral-600 group-hover:text-neutral-400 transition-all duration-200 ${instanceDropdown ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>

        {/* Dropdown */}
        {instanceDropdown && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50
                          bg-neutral-900 border border-neutral-700/50 rounded-lg shadow-2xl shadow-black/50
                          overflow-hidden animate-slideDown">
            {instances.map((inst) => (
              <button
                key={inst.id}
                onClick={() => handleSwitchInstance(inst.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors
                           ${inst.id === activeInstance?.id
                             ? 'bg-orange-500/10 text-orange-400'
                             : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                           }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  inst.id === activeInstance?.id ? 'bg-orange-500' : 'bg-neutral-700'
                }`} />
                <span className="text-[11px] truncate flex-1">{inst.name}</span>
                {inst.id !== 'aios-firaz' && inst.id !== activeInstance?.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteInstance(inst.id) }}
                    className="text-[9px] text-neutral-700 hover:text-red-400 transition-colors px-1"
                  >
                    ✕
                  </button>
                )}
              </button>
            ))}
            <div className="border-t border-neutral-800/50">
              <button
                onClick={() => { setInstanceDropdown(false); setShowCreateModal(true) }}
                className="w-full text-left px-3 py-2 flex items-center gap-2
                           text-orange-500/60 hover:bg-orange-500/5 hover:text-orange-400 transition-colors"
              >
                <span className="text-sm leading-none">+</span>
                <span className="text-[11px]">New AIOS Instance</span>
              </button>
              <button
                onClick={async () => {
                  setInstanceDropdown(false)
                  const result = await window.aios.addFolder()
                  if (result?.error === 'not-aios') {
                    // Could show a toast, for now just log
                    console.warn('Not an AIOS folder — must contain .claude/ directory')
                  }
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2
                           text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300 transition-colors"
              >
                <span className="text-sm leading-none">◫</span>
                <span className="text-[11px]">Add Existing Folder</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Instance Modal */}
      {showCreateModal && (
        <CreateInstanceModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateInstance}
        />
      )}

      {dragging && (
        <div className="mx-3 mb-1 mt-1 rounded-lg border border-dashed border-orange-500/30 bg-orange-500/5
                        text-[10px] text-orange-500/50 text-center py-2 pointer-events-none animate-pulse">
          Drop files here
        </div>
      )}

      {/* Co-founder Quick Actions */}
      <div className="px-3 py-2 border-b border-neutral-800/40">
        <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-700 mb-2 px-1">
          Quick Actions
        </div>
        <div className="grid grid-cols-2 gap-1">
          {([
            { label: 'Morning Brief', cmd: 'Give me a morning briefing — what happened overnight, key metrics, anything I need to act on today. Check for any leads, messages, or revenue changes.', icon: '◉' },
            { label: 'Lead Audit', cmd: 'Run a lead leak audit — find contacts who messaged us in the last 48h but never got a reply. Show me the worst ones first.', icon: '◎' },
            { label: 'Revenue Check', cmd: 'What\'s our current revenue situation? Show MRR, active clients, upcoming renewals, and flag any churn risks.', icon: '◈' },
            { label: 'Draft Proposal', cmd: 'Help me draft a proposal for a prospect. Ask me who it\'s for and I\'ll give you the details.', icon: '◇' },
            { label: 'Pipeline Review', cmd: 'Show me the full sales pipeline — active deals, follow-ups due, and suggest next actions for each.', icon: '▣' },
            { label: 'Weekly Report', cmd: 'Generate a weekly report covering: revenue, new clients, churn, active deals, and key wins. Make it presentable.', icon: '▤' },
          ] as { label: string; cmd: string; icon: string }[]).map((action) => (
            <button
              key={action.label}
              onClick={() => window.aios.sendCommand(action.cmd)}
              className="text-left px-2 py-1.5 rounded-md text-[10px]
                         text-neutral-600 hover:text-neutral-300
                         hover:bg-neutral-800/60 transition-all duration-150
                         flex items-center gap-1.5 group"
            >
              <span className="text-orange-500/30 group-hover:text-orange-500/60 transition-colors text-[9px] shrink-0">
                {action.icon}
              </span>
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sections.map((section) => (
          <div key={section.id} className="border-b border-neutral-800/20">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center gap-2 px-4 py-2
                         text-[9px] font-semibold uppercase tracking-[0.15em]
                         text-neutral-600 hover:text-neutral-400 transition-colors group"
            >
              <span className="text-[10px] text-neutral-700 group-hover:text-orange-500/40 transition-colors w-3 text-center">
                {section.icon}
              </span>
              <span className="flex-1 text-left">{section.label}</span>
              {sectionCounts[section.id] > 0 && (
                <span className="text-orange-500/30 text-[9px] font-normal normal-case tabular-nums mr-1">
                  {sectionCounts[section.id]}
                </span>
              )}
              <span className={`text-neutral-700 group-hover:text-neutral-500 transition-all duration-200 text-[8px] ${section.isOpen ? 'rotate-0' : '-rotate-90'}`}>
                ▾
              </span>
            </button>

            <div className={`overflow-hidden transition-all duration-200 ease-out ${section.isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="px-2 pb-2">
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
                  <div>
                    {claudeDir.memory.length > 0 && (
                      <div className="px-3 pb-1.5 text-[9px] text-neutral-800 leading-relaxed">
                        Persists across sessions
                      </div>
                    )}
                    <FileList items={claudeDir.memory} onSelect={onFileSelect} />
                  </div>
                )}
                {section.id === 'schedule' && (
                  <ScheduleList tasks={schedules} onOpenPanel={onScheduleOpen} />
                )}
                {section.id === 'skills' && (
                  <SkillList skills={claudeDir.skills} />
                )}
                {section.id === 'settings' && claudeDir.settings && (
                  <SettingsPreview settings={claudeDir.settings} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function CreateInstanceModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-80 bg-neutral-900 border border-neutral-700/50 rounded-xl shadow-2xl p-5 animate-scaleIn"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-neutral-200 mb-1">New AIOS Instance</h2>
        <p className="text-[10px] text-neutral-600 mb-4">Creates a fresh workspace from the template.</p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onCreate(name.trim()); if (e.key === 'Escape') onClose() }}
          placeholder="Instance name (e.g. Wad Works)"
          className="w-full bg-neutral-800 border border-neutral-700/50 rounded-lg px-3 py-2
                     text-sm text-neutral-200 placeholder:text-neutral-700 outline-none
                     focus:border-orange-500/40 transition-colors"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onCreate(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-1.5 text-[11px] font-medium text-white bg-orange-500/90 hover:bg-orange-500
                       rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
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
      className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-150
                 text-[9px] text-neutral-600 hover:text-orange-400 px-1 py-0.5 rounded"
    >
      {copied ? '✓' : 'copy'}
    </button>
  )
}

function getFileTypeIcon(name: string): { icon: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
  if (imgExts.includes(ext)) return { icon: '◻', color: 'text-purple-500/50' }
  if (ext === 'pdf') return { icon: '▤', color: 'text-red-500/50' }
  if (ext === 'md') return { icon: '¶', color: 'text-blue-400/50' }
  if (ext === 'json') return { icon: '{}', color: 'text-yellow-500/50' }
  if (['js', 'ts', 'tsx', 'jsx'].includes(ext)) return { icon: 'ƒ', color: 'text-cyan-500/50' }
  if (['doc', 'docx'].includes(ext)) return { icon: '≡', color: 'text-blue-500/50' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: '▦', color: 'text-green-500/50' }
  return { icon: '◆', color: 'text-neutral-600' }
}

function ImageList({ items, onSelect }: {
  items: { name: string; filename: string }[]
  onSelect: (path: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="mx-2 my-1 rounded-lg border border-dashed border-neutral-800/60 bg-neutral-900/30 px-3 py-4 text-center">
        <div className="text-neutral-800 text-lg mb-1.5">+</div>
        <div className="text-[10px] text-neutral-700 leading-relaxed">
          Drag files here
        </div>
        <div className="text-[9px] text-neutral-800 mt-0.5">project/files/</div>
      </div>
    )
  }
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const { icon, color } = getFileTypeIcon(item.name)
        const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
        return (
          <div
            key={item.name}
            className="flex items-center rounded-md group hover:bg-neutral-800/70 transition-all duration-150"
          >
            <button
              onClick={() => onSelect(item.filename)}
              className="flex-1 min-w-0 text-left px-3 py-1.5 text-xs
                         text-neutral-400 group-hover:text-neutral-100
                         transition-colors flex items-center gap-2"
            >
              <span className={`${color} group-hover:text-orange-500/60 transition-colors text-[10px] shrink-0 font-mono`}>
                {icon}
              </span>
              <span className="truncate flex-1">{item.name}</span>
              <span className="text-[8px] text-neutral-800 group-hover:text-neutral-600 uppercase tracking-wide shrink-0 transition-colors">
                {ext}
              </span>
            </button>
            <CopyPathButton path={item.filename} />
          </div>
        )
      })}
    </div>
  )
}

function FileList({ items, onSelect }: {
  items: { name: string; filename: string }[]
  onSelect: (path: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-neutral-800 italic">No files</div>
    )
  }
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const { icon, color } = getFileTypeIcon(item.name)
        return (
          <div
            key={item.name}
            className="flex items-center rounded-md group hover:bg-neutral-800/70 transition-all duration-150"
          >
            <button
              onClick={() => onSelect(item.filename)}
              className="flex-1 min-w-0 text-left px-3 py-1.5 text-xs
                         text-neutral-400 group-hover:text-neutral-100
                         transition-colors flex items-center gap-2"
            >
              <span className={`${color} group-hover:text-orange-500/60 transition-colors text-[10px] shrink-0 font-mono`}>
                {icon}
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
  if (skills.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-neutral-800 italic">No skills configured</div>
    )
  }
  return (
    <div className="space-y-0.5">
      {skills.map((skill) => (
        <button
          key={skill.name}
          onClick={() => window.aios.sendCommand(`/${skill.name}`)}
          className="w-full text-left px-3 py-1.5 rounded-md text-xs text-neutral-500
                     hover:text-neutral-200 hover:bg-neutral-800/60
                     transition-all duration-150 flex items-center gap-2 group"
        >
          <span className="text-orange-500/30 group-hover:text-orange-500/70 transition-colors text-[10px] shrink-0">
            {skill.isDir ? '▸' : '◆'}
          </span>
          <span className="truncate flex-1">/{skill.name}</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-neutral-600 shrink-0">
            run
          </span>
        </button>
      ))}
    </div>
  )
}

function ScheduleList({ tasks, onOpenPanel }: { tasks: ScheduledTask[]; onOpenPanel: () => void }) {
  const enabledCount = tasks.filter(t => t.enabled).length

  if (tasks.length === 0) {
    return (
      <div className="mx-2 my-1 rounded-lg border border-dashed border-neutral-800/60 bg-neutral-900/30 px-3 py-3 text-center">
        <div className="text-neutral-800 text-sm mb-1">⏱</div>
        <div className="text-[10px] text-neutral-700 leading-relaxed">No scheduled tasks</div>
        <button
          onClick={onOpenPanel}
          className="mt-2 text-[10px] text-orange-500/60 hover:text-orange-400 transition-colors"
        >
          + Create schedule
        </button>
      </div>
    )
  }

  const typeColors: Record<string, string> = {
    daily: 'text-blue-400/70 bg-blue-500/10',
    weekly: 'text-purple-400/70 bg-purple-500/10',
    interval: 'text-cyan-400/70 bg-cyan-500/10',
    once: 'text-amber-400/70 bg-amber-500/10',
  }

  const formatNextRun = (task: ScheduledTask): string => {
    if (!task.enabled) return 'paused'
    if (task.type === 'daily' && task.time) return `daily ${task.time}`
    if (task.type === 'weekly' && task.time) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return `${days[task.dayOfWeek ?? 0]} ${task.time}`
    }
    if (task.type === 'interval' && task.intervalMinutes) {
      return task.intervalMinutes >= 60
        ? `every ${Math.round(task.intervalMinutes / 60)}h`
        : `every ${task.intervalMinutes}m`
    }
    if (task.type === 'once' && task.date && task.time) return `${task.date} ${task.time}`
    return '—'
  }

  return (
    <div className="space-y-0.5">
      {enabledCount > 0 && (
        <div className="px-3 pb-1 text-[9px] text-neutral-800">
          {enabledCount} active
        </div>
      )}
      {tasks.slice(0, 5).map((task) => (
        <button
          key={task.id}
          onClick={onOpenPanel}
          className="w-full text-left px-3 py-1.5 rounded-md text-xs
                     hover:bg-neutral-800/60 transition-all duration-150
                     flex items-center gap-2 group"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            task.enabled ? 'bg-green-500/80 shadow-[0_0_4px_#22c55e40]' : 'bg-neutral-700'
          }`} />
          <span className={`truncate flex-1 ${
            task.enabled ? 'text-neutral-400 group-hover:text-neutral-200' : 'text-neutral-600'
          } transition-colors`}>
            {task.name}
          </span>
          <span className={`text-[8px] px-1.5 py-0.5 rounded-full shrink-0 ${typeColors[task.type] || 'text-neutral-600 bg-neutral-800/50'}`}>
            {formatNextRun(task)}
          </span>
        </button>
      ))}
      {tasks.length > 5 && (
        <button
          onClick={onOpenPanel}
          className="w-full text-center px-3 py-1 text-[9px] text-neutral-700 hover:text-orange-400 transition-colors"
        >
          +{tasks.length - 5} more
        </button>
      )}
      <button
        onClick={onOpenPanel}
        className="w-full text-left px-3 py-1.5 text-[10px] text-orange-500/50 hover:text-orange-400
                   transition-colors flex items-center gap-1.5"
      >
        <span>+</span>
        <span>Manage schedules</span>
      </button>
    </div>
  )
}

function SettingsPreview({ settings }: { settings: Record<string, any> }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const renderValue = (val: any, depth = 0): React.ReactNode => {
    if (val === null || val === undefined) {
      return <span className="text-neutral-700 italic">null</span>
    }
    if (typeof val === 'boolean') {
      return (
        <span className={val ? 'text-green-500/70' : 'text-red-400/50'}>
          {String(val)}
        </span>
      )
    }
    if (typeof val === 'number') {
      return <span className="text-orange-400/70">{val}</span>
    }
    if (typeof val === 'string') {
      return <span className="text-neutral-400">"{val}"</span>
    }
    if (Array.isArray(val)) {
      return <span className="text-neutral-600">[{val.length} items]</span>
    }
    if (typeof val === 'object') {
      return <span className="text-neutral-600">{`{${Object.keys(val).length}}`}</span>
    }
    return <span className="text-neutral-600">{String(val)}</span>
  }

  if (Object.keys(settings).length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-neutral-800 italic">No settings</div>
    )
  }

  return (
    <div className="px-2 py-1.5 text-[10px] font-mono space-y-0.5">
      {Object.entries(settings).map(([key, val]) => {
        const isObject = val !== null && typeof val === 'object'
        const isExpanded = expanded[key]
        return (
          <div key={key}>
            <div
              className={`flex items-start gap-1.5 px-1.5 py-1 rounded transition-colors ${
                isObject ? 'hover:bg-neutral-800/40 cursor-pointer' : ''
              }`}
              onClick={isObject ? () => toggleExpand(key) : undefined}
            >
              {isObject ? (
                <span className={`text-[8px] text-neutral-700 mt-[1px] shrink-0 transition-transform duration-150 ${
                  isExpanded ? 'rotate-0' : '-rotate-90'
                }`}>▾</span>
              ) : (
                <span className="w-[8px] shrink-0" />
              )}
              <span className="text-neutral-500 shrink-0">{key}</span>
              <span className="text-neutral-800 shrink-0">:</span>
              <span className="truncate">{renderValue(val)}</span>
            </div>
            {isObject && isExpanded && (
              <div className="ml-4 pl-2 border-l border-neutral-800/30 space-y-0.5 mt-0.5 mb-1">
                {Object.entries(val as Record<string, any>).map(([subKey, subVal]) => (
                  <div key={subKey} className="flex items-start gap-1.5 px-1.5 py-0.5">
                    <span className="w-[8px] shrink-0" />
                    <span className="text-neutral-600 shrink-0">{subKey}</span>
                    <span className="text-neutral-800 shrink-0">:</span>
                    <span className="truncate">{renderValue(subVal, 1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
