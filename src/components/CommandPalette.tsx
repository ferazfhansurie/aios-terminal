import { useState, useEffect, useRef, useCallback } from 'react'

interface Command {
  name: string
  filename: string
  description?: string
}

interface Props {
  query: string  // text after '/'
  onSelect: (command: string) => void
  onClose: () => void
  visible: boolean
}

export default function CommandPalette({ query, onSelect, onClose, visible }: Props) {
  const [commands, setCommands] = useState<Command[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Load commands from workspace
  useEffect(() => {
    const load = async () => {
      const aios = (window as any).aios
      if (!aios) return
      const dir = await aios.getClaudeDir()
      if (dir?.commands) {
        setCommands(dir.commands)
      }
    }
    load()

    // Reload on file changes
    const aios = (window as any).aios
    if (aios?.onFilesChanged) {
      const unsub = aios.onFilesChanged(load)
      return () => unsub()
    }
  }, [])

  const filtered = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase())
  )

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible || filtered.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      onSelect(`/${filtered[selectedIndex].name}`)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [visible, filtered, selectedIndex, onSelect, onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  if (!visible || filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-[#18181b] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto" ref={listRef}>
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Commands</span>
          </div>
          {filtered.map((cmd, i) => (
            <button
              key={cmd.name}
              onClick={() => onSelect(`/${cmd.name}`)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                i === selectedIndex
                  ? 'accent-bg-10 accent-text'
                  : 'text-neutral-300 hover:bg-white/[0.04]'
              }`}
            >
              <span className="w-5 h-5 rounded-md bg-white/[0.06] flex items-center justify-center text-[11px] text-neutral-500 shrink-0">
                /
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{cmd.name}</span>
              </div>
              {i === selectedIndex && (
                <span className="text-[10px] text-neutral-600 shrink-0">↵ select</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
