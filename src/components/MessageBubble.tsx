import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useState, useEffect } from 'react'
import type { Message, ContentBlock, ToolCall } from '../types'
import ToolCard from './ToolCard'
import logo from '../assets/logo.png'

/**
 * Pre-process AI text before markdown rendering.
 * Fixes decorative separators (====, ────) that markdown misinterprets
 * as setext headings or thematic breaks.
 */
function preprocessMarkdown(text: string): string {
  return text
    // Lines that are ONLY decorative chars (═ = ─ — ━) → thin hr
    .replace(/^[═=─—━\s]{4,}$/gm, '---')
    // Decorative chars followed by text, e.g. "======= AIOS — Business Brief"
    .replace(/^[═=]{3,}\s*(.+)$/gm, '## $1')
    // Section headers like "─────── SALES ───────" or "——— OPERATIONS ———"
    .replace(/^[─—━\-]{2,}\s*(.+?)\s*[─—━\-]{2,}\s*$/gm, '### $1')
    // Standalone decorative dash lines
    .replace(/^[─—━]{3,}\s*$/gm, '---')
    // Convert file paths to clickable links (outputs/*, docs/*, .claude/*, etc.)
    // Avoids paths already inside markdown links [text](url) or code blocks
    .replace(/(?<![`(\[\/])(?:\.\/)?((outputs|docs|\.claude|scripts)\/[^\s,)>\]`]+\.[a-z]{1,5})\b/gi, '[$1]($1)')
}

/** Check if an href looks like a local file path (not a URL) */
function isFilePath(href: string): boolean {
  if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) return false
  return /^(?:\.\/)?(?:outputs|docs|\.claude|scripts)\//.test(href) || /^[^:]+\.[a-z]{1,5}$/i.test(href)
}

/** Check if a file is a binary/non-text type that should open externally */
const BINARY_EXTS = /\.(pdf|docx|xlsx|pptx|png|jpg|jpeg|gif|webp|svg|bmp|zip|tar|gz|mp4|mp3|wav)$/i

/** Open a file path — binary files open externally, text files open in modal */
async function openFilePath(filePath: string, setPreviewFile: (p: string) => void) {
  if (BINARY_EXTS.test(filePath)) {
    const aios = (window as any).aios
    if (!aios?.openPath || !aios?.getAppInfo) return
    const info = await aios.getAppInfo()
    const fullPath = filePath.startsWith('/') ? filePath : `${info.cwd}/${filePath}`
    aios.openPath(fullPath)
  } else {
    setPreviewFile(filePath)
  }
}

/** Clickable file path button used in both link and inline code contexts */
function FilePathLink({ filePath, onClick }: { filePath: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      className="accent-text underline underline-offset-2 hover:brightness-125 inline-flex items-center gap-1 cursor-pointer font-mono text-[12.5px]"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-60">
        <path d="M4 1.5H9.5L12.5 4.5V14.5H4C3.44772 14.5 3 14.0523 3 13.5V2.5C3 1.94772 3.44772 1.5 4 1.5Z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9.5 1.5V4.5H12.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {filePath}
    </button>
  )
}

/** File Preview Modal */
function FilePreviewModal({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileName = filePath.split('/').pop() || filePath
  const isMarkdown = /\.md$/i.test(filePath)

  useEffect(() => {
    const aios = (window as any).aios
    if (!aios?.readFile) {
      setError('File reading not available')
      return
    }
    // Resolve relative paths against instance cwd
    const load = async () => {
      try {
        const info = await aios.getAppInfo()
        const fullPath = filePath.startsWith('/') ? filePath : `${info.cwd}/${filePath}`
        const text = await aios.readFile(fullPath)
        setContent(text)
      } catch (err: any) {
        setError(err?.message || 'Failed to read file')
      }
    }
    load()
  }, [filePath])

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenInEditor = async () => {
    const aios = (window as any).aios
    if (!aios?.getAppInfo) return
    const info = await aios.getAppInfo()
    const fullPath = filePath.startsWith('/') ? filePath : `${info.cwd}/${filePath}`
    // Dynamic import to avoid circular dependency
    const { useAppStore } = await import('../stores/app-store')
    useAppStore.getState().setEditingFile(fullPath)
    onClose()
  }

  const handleShowInFinder = async () => {
    const aios = (window as any).aios
    if (!aios?.showInFolder || !aios?.getAppInfo) return
    const info = await aios.getAppInfo()
    const fullPath = filePath.startsWith('/') ? filePath : `${info.cwd}/${filePath}`
    aios.showInFolder(fullPath)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[700px] max-w-[90vw] max-h-[80vh] bg-[#141416] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="w-7 h-7 rounded-lg accent-bg-10 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 1.5H9.5L12.5 4.5V14.5H4C3.44772 14.5 3 14.0523 3 13.5V2.5C3 1.94772 3.44772 1.5 4 1.5Z" stroke="currentColor" strokeWidth="1.2" className="accent-text" />
              <path d="M9.5 1.5V4.5H12.5" stroke="currentColor" strokeWidth="1.2" className="accent-text" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-neutral-200 truncate font-mono">{fileName}</div>
            <div className="text-[11px] text-neutral-500 truncate">{filePath}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-neutral-400 text-[11px] hover:bg-white/[0.08] hover:text-neutral-200 transition-all"
              title="Copy content"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleOpenInEditor}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-neutral-400 text-[11px] hover:bg-white/[0.08] hover:text-neutral-200 transition-all"
              title="Open in editor"
            >
              Edit
            </button>
            <button
              onClick={handleShowInFinder}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-neutral-400 text-[11px] hover:bg-white/[0.08] hover:text-neutral-200 transition-all"
              title="Show in Finder"
            >
              Finder
            </button>
            <button
              onClick={onClose}
              className="ml-1 px-1.5 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="text-sm text-red-400">{error}</div>
          ) : content === null ? (
            <div className="flex items-center justify-center py-8">
              <span className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
            </div>
          ) : isMarkdown ? (
            <div className="aios-prose">
              <MarkdownContent text={content} />
            </div>
          ) : (
            <pre className="text-[12.5px] text-neutral-300 font-mono whitespace-pre-wrap leading-relaxed">{content}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[10px] text-neutral-400 hover:text-neutral-200 transition-all opacity-0 group-hover/code:opacity-100"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

/** Detect if text is a skill/command template (step-by-step instructions, not actual output) */
function isSkillTemplate(text: string): boolean {
  // Must have step headers like "### Step 0:", "### Step 1:" etc.
  if (!/###\s+Step\s+\d+/i.test(text)) return false
  // And contain template placeholders like [date], [Name], or instruction language
  return /\[[A-Z][a-z]+\]/.test(text) || /\[.*?\]/.test(text) && /Present:|Flag:|Data:|Queries/i.test(text)
}

function MarkdownContent({ text }: { text: string }) {
  const [showTemplate, setShowTemplate] = useState(false)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const isTemplate = isSkillTemplate(text)

  if (isTemplate && !showTemplate) {
    // Extract the title from the first ## header
    const titleMatch = text.match(/^##\s+(.+)/m)
    const title = titleMatch?.[1]?.trim() || 'Command'
    return (
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.02] border border-white/[0.04] cursor-pointer hover:bg-white/[0.04] transition-colors"
        onClick={() => setShowTemplate(true)}
      >
        <svg className="w-3.5 h-3.5 text-neutral-600 shrink-0" viewBox="0 0 16 16" fill="none">
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[11px] text-neutral-500">
          Running <span className="accent-text font-medium">{title}</span>...
        </span>
      </div>
    )
  }

  const processed = preprocessMarkdown(text)
  return (
    <div className="text-[13.5px] text-neutral-200 leading-relaxed aios-prose">
      {isTemplate && (
        <button
          onClick={() => setShowTemplate(false)}
          className="text-[10px] text-neutral-600 hover:text-neutral-400 mb-2 transition-colors"
        >
          ▾ Hide template
        </button>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          pre: ({ children, ...props }) => {
            const codeText = (children as any)?.props?.children || ''
            return (
              <div className="relative group/code my-2.5">
                <pre className="bg-[#111113] border border-white/[0.06] rounded-xl p-3.5 overflow-x-auto text-[12.5px] leading-relaxed" {...props}>
                  {children}
                </pre>
                <CopyButton text={String(codeText)} />
              </div>
            )
          },
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              // Check if inline code content is a file path — make it clickable
              const text = String(children).replace(/\n$/, '')
              if (isFilePath(text)) {
                return <FilePathLink filePath={text} onClick={() => openFilePath(text, setPreviewFile)} />
              }
              return (
                <code className="bg-white/[0.06] accent-text px-1.5 py-0.5 rounded-md text-[12.5px] font-mono" {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className={`font-mono text-[12.5px] ${className || ''}`} {...props}>
                {children}
              </code>
            )
          },
          a: ({ children, href, ...props }) => {
            if (href && isFilePath(href)) {
              return <FilePathLink filePath={href} onClick={() => openFilePath(href, setPreviewFile)} />
            }
            return (
              <a className="accent-text underline underline-offset-2 hover:brightness-125" href={href} {...props}>
                {children}
              </a>
            )
          },
          p: ({ children, ...props }) => (
            <p className="mb-2 last:mb-0" {...props}>{children}</p>
          ),
          h1: ({ children, ...props }) => (
            <h1 className="text-lg font-bold text-neutral-100 mt-4 mb-2 first:mt-0 border-b border-white/[0.06] pb-1.5" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-base font-semibold text-neutral-100 mt-3.5 mb-1.5 first:mt-0" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-sm font-semibold text-neutral-200 mt-3 mb-1 first:mt-0" {...props}>{children}</h3>
          ),
          ul: ({ children, ...props }) => (
            <ul className="list-disc pl-5 mb-2 space-y-0.5" {...props}>{children}</ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...props}>{children}</ol>
          ),
          li: ({ children, ...props }) => (
            <li className="text-neutral-300 leading-relaxed [&>p]:mb-0.5" {...props}>{children}</li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-2 accent-border-50 pl-3 my-2 text-neutral-400 italic" {...props}>{children}</blockquote>
          ),
          hr: (props) => (
            <hr className="border-white/[0.06] my-3" {...props} />
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-semibold text-neutral-100" {...props}>{children}</strong>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-white/[0.06]">
              <table className="w-full text-[13px]" {...props}>{children}</table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th className="text-left px-3 py-2 bg-white/[0.04] text-neutral-200 font-semibold text-xs border-b border-white/[0.06]" {...props}>{children}</th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-3 py-2 border-b border-white/[0.04] text-neutral-300" {...props}>{children}</td>
          ),
          tr: ({ children, ...props }) => (
            <tr className="hover:bg-white/[0.02] transition-colors" {...props}>{children}</tr>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>

      {previewFile && (
        <FilePreviewModal filePath={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  )
}

/** Group consecutive blocks: consecutive tool blocks become a single scrollable group */
function groupBlocks(blocks: ContentBlock[]): { type: 'text'; block: ContentBlock; index: number }[] | { type: 'tools'; blocks: { block: ContentBlock; index: number }[] }[] {
  const groups: any[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.type === 'tool') {
      const last = groups[groups.length - 1]
      if (last && last.type === 'tools') {
        last.blocks.push({ block, index: i })
      } else {
        groups.push({ type: 'tools', blocks: [{ block, index: i }] })
      }
    } else {
      groups.push({ type: 'text', block, index: i })
    }
  }
  return groups
}

type ToolEntry = { block: ContentBlock; index: number }

function getToolFromEntry(entry: ToolEntry): ToolCall | null {
  return entry.block.type === 'tool' ? entry.block.tool : null
}

function ToolGroup({ tools }: { tools: ToolEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const count = tools.length
  const running = tools.filter(t => {
    const tool = getToolFromEntry(t)
    return tool && tool.status === 'running'
  }).length

  const renderTool = (entry: ToolEntry) => {
    const tool = getToolFromEntry(entry)
    if (!tool) return null
    return <ToolCard key={`tool-${tool.id || tool.name}-${entry.index}`} tool={tool} />
  }

  // Always show if 3 or fewer tools
  if (count <= 3) {
    return (
      <div className="my-2 space-y-1">
        {tools.map(renderTool)}
      </div>
    )
  }

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors mb-1 px-1"
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="font-medium">{count} tool calls</span>
        {running > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full accent-pulse animate-pulse" />
            <span className="accent-text">{running} running</span>
          </span>
        )}
      </button>
      {expanded ? (
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {tools.map(renderTool)}
        </div>
      ) : (
        <div className="space-y-1">
          {/* Show last 2 tools as preview */}
          {tools.slice(-2).map(renderTool)}
        </div>
      )}
    </div>
  )
}

function renderBlock(block: ContentBlock, index: number) {
  if (block.type === 'text' && block.text) {
    return <MarkdownContent key={`text-${index}`} text={block.text} />
  }
  if (block.type === 'tool') {
    const { tool } = block
    return (
      <div key={`tool-${tool.id || tool.name}-${index}`} className="my-2">
        <ToolCard tool={tool} />
      </div>
    )
  }
  return null
}

const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i

/** Extract image file paths from "Attached files:" section */
function extractImagePaths(text: string): { cleanText: string; imagePaths: string[] } {
  const imagePaths: string[] = []
  const lines = text.split('\n')
  const cleanLines: string[] = []
  let inAttached = false

  for (const line of lines) {
    if (/^Attached files:$/i.test(line.trim())) {
      inAttached = true
      continue
    }
    if (inAttached && line.trim().startsWith('- ')) {
      const filePath = line.trim().slice(2).trim()
      if (IMAGE_EXTS.test(filePath)) {
        imagePaths.push(filePath)
      } else {
        cleanLines.push(line)
      }
      continue
    }
    if (inAttached && !line.trim().startsWith('- ')) {
      inAttached = false
    }
    cleanLines.push(line)
  }

  return { cleanText: cleanLines.join('\n').trim(), imagePaths }
}

/** Render an image from a local file path via Electron bridge */
function InlineImage({ filePath }: { filePath: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const aios = (window as any).aios
    if (aios?.readImage) {
      aios.readImage(filePath).then((dataUrl: string) => setSrc(dataUrl)).catch(() => {})
    }
  }, [filePath])

  const name = filePath.split('/').pop() || 'image'
  if (!src) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-500 py-1">
        <span>🖼</span>
        <span>{name}</span>
      </div>
    )
  }

  return (
    <img src={src} alt={name} className="max-w-full max-h-64 rounded-xl mt-1" />
  )
}

/** Parse user message — detect commands/skills and return clean display */
function parseUserContent(raw: string): { display: string; isCommand: boolean } {
  // Detect <command-name>/brief</command-name> tags (SDK expanded format)
  const cmdNameMatch = raw.match(/<command-name>\s*(.*?)\s*<\/command-name>/)
  if (cmdNameMatch) {
    return { display: cmdNameMatch[1].trim(), isCommand: true }
  }
  // Detect <command-message> tags (SDK expanded format without command-name)
  if (raw.includes('<command-message>')) {
    const msgMatch = raw.match(/<command-message>\s*(.*?)\s*<\/command-message>/)
    return { display: msgMatch?.[1]?.trim() || 'Running command...', isCommand: true }
  }
  // Detect slash commands: "/brief", "/prime", "/brief " — short or long (expanded prompt)
  const slashMatch = raw.match(/^(\/\w+)/)
  if (slashMatch) {
    return { display: slashMatch[1], isCommand: true }
  }
  return { display: raw, isCommand: false }
}

export default function MessageBubble({ message }: { message: Message }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  if (message.role === 'user') {
    const { display, isCommand } = parseUserContent(message.content)
    const { cleanText, imagePaths } = isCommand ? { cleanText: display, imagePaths: [] } : extractImagePaths(display)

    const handleStartEdit = () => {
      setEditText(message.content)
      setEditing(true)
    }

    const handleSaveEdit = async () => {
      const trimmed = editText.trim()
      if (!trimmed || trimmed === message.content) {
        setEditing(false)
        return
      }
      setEditing(false)
      const { useAppStore } = await import('../stores/app-store')
      useAppStore.getState().editUserMessage(message.id, trimmed)
    }

    const handleCancelEdit = () => {
      setEditing(false)
      setEditText('')
    }

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSaveEdit()
      }
      if (e.key === 'Escape') {
        handleCancelEdit()
      }
    }

    return (
      <div className="flex justify-end mb-5 group/user">
        <div className="flex items-end gap-1.5 max-w-[90%] md:max-w-[70%]">
          {/* Edit button — appears on hover */}
          {!isCommand && !editing && (
            <button
              onClick={handleStartEdit}
              className="opacity-0 group-hover/user:opacity-100 transition-opacity p-1.5 rounded-lg text-neutral-600 hover:text-neutral-300 hover:bg-white/[0.06] shrink-0"
              title="Edit message"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5L13.5 4.5M10 4L2.5 11.5V13.5H4.5L12 6L10 4Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {editing ? (
            <div className="w-full rounded-2xl rounded-br-sm border accent-border-30 bg-[#111113] overflow-hidden">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full bg-transparent text-neutral-100 text-sm leading-relaxed p-3 resize-none focus:outline-none min-h-[60px]"
                rows={Math.min(editText.split('\n').length + 1, 8)}
              />
              <div className="flex items-center justify-end gap-2 px-3 pb-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.06] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium accent-bg text-white hover:brightness-110 transition-all"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className={`rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed border ${isCommand ? 'bg-white/[0.03] border-white/[0.06]' : 'accent-bg-10 accent-border-30 text-neutral-100'}`}>
              {isCommand ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full accent-bg" />
                  <span className="accent-text font-mono text-xs font-medium">{cleanText}</span>
                </span>
              ) : (
                <>
                  {cleanText && <span className="whitespace-pre-wrap">{cleanText}</span>}
                  {imagePaths.map((p, i) => (
                    <InlineImage key={i} filePath={p} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Use blocks for ordered rendering, fallback to old layout
  const hasBlocks = message.blocks && message.blocks.length > 0

  return (
    <div className="mb-5 flex gap-3">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <img src={logo} alt="AIOS" className="w-7 h-7 rounded-lg" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Thinking */}
        {message.thinking && (
          <details className="mb-3" open={message.isStreaming}>
            <summary className="text-[11px] text-neutral-500 cursor-pointer hover:text-neutral-400 flex items-center gap-1.5 select-none">
              {message.isStreaming && !message.content ? (
                <div className="flex gap-1">
                  <span className="w-1 h-1 rounded-full accent-pulse animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full accent-pulse animate-bounce" style={{ animationDelay: '100ms' }} />
                  <span className="w-1 h-1 rounded-full accent-pulse animate-bounce" style={{ animationDelay: '200ms' }} />
                </div>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1" />
                  <path d="M3.5 5L4.5 6L6.5 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span>{message.isStreaming && !message.content ? 'Thinking...' : 'Thought process'}</span>
            </summary>
            <div className="mt-2 text-xs text-neutral-500 bg-white/[0.02] rounded-xl p-3 font-mono whitespace-pre-wrap leading-relaxed border border-white/[0.04] max-h-64 overflow-y-auto">
              {message.thinking}
            </div>
          </details>
        )}

        {/* Interleaved blocks (text + tools in order) */}
        {hasBlocks ? (
          <div>
            {groupBlocks(message.blocks!).map((group: any, gi: number) => {
              if (group.type === 'tools') {
                return <ToolGroup key={`tg-${gi}`} tools={group.blocks} />
              }
              return renderBlock(group.block, group.index)
            })}
          </div>
        ) : (
          <>
            {/* Fallback: old layout for loaded-from-DB messages */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              message.toolCalls.length > 3 ? (
                <ToolGroup tools={message.toolCalls.map((tool, i) => ({ block: { type: 'tool' as const, tool }, index: i }))} />
              ) : (
                <div className="mb-2 space-y-1">
                  {message.toolCalls.map((tool, i) => (
                    <ToolCard key={`${tool.name}-${i}`} tool={tool} />
                  ))}
                </div>
              )
            )}
            {message.content && <MarkdownContent text={message.content} />}
          </>
        )}

        {/* Streaming dots — shown when streaming with no content yet */}
        {message.isStreaming && !message.content && !message.thinking && (
          <div className="flex gap-1.5 py-3">
            <span className="w-1.5 h-1.5 rounded-full accent-pulse animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full accent-pulse animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full accent-pulse animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  )
}
