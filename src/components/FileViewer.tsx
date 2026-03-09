import { useState, useEffect, useRef, useCallback } from 'react'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const BINARY_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'gz', 'tar', 'mp3', 'mp4', 'mov', 'avi'])

function isImage(filePath: string) {
  return IMAGE_EXTS.has(filePath.split('.').pop()?.toLowerCase() ?? '')
}

function isBinary(filePath: string) {
  return BINARY_EXTS.has(filePath.split('.').pop()?.toLowerCase() ?? '')
}

function isPdf(filePath: string) {
  return filePath.split('.').pop()?.toLowerCase() === 'pdf'
}

function getFileIcon(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTS.has(ext)) return '🖼'
  if (ext === 'md') return '¶'
  if (ext === 'json') return '{}'
  if (['js', 'ts', 'tsx', 'jsx'].includes(ext)) return 'ƒ'
  if (['css', 'scss'].includes(ext)) return '#'
  if (['yml', 'yaml', 'toml'].includes(ext)) return '≡'
  return '◆'
}

function getBreadcrumb(filePath: string): string[] {
  const parts = filePath.split('/')
  // Show last 3 segments max (parent/parent/file)
  return parts.slice(Math.max(0, parts.length - 3))
}

interface FileViewerProps {
  filePath: string
  onClose: () => void
}

export default function FileViewer({ filePath, onClose }: FileViewerProps) {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileName = filePath.split('/').pop() || ''
  const isImg = isImage(filePath)
  const isPdfFile = isPdf(filePath)
  const isBinaryFile = isBinary(filePath)
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const isMd = ext === 'md'
  const hasChanges = editing && content !== originalContent
  const breadcrumb = getBreadcrumb(filePath)

  useEffect(() => {
    setEditing(false)
    setSaved(false)
    if (isImg) {
      window.aios.readImage(filePath).then(setContent)
    } else if (isPdfFile) {
      // Load PDF as data URI for embedded viewer
      window.aios.readImage(filePath).then(setContent)
    } else if (isBinaryFile) {
      setContent('')
      setOriginalContent('')
    } else {
      window.aios.readFile(filePath).then((text) => {
        setContent(text)
        setOriginalContent(text)
      })
    }
  }, [filePath])

  // Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && editing) {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Escape' && editing) {
        e.preventDefault()
        handleCancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing, content])

  const handleSave = async () => {
    setSaving(true)
    await window.aios.writeFile(filePath, content)
    setOriginalContent(content)
    setSaving(false)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleCancel = () => {
    setEditing(false)
    setContent(originalContent)
  }

  const lineCount = content.split('\n').length

  const renderLineNumbers = useCallback((count: number) => {
    const lines = []
    for (let i = 1; i <= count; i++) {
      lines.push(
        <div key={i} className="text-right pr-3 select-none leading-relaxed">
          {i}
        </div>
      )
    }
    return lines
  }, [])

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="flex flex-col border-b border-neutral-800/70 bg-neutral-900/60 shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center px-3 pt-2 pb-0.5 gap-1 min-w-0">
          {breadcrumb.map((segment, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="text-neutral-800 text-[9px]">/</span>}
              <span className={`text-[10px] truncate ${
                i === breadcrumb.length - 1 ? 'text-neutral-400' : 'text-neutral-700'
              }`}>
                {segment}
              </span>
            </span>
          ))}
        </div>

        {/* File name + actions */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-neutral-600 text-[11px] shrink-0 font-mono">{getFileIcon(filePath)}</span>
            <span className="text-[13px] font-medium text-neutral-200 truncate">{fileName}</span>
            {isMd && !editing && (
              <span className="text-[8px] text-neutral-700 bg-neutral-800/80 px-1.5 py-0.5 rounded-sm uppercase tracking-wider shrink-0">
                markdown
              </span>
            )}
            {editing && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 tracking-wide transition-colors ${
                hasChanges
                  ? 'text-orange-400 bg-orange-500/15 border border-orange-500/25'
                  : 'text-neutral-500 bg-neutral-800 border border-neutral-700/30'
              }`}>
                {hasChanges ? 'MODIFIED' : 'EDITING'}
              </span>
            )}
            {saved && (
              <span className="text-[9px] text-green-400/80 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded shrink-0 animate-fadeIn">
                SAVED
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isImg && !isBinaryFile && (
              editing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="text-[11px] px-3 py-1 rounded-md bg-orange-500/90 text-white
                               hover:bg-orange-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed font-medium
                               flex items-center gap-1.5"
                  >
                    {saving ? (
                      <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                    ) : null}
                    {saving ? 'Saving' : 'Save'}
                    {!saving && <span className="text-[9px] text-white/50 font-normal ml-0.5">^S</span>}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="text-[11px] px-2.5 py-1 rounded-md text-neutral-500
                               hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setEditing(true)
                    setTimeout(() => textareaRef.current?.focus(), 50)
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-md text-neutral-500 border border-neutral-800/50
                             hover:text-neutral-200 hover:bg-neutral-800 hover:border-neutral-700/50 transition-all"
                >
                  Edit
                </button>
              )
            )}
            <button
              onClick={onClose}
              className="ml-1 w-6 h-6 flex items-center justify-center rounded-md
                         text-neutral-700 hover:text-neutral-300 hover:bg-neutral-800 transition-colors text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto relative">
        {isPdfFile ? (
          content ? (
            <iframe
              src={content}
              className="w-full h-full border-0"
              title={fileName}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          )
        ) : isBinaryFile ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <span className="text-3xl text-neutral-700">◆</span>
            <div>
              <p className="text-sm text-neutral-400">{fileName}</p>
              <p className="text-[11px] text-neutral-700 mt-1">Binary file — cannot preview</p>
            </div>
            <span className="text-[9px] text-neutral-800 uppercase tracking-wider">{ext}</span>
          </div>
        ) : isImg ? (
          <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
            <img
              src={content}
              alt={fileName}
              className="max-w-full max-h-[calc(100%-3rem)] object-contain rounded-lg shadow-xl shadow-black/30
                         border border-neutral-800/30"
            />
            <span className="text-[10px] text-neutral-700 uppercase tracking-wider">{ext}</span>
          </div>
        ) : editing ? (
          <div className="flex h-full">
            {/* Line numbers */}
            <div className="shrink-0 pt-4 pb-4 text-[11px] text-neutral-700/50 font-mono select-none
                            border-r border-neutral-800/30 min-w-[3rem] bg-neutral-950/50">
              {renderLineNumbers(lineCount)}
            </div>
            {/* Editor */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full bg-transparent text-neutral-300 text-[12.5px]
                         font-mono resize-none outline-none leading-relaxed p-4
                         caret-orange-500"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="flex h-full">
            {/* Line numbers */}
            <div className="shrink-0 pt-4 pb-4 text-[11px] text-neutral-800/60 font-mono select-none
                            border-r border-neutral-800/20 min-w-[3rem]">
              {renderLineNumbers(lineCount)}
            </div>
            {/* Read-only content */}
            <pre className="text-[12.5px] text-neutral-400 font-mono whitespace-pre-wrap leading-relaxed p-4 flex-1 min-w-0">
              {content}
            </pre>
          </div>
        )}
      </div>

      {/* Footer status */}
      {!isImg && !isBinaryFile && (
        <div className="shrink-0 px-3 py-1 border-t border-neutral-800/30 flex items-center justify-between
                        text-[9px] text-neutral-700 bg-neutral-900/30">
          <span>{lineCount} lines</span>
          <div className="flex items-center gap-3">
            <span className="uppercase">{ext}</span>
            <span>UTF-8</span>
          </div>
        </div>
      )}
    </div>
  )
}
