import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import CommandPalette from './CommandPalette'

interface AttachedFile {
  name: string
  size: number
  path?: string       // native file path (from drop or file picker)
  preview?: string    // object URL or data URI for image thumbnail
  isImage: boolean
}

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

function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')
}

export default function ChatInput({ droppedFiles = [], onRemoveFile, onClearFiles }: Props) {
  const [input, setInput] = useState('')
  const [pastedImages, setPastedImages] = useState<AttachedFile[]>([])
  const [showCommands, setShowCommands] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isQuerying, activeConversationId, addUserMessage, setQuerying, createNewChat, config, enqueueMessage, messageQueue, pendingInput, setPendingInput } = useAppStore()

  // Consume pending input from skills modal
  useEffect(() => {
    if (pendingInput) {
      setInput(pendingInput)
      setPendingInput(null)
      textareaRef.current?.focus()
    }
  }, [pendingInput, setPendingInput])

  // Show command palette when input starts with /
  const slashQuery = input.startsWith('/') ? input.slice(1) : ''

  useEffect(() => {
    setShowCommands(input.startsWith('/') && !input.includes(' '))
  }, [input])

  const handleCommandSelect = useCallback((cmd: string) => {
    setInput(cmd + ' ')
    setShowCommands(false)
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeConversationId])

  const isWeb = !!(window as any).__AIOS_WEB__

  // Build list of all attached file paths for the prompt
  const getAllFilePaths = async (): Promise<string[]> => {
    const aios = (window as any).aios
    const paths: string[] = []

    // From drag & drop
    for (const file of droppedFiles) {
      if (isWeb && aios?.uploadFile) {
        // Web mode: upload file to server, get back a server path
        try {
          const fp = await aios.uploadFile(file)
          if (fp) paths.push(fp)
        } catch { /* skip */ }
      } else if (aios?.getPathForFile) {
        try {
          const fp = aios.getPathForFile(file)
          if (fp) paths.push(fp)
        } catch { /* skip */ }
      }
    }

    // From pasted images (already have paths)
    for (const img of pastedImages) {
      if (img.path) paths.push(img.path)
    }

    return paths
  }

  const handleSubmit = async () => {
    const text = input.trim()
    const hasFiles = droppedFiles.length > 0 || pastedImages.length > 0
    if (!text && !hasFiles) return

    // Build prompt with file references
    let prompt = text
    if (hasFiles) {
      const filePaths = await getAllFilePaths()
      if (filePaths.length > 0) {
        const fileList = filePaths.map((p) => `- ${p}`).join('\n')
        prompt = text ? `${text}\n\nAttached files:\n${fileList}` : `Please look at these files:\n${fileList}`
      }
    }

    let convId = activeConversationId
    if (!convId) {
      convId = createNewChat()
      const aios = (window as any).aios
      if (aios) await aios.createConversation(convId, text.slice(0, 60) || 'File upload')
    }

    // Always show user message immediately
    addUserMessage(prompt)
    setInput('')
    setPastedImages([])
    onClearFiles?.()

    const aios = (window as any).aios
    if (aios) {
      await aios.addMessage(convId, 'user', prompt)
    }

    // If currently querying, queue this message for later
    // Use fresh state — the hook value may be stale
    if (useAppStore.getState().isQuerying) {
      enqueueMessage({ prompt, convId })
      return
    }

    // Fire-and-forget — query runs in main process regardless of navigation
    setQuerying(true, convId)
    if (aios) {
      const conv = useAppStore.getState().conversations.find((c) => c.id === convId)
      aios.query({
        prompt,
        conversationId: convId,
        sessionId: conv?.sessionId,
        apiKey: config.apiKey,
      }).catch(() => {}) // errors handled via sdk:error event
    }
  }

  const handleStop = () => {
    const aios = (window as any).aios
    if (aios) aios.abort()
    setQuerying(false)
    // Clear the queue so queued messages don't fire after stopping
    useAppStore.setState({ messageQueue: [] })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Add image from a native file path (Electron) — uses readImage IPC for preview
  const addImageFromPath = useCallback(async (nativePath: string, name: string, size: number) => {
    const aios = (window as any).aios
    let preview: string | undefined
    if (aios?.readImage) {
      try { preview = await aios.readImage(nativePath) } catch {}
    }
    setPastedImages((prev) => [
      ...prev,
      { name, size, path: nativePath, preview, isImage: true },
    ])
  }, [])

  // Add image from a blob (raw clipboard image data) — uses FileReader for preview
  const addImageFromBlob = useCallback((blob: File, mimeType: string) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]

      // Save to temp file via IPC (Electron) so it can be sent to Claude
      const aios = (window as any).aios
      let filePath: string | undefined
      if (aios?.saveTempImage) {
        try { filePath = await aios.saveTempImage(base64, mimeType) } catch {}
      }

      const ext = mimeType.split('/')[1] || 'png'
      setPastedImages((prev) => [
        ...prev,
        {
          name: blob.name || `pasted-image.${ext}`,
          size: blob.size,
          path: filePath,
          preview: dataUrl,
          isImage: true,
        },
      ])
    }
    reader.readAsDataURL(blob)
  }, [])

  // Handle Cmd+V paste of images from clipboard
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const aios = (window as any).aios

    // Check if clipboard has an image (file or raw screenshot)
    const files = e.clipboardData?.files
    const items = e.clipboardData?.items
    const hasImageFile = files && Array.from(files).some(f => isImageFile(f.name))
    const hasImageItem = items && Array.from(items).some(i => i.type.startsWith('image/'))

    if (!hasImageFile && !hasImageItem) return

    e.preventDefault()

    // Web mode: use FileReader + upload for all image pastes
    if (isWeb) {
      // Try clipboard files first
      if (hasImageFile) {
        for (const file of Array.from(files!)) {
          if (isImageFile(file.name)) {
            addImageFromBlob(file, file.type || 'image/png')
            return
          }
        }
      }
      // Then clipboard items (screenshots)
      if (hasImageItem) {
        for (const item of Array.from(items!)) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile()
            if (blob) { addImageFromBlob(blob, item.type); return }
          }
        }
      }
      return
    }

    // Electron: For files copied from Finder (Cmd+C on a file) — use native path
    if (hasImageFile) {
      for (const file of Array.from(files!)) {
        if (isImageFile(file.name) && aios?.getPathForFile) {
          try {
            const nativePath = aios.getPathForFile(file)
            if (nativePath) {
              addImageFromPath(nativePath, file.name, file.size)
              return
            }
          } catch {}
        }
      }
    }

    // Electron: For screenshots / raw clipboard images — use native clipboard API
    if (aios?.readClipboardImage) {
      try {
        const result = await aios.readClipboardImage()
        if (result?.dataUrl && result?.filePath) {
          setPastedImages((prev) => [
            ...prev,
            {
              name: `pasted-image.png`,
              size: 0,
              path: result.filePath,
              preview: result.dataUrl,
              isImage: true,
            },
          ])
          return
        }
      } catch {}
    }

    // Final fallback: FileReader on blob data
    if (hasImageItem) {
      for (const item of Array.from(items!)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) { addImageFromBlob(blob, item.type); return }
        }
      }
    }
  }, [addImageFromPath, addImageFromBlob])

  const removePastedImage = (index: number) => {
    setPastedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const aios = (window as any).aios
      const paths: string[] = []

      for (const f of files) {
        if (isWeb && aios?.uploadFile) {
          try { const p = await aios.uploadFile(f); if (p) paths.push(p) } catch {}
        } else if (aios?.getPathForFile) {
          try { const p = aios.getPathForFile(f); if (p) paths.push(p) } catch {}
        }

        // Also add image files to the pasted images for preview
        if (isImageFile(f.name)) {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            setPastedImages((prev) => [
              ...prev,
              { name: f.name, size: f.size, path: paths[paths.length - 1], preview: dataUrl, isImage: true },
            ])
          }
          reader.readAsDataURL(f)
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

  // Convert dropped image files to data URL previews
  const [droppedPreviews, setDroppedPreviews] = useState<Record<number, string>>({})
  useEffect(() => {
    const aios = (window as any).aios
    droppedFiles.forEach((f, i) => {
      if (isImageFile(f.name) && !droppedPreviews[i]) {
        // In Electron: use native path + readImage IPC (most reliable)
        if (aios?.getPathForFile && aios?.readImage) {
          try {
            const nativePath = aios.getPathForFile(f)
            if (nativePath) {
              aios.readImage(nativePath).then((dataUrl: string) => {
                setDroppedPreviews((prev) => ({ ...prev, [i]: dataUrl }))
              }).catch(() => {})
              return
            }
          } catch {}
        }
        // Fallback: FileReader
        const reader = new FileReader()
        reader.onload = () => {
          setDroppedPreviews((prev) => ({ ...prev, [i]: reader.result as string }))
        }
        reader.readAsDataURL(f)
      }
    })
    // Clean up stale entries
    if (droppedFiles.length === 0 && Object.keys(droppedPreviews).length > 0) {
      setDroppedPreviews({})
    }
  }, [droppedFiles])

  const allAttachments = [
    ...droppedFiles.map((f, i) => ({
      name: f.name,
      size: f.size,
      isImage: isImageFile(f.name),
      preview: droppedPreviews[i],
      dropIndex: i,
    })),
    ...pastedImages.map((img, i) => ({ ...img, pasteIndex: i })),
  ]

  return (
    <div className="relative border-t border-white/[0.04] bg-[#0c0c0e] px-2 pb-2 pt-2 md:px-4 md:pb-4 md:pt-3 safe-area-bottom">
      {/* Slash command palette */}
      <CommandPalette
        query={slashQuery}
        onSelect={handleCommandSelect}
        onClose={() => setShowCommands(false)}
        visible={showCommands}
      />
      <div className="max-w-3xl mx-auto">
        {/* Attached images — shown as a row of previews above input */}
        {allAttachments.some((a) => a.isImage && a.preview) && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {allAttachments.filter((a) => a.isImage && a.preview).map((att, idx) => (
              <div key={`img-${idx}`} className="relative group shrink-0">
                <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#141416]">
                  <img
                    src={att.preview}
                    alt={att.name}
                    className="max-h-32 max-w-48 object-contain"
                  />
                  <button
                    onClick={() => {
                      if ('dropIndex' in att) onRemoveFile?.(att.dropIndex as number)
                      else if ('pasteIndex' in att) removePastedImage(att.pasteIndex as number)
                    }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/80 text-white/80 hover:text-white text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                  >
                    ×
                  </button>
                </div>
                <div className="text-[10px] text-neutral-600 mt-1 text-center truncate max-w-48">
                  {att.name} · {formatFileSize(att.size)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Attached non-image files */}
        {allAttachments.some((a) => !a.isImage || !a.preview) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {allAttachments.filter((a) => !a.isImage || !a.preview).map((att, idx) => (
              <div
                key={`file-${idx}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs group"
              >
                <span>{getFileIcon(att.name)}</span>
                <span className="text-neutral-300 max-w-[150px] truncate">{att.name}</span>
                <span className="text-neutral-600">{formatFileSize(att.size)}</span>
                <button
                  onClick={() => {
                    if ('dropIndex' in att) onRemoveFile?.(att.dropIndex as number)
                    else if ('pasteIndex' in att) removePastedImage(att.pasteIndex as number)
                  }}
                  className="text-neutral-600 hover:text-red-400 ml-0.5"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="relative bg-[#141416] rounded-2xl border border-white/[0.06] accent-ring transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Message AIOS..."
            rows={1}
            className="w-full bg-transparent text-neutral-100 px-4 py-3.5 pr-28 resize-none focus:outline-none placeholder:text-neutral-600 text-sm leading-relaxed"
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
              <div className="flex items-center gap-1.5">
                {messageQueue.length > 0 && (
                  <span className="px-2 py-1 rounded-lg accent-bg-15 accent-text text-[10px] font-medium tabular-nums">
                    {messageQueue.length} queued
                  </span>
                )}
                <button
                  onClick={handleStop}
                  className="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-all active:scale-95"
                >
                  Stop
                </button>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() && allAttachments.length === 0}
                className="p-2 rounded-xl accent-bg text-white hover:brightness-90 transition-all disabled:opacity-20 disabled:cursor-not-allowed active:scale-95"
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
