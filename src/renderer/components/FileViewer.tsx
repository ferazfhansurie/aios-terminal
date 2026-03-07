import { useState, useEffect } from 'react'

interface FileViewerProps {
  filePath: string
  onClose: () => void
}

export default function FileViewer({ filePath, onClose }: FileViewerProps) {
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileName = filePath.split('/').pop() || ''

  useEffect(() => {
    window.aios.readFile(filePath).then(setContent)
  }, [filePath])

  const handleSave = async () => {
    setSaving(true)
    await window.aios.writeFile(filePath, content)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">{fileName}</span>
          {editing && (
            <span className="text-xs text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded">
              Editing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1 rounded bg-orange-500 text-white
                           hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  window.aios.readFile(filePath).then(setContent)
                }}
                className="text-xs px-3 py-1 rounded text-neutral-400
                           hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1 rounded text-neutral-400
                         hover:text-neutral-200 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200 transition-colors ml-2"
          >
            ✕
          </button>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-transparent text-neutral-300 text-sm
                       font-mono resize-none outline-none leading-relaxed"
            spellCheck={false}
          />
        ) : (
          <pre className="text-sm text-neutral-300 font-mono whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}
