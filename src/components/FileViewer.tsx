import { useState, useEffect } from 'react'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])

function isImage(filePath: string) {
  return IMAGE_EXTS.has(filePath.split('.').pop()?.toLowerCase() ?? '')
}

interface FileViewerProps {
  filePath: string
  onClose: () => void
}

export default function FileViewer({ filePath, onClose }: FileViewerProps) {
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileName = filePath.split('/').pop() || ''
  const isImg = isImage(filePath)

  useEffect(() => {
    setEditing(false)
    if (isImg) {
      window.aios.readImage(filePath).then(setContent)
    } else {
      window.aios.readFile(filePath).then(setContent)
    }
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800/70 bg-neutral-900/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-neutral-700 text-[10px] shrink-0">{isImg ? '▪' : '◆'}</span>
          <span className="text-xs font-medium text-neutral-300 truncate">{fileName}</span>
          {editing && (
            <span className="text-[9px] text-orange-400/80 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded shrink-0 tracking-wide">
              EDIT
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isImg && (
            editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-[11px] px-2.5 py-1 rounded bg-orange-500/90 text-white
                             hover:bg-orange-500 transition-colors disabled:opacity-50 font-medium"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    window.aios.readFile(filePath).then(setContent)
                  }}
                  className="text-[11px] px-2.5 py-1 rounded text-neutral-500
                             hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-[11px] px-2.5 py-1 rounded text-neutral-600
                           hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                Edit
              </button>
            )
          )}
          <button
            onClick={onClose}
            className="ml-0.5 w-6 h-6 flex items-center justify-center rounded
                       text-neutral-700 hover:text-neutral-300 hover:bg-neutral-800 transition-colors text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isImg ? (
          <div className="flex items-center justify-center h-full p-8">
            <img
              src={content}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
            />
          </div>
        ) : editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-transparent text-neutral-300 text-[12.5px]
                       font-mono resize-none outline-none leading-relaxed p-4"
            spellCheck={false}
          />
        ) : (
          <pre className="text-[12.5px] text-neutral-400 font-mono whitespace-pre-wrap leading-relaxed p-4">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}
