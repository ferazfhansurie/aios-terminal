import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'

export default function FileEditor() {
  const { editingFile, setEditingFile } = useAppStore()
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fileName = editingFile?.split('/').pop() || 'Untitled'

  // Load file content
  useEffect(() => {
    if (!editingFile) return
    const load = async () => {
      const aios = (window as any).aios
      if (!aios) return
      try {
        const text = await aios.readFile(editingFile)
        setContent(text)
        setOriginalContent(text)
      } catch {
        setContent('// Failed to load file')
      }
    }
    load()
  }, [editingFile])

  const hasChanges = content !== originalContent

  const handleSave = useCallback(async () => {
    if (!editingFile || !hasChanges) return
    setSaving(true)
    try {
      const aios = (window as any).aios
      if (aios?.writeFile) {
        await aios.writeFile(editingFile, content)
      }
    } catch {}
    setOriginalContent(content)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [editingFile, content, hasChanges])

  // Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  const handleBack = () => {
    setEditingFile(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0c0c0e]">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-neutral-500 hover:text-neutral-200 text-sm transition-colors"
          >
            ← Back
          </button>
          <span className="text-xs text-neutral-600">|</span>
          <span className="text-sm text-neutral-300 font-mono">{fileName}</span>
          {hasChanges && (
            <span className="w-2 h-2 rounded-full bg-orange-500" title="Unsaved changes" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] text-green-400">Saved</span>}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 text-xs font-medium hover:bg-orange-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <span className="text-[10px] text-neutral-600">⌘S</span>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full bg-[#0a0a0c] text-neutral-200 font-mono text-sm leading-relaxed p-6 resize-none focus:outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
