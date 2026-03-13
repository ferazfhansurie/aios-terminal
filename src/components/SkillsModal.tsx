import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'

interface Skill {
  name: string
  filename?: string
  dirname?: string
  isDir?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onInsert?: (text: string) => void
}

export default function SkillsModal({ open, onClose, onInsert }: Props) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [commands, setCommands] = useState<Skill[]>([])
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load skills + commands from workspace
  useEffect(() => {
    if (!open) return
    const load = async () => {
      const aios = (window as any).aios
      if (!aios) return
      const dir = await aios.getClaudeDir()
      if (dir) {
        setSkills(dir.skills || [])
        setCommands(dir.commands || [])
      }
    }
    load()
    setSearch('')
    setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const allItems = [
    ...commands.map((c) => ({ ...c, type: 'command' as const, label: `/${c.name}` })),
    ...skills.map((s) => ({ ...s, type: 'skill' as const, label: s.name })),
  ]

  const filtered = search
    ? allItems.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : allItems

  // Reset selection on search change
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleSelect = useCallback((item: { type: string; label: string; filename?: string; dirname?: string }) => {
    // Commands get inserted as /command, skills as skill name
    const text = item.type === 'command' ? `${item.label} ` : `${item.label} `
    if (onInsert) {
      onInsert(text)
    }
    onClose()
  }, [onClose, onInsert])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      handleSelect(filtered[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#18181b] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-neutral-500 shrink-0">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search skills & commands..."
              className="flex-1 bg-transparent text-neutral-100 text-sm focus:outline-none placeholder:text-neutral-600"
            />
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] text-neutral-500">
              esc
            </kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-neutral-600">
              {search ? 'No matching skills or commands' : 'No skills configured in this workspace'}
            </div>
          )}

          {/* Commands section */}
          {filtered.some((i) => i.type === 'command') && (
            <div className="px-4 pt-2 pb-1">
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Commands</span>
            </div>
          )}
          {filtered.filter((i) => i.type === 'command').map((item, idx) => {
            const globalIdx = filtered.indexOf(item)
            return (
              <button
                key={`cmd-${item.label}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(globalIdx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  globalIdx === selectedIndex
                    ? 'accent-bg-10 accent-text'
                    : 'text-neutral-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-xs shrink-0">
                  ⚡
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                </div>
                {globalIdx === selectedIndex && (
                  <span className="text-[10px] text-neutral-500 shrink-0">↵ insert</span>
                )}
              </button>
            )
          })}

          {/* Skills section */}
          {filtered.some((i) => i.type === 'skill') && (
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Skills</span>
            </div>
          )}
          {filtered.filter((i) => i.type === 'skill').map((item) => {
            const globalIdx = filtered.indexOf(item)
            return (
              <button
                key={`skill-${item.label}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(globalIdx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  globalIdx === selectedIndex
                    ? 'accent-bg-10 accent-text'
                    : 'text-neutral-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-xs shrink-0">
                  🧠
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                </div>
                {globalIdx === selectedIndex && (
                  <span className="text-[10px] text-neutral-500 shrink-0">↵ insert</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] text-neutral-600">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-neutral-600">
            <span>↑↓ navigate</span>
            <span>↵ insert</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
