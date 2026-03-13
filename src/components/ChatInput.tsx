import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

interface Props {
  droppedFiles?: File[]
  onRemoveFile?: (index: number) => void
  onClearFiles?: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return '🖼'
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext || '')) return '🎬'
  if (ext === 'pdf') return '📄'
  if (['doc', 'docx'].includes(ext || '')) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return '📊'
  if (['zip', 'tar', 'gz', 'rar'].includes(ext || '')) return '📦'
  return '📎'
}

export default function ChatInput({ droppedFiles = [], onRemoveFile, onClearFiles }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isQuerying, activeConversationId, addUserMessage, setQuerying, createNewChat, config } = useAppStore()

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeConversationId])

  const handleSubmit = async () => {
    const text = input.trim()
    if ((!text && droppedFiles.length === 0) || isQuerying) return

    let convId = activeConversationId
    if (!convId) {
      convId = createNewChat()
      const aios = (window as any).aios
      if (aios) await aios.createConversation(convId, text.slice(0, 60) || 'File upload')
    }

    // Build prompt with file references
    let prompt = text
    if (droppedFiles.length > 0) {
      const aios = (window as any).aios
      const filePaths: string[] = []
      for (const file of droppedFiles) {
        if (aios?.getPathForFile) {
          try {
            const fp = aios.getPathForFile(file)
            if (fp) filePaths.push(fp)
          } catch { /* skip */ }
        }
      }
      if (filePaths.length > 0) {
        const fileList = filePaths.map((p) => `- ${p}`).join('\n')
        prompt = text ? `${text}\n\nAttached files:\n${fileList}` : `Please look at these files:\n${fileList}`
      }
    }

    addUserMessage(prompt)
    setInput('')
    onClearFiles?.()
    setQuerying(true)

    const aios = (window as any).aios
    if (aios) {
      await aios.addMessage(convId, 'user', prompt)
      const conv = useAppStore.getState().conversations.find((c) => c.id === convId)
      await aios.query({
        prompt,
        conversationId: convId,
        sessionId: conv?.sessionId,
        apiKey: config.apiKey,
      })
    }
  }

  const handleStop = () => {
    const aios = (window as any).aios
    if (aios) aios.abort()
    setQuerying(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Files from click-to-attach go through droppedFiles too
    // But since we don't have a setter from parent for click, just build prompt directly
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const aios = (window as any).aios
      const paths: string[] = []
      for (const f of files) {
        if (aios?.getPathForFile) {
          try { const p = aios.getPathForFile(f); if (p) paths.push(p) } catch {}
        }
      }
      if (paths.length > 0) {
        const current = input.trim()
        const fileList = paths.map((p) => `- ${p}`).join('\n')
        setInput(current ? `${current}\n\nAttached files:\n${fileList}` : `Please look at these files:\n${fileList}`)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }, [input])

  return (
    <div className="border-t border-white/[0.04] bg-[#0c0c0e] px-4 pb-4 pt-3">
      <div className="max-w-3xl mx-auto">
        {/* Attached files */}
        {droppedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {droppedFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs"
              >
                <span>{getFileIcon(file.name)}</span>
                <span className="text-neutral-300 max-w-[150px] truncate">{file.name}</span>
                <span className="text-neutral-600">{formatFileSize(file.size)}</span>
                <button
                  onClick={() => onRemoveFile?.(i)}
                  className="text-neutral-600 hover:text-red-400 ml-0.5"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="relative bg-[#141416] rounded-2xl border border-white/[0.06] focus-within:border-orange-500/30 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message AIOS..."
            rows={1}
            className="w-full bg-transparent text-neutral-100 px-4 py-3.5 pr-28 resize-none focus:outline-none placeholder:text-neutral-600 text-sm leading-relaxed"
            disabled={isQuerying}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={handleFileClick}
              className="p-2 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.06] transition-all"
              title="Attach files"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.5 7.5L8 13C6.34315 14.6569 3.65685 14.6569 2 13C0.343146 11.3431 0.343146 8.65685 2 7L7.5 1.5C8.60457 0.395431 10.3954 0.395431 11.5 1.5C12.6046 2.60457 12.6046 4.39543 11.5 5.5L6 11C5.44772 11.5523 4.55228 11.5523 4 11C3.44772 10.4477 3.44772 9.55228 4 9L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            {isQuerying ? (
              <button
                onClick={handleStop}
                className="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-all active:scale-95"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() && droppedFiles.length === 0}
                className="p-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-all disabled:opacity-20 disabled:cursor-not-allowed active:scale-95"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2L7 9M14 2L9.5 14L7 9M14 2L2 6.5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
