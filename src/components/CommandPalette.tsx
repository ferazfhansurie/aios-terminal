import { useState, useEffect, useRef, useCallback } from 'react'

type ItemType = 'command' | 'skill'

interface Item {
  type: ItemType
  label: string
  sublabel?: string
  action: () => void
}

const TYPE_ICON: Record<ItemType, string> = {
  command: '/',
  skill: '◆',
}

const TYPE_COLOR: Record<ItemType, string> = {
  command: 'text-orange-500/70',
  skill: 'text-blue-400/60',
}

const TYPE_BADGE: Record<ItemType, string> = {
  command: 'text-orange-500/40',
  skill: 'text-blue-500/40',
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()

    window.aios.getClaudeDir().then((claudeDir) => {
      const all: Item[] = []

      for (const cmd of claudeDir.commands) {
        all.push({
          type: 'command',
          label: `/${cmd.name}`,
          sublabel: 'command',
          action: () => { window.aios.sendCommand(`/${cmd.name}`); onClose() },
        })
      }

      for (const skill of claudeDir.skills) {
        all.push({
          type: 'skill',
          label: skill.name,
          sublabel: 'skill',
          action: () => { window.aios.sendCommand(`/${skill.name}`); onClose() },
        })
      }

      setItems(all)
    })
  }, [])

  const filtered = query
    ? items.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.type.includes(query.toLowerCase())
      )
    : items

  useEffect(() => { setSelected(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const run = useCallback(() => {
    filtered[selected]?.action()
  }, [filtered, selected])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const groups: { type: ItemType; label: string; items: (Item & { idx: number })[] }[] = []
  const typeOrder: ItemType[] = ['command', 'skill']
  for (const type of typeOrder) {
    const group = filtered
      .map((item, i) => ({ ...item, idx: i }))
      .filter(item => item.type === type)
    if (group.length > 0) {
      groups.push({ type, label: type === 'command' ? 'Commands' : 'Skills', items: group })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-[500px] bg-neutral-900 border border-neutral-700/50 rounded-xl shadow-2xl overflow-hidden animate-scaleIn"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800/80">
          <span className="text-neutral-600 text-[11px] font-mono shrink-0">⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands and skills…"
            className="flex-1 bg-transparent text-neutral-200 text-sm placeholder:text-neutral-700 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-neutral-700 hover:text-neutral-400 text-xs transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11px] text-neutral-700">
              No results for "{query}"
            </div>
          ) : query ? (
            filtered.map((item, i) => (
              <ResultRow
                key={i}
                item={item}
                isSelected={i === selected}
                onHover={() => setSelected(i)}
              />
            ))
          ) : (
            groups.map(group => (
              <div key={group.type}>
                <div className="px-4 pt-3 pb-1 text-[9px] uppercase tracking-[0.15em] text-neutral-700 font-semibold">
                  {group.label}
                </div>
                {group.items.map(item => (
                  <ResultRow
                    key={item.idx}
                    item={item}
                    isSelected={item.idx === selected}
                    onHover={() => setSelected(item.idx)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-neutral-800/50 text-[9px] text-neutral-700 tracking-wide">
          <span>↑↓ navigate</span>
          <span className="text-neutral-800">·</span>
          <span>↵ run</span>
          <span className="text-neutral-800">·</span>
          <span>esc close</span>
          <div className="flex-1" />
          <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

function ResultRow({
  item,
  isSelected,
  onHover,
}: {
  item: Item & { type: ItemType }
  isSelected: boolean
  onHover: () => void
}) {
  return (
    <button
      onClick={item.action}
      onMouseEnter={onHover}
      className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-all duration-100 ${
        isSelected ? 'bg-neutral-800' : 'hover:bg-neutral-800/40'
      }`}
    >
      <span className={`text-[11px] w-4 shrink-0 text-center font-mono ${TYPE_COLOR[item.type]}`}>
        {TYPE_ICON[item.type]}
      </span>
      <span className="text-[13px] text-neutral-300 truncate flex-1">{item.label}</span>
      {item.sublabel && (
        <span className={`text-[9px] uppercase tracking-wider shrink-0 ${TYPE_BADGE[item.type]}`}>
          {item.sublabel}
        </span>
      )}
      {isSelected && (
        <span className="text-[9px] text-neutral-700 shrink-0">↵</span>
      )}
    </button>
  )
}
