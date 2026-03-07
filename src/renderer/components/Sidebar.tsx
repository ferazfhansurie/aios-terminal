import { useState, useEffect } from 'react'
import CommandList from './CommandList'

interface ClaudeDir {
  commands: { name: string; filename: string }[]
  skills: { name: string; dirname: string; isDir: boolean }[]
  context: { name: string; filename: string }[]
  memory: { name: string; filename: string }[]
  settings: Record<string, any> | null
}

interface SidebarSection {
  id: string
  label: string
  isOpen: boolean
}

export default function Sidebar({ onFileSelect }: { onFileSelect: (path: string) => void }) {
  const [claudeDir, setClaudeDir] = useState<ClaudeDir | null>(null)
  const [sections, setSections] = useState<SidebarSection[]>([
    { id: 'commands', label: 'Commands', isOpen: true },
    { id: 'context', label: 'Context', isOpen: true },
    { id: 'memory', label: 'Memory', isOpen: true },
    { id: 'skills', label: 'Skills', isOpen: false },
    { id: 'settings', label: 'Settings', isOpen: false },
  ])

  const loadClaudeDir = async () => {
    const dir = await window.aios.getClaudeDir()
    setClaudeDir(dir)
  }

  useEffect(() => {
    loadClaudeDir()
    window.aios.onFilesChanged(() => loadClaudeDir())
  }, [])

  const toggleSection = (id: string) => {
    setSections(prev =>
      prev.map(s => s.id === id ? { ...s, isOpen: !s.isOpen } : s)
    )
  }

  if (!claudeDir) {
    return (
      <div className="p-4 text-neutral-500 text-sm">Loading...</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-neutral-800">
        <h1 className="text-lg font-bold text-orange-500">AIOS</h1>
        <p className="text-xs text-neutral-500 mt-1">AI Operating System</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.id} className="border-b border-neutral-800/50">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between px-4 py-2.5
                         text-xs font-semibold uppercase tracking-wider
                         text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {section.label}
              <span className="text-neutral-600">
                {section.isOpen ? '−' : '+'}
              </span>
            </button>

            {section.isOpen && (
              <div className="px-2 pb-2">
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

function FileList({ items, onSelect }: {
  items: { name: string; filename: string }[]
  onSelect: (path: string) => void
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <button
          key={item.name}
          onClick={() => onSelect(item.filename)}
          className="w-full text-left px-3 py-2 rounded-lg text-sm
                     text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100
                     transition-colors flex items-center gap-2"
        >
          <span className="text-neutral-600">📄</span>
          {item.name}
        </button>
      ))}
    </div>
  )
}

function SkillList({ skills }: { skills: { name: string; dirname: string; isDir: boolean }[] }) {
  return (
    <div className="space-y-1">
      {skills.map((skill) => (
        <div
          key={skill.name}
          className="px-3 py-2 rounded-lg text-sm text-neutral-400
                     flex items-center gap-2"
        >
          <span className="text-neutral-600">{skill.isDir ? '📦' : '📄'}</span>
          {skill.name}
        </div>
      ))}
    </div>
  )
}

function SettingsPreview({ settings }: { settings: Record<string, any> }) {
  return (
    <div className="px-3 py-2 text-xs text-neutral-500 font-mono">
      {Object.entries(settings).map(([key, val]) => (
        <div key={key} className="mb-1">
          <span className="text-neutral-400">{key}:</span>{' '}
          <span className="text-neutral-500">{typeof val === 'object' ? '{ ... }' : String(val)}</span>
        </div>
      ))}
    </div>
  )
}
