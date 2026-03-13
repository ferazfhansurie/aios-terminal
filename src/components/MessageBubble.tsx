import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useState } from 'react'
import type { Message } from '../types'
import ToolCard from './ToolCard'
import logo from '../assets/logo.png'

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

export default function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-5">
        <div className="max-w-[70%] bg-orange-500/10 text-neutral-100 rounded-2xl rounded-br-sm px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed border border-orange-500/10">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5 flex gap-3">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <img src={logo} alt="AIOS" className="w-7 h-7 rounded-lg" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Thinking */}
        {message.thinking && (
          <details className="mb-3">
            <summary className="text-[11px] text-neutral-500 cursor-pointer hover:text-neutral-400 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="5" />
              </svg>
              Thinking...
            </summary>
            <div className="mt-2 text-xs text-neutral-500 bg-white/[0.02] rounded-xl p-3 font-mono whitespace-pre-wrap leading-relaxed border border-white/[0.04]">
              {message.thinking}
            </div>
          </details>
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolCalls.map((tool, i) => (
              <ToolCard key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        )}

        {/* Content */}
        {message.content && (
          <div className="text-sm text-neutral-200 leading-relaxed aios-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ children, ...props }) => {
                  const codeText = (children as any)?.props?.children || ''
                  return (
                    <div className="relative group/code my-3">
                      <pre className="bg-[#111113] border border-white/[0.06] rounded-xl p-4 overflow-x-auto text-[13px]" {...props}>
                        {children}
                      </pre>
                      <CopyButton text={String(codeText)} />
                    </div>
                  )
                },
                code: ({ className, children, ...props }) => {
                  const isInline = !className
                  if (isInline) {
                    return (
                      <code className="bg-white/[0.06] text-orange-300 px-1.5 py-0.5 rounded-md text-[13px] font-mono" {...props}>
                        {children}
                      </code>
                    )
                  }
                  return (
                    <code className={`font-mono text-[13px] ${className || ''}`} {...props}>
                      {children}
                    </code>
                  )
                },
                a: ({ children, ...props }) => (
                  <a className="text-orange-400 hover:text-orange-300 underline underline-offset-2 decoration-orange-400/30" {...props}>
                    {children}
                  </a>
                ),
                table: ({ children, ...props }) => (
                  <div className="overflow-x-auto my-3 rounded-xl border border-white/[0.06]">
                    <table className="w-full text-sm" {...props}>{children}</table>
                  </div>
                ),
                th: ({ children, ...props }) => (
                  <th className="text-left px-3 py-2 bg-white/[0.04] text-neutral-300 font-medium text-xs border-b border-white/[0.06]" {...props}>{children}</th>
                ),
                td: ({ children, ...props }) => (
                  <td className="px-3 py-2 border-b border-white/[0.03] text-neutral-400" {...props}>{children}</td>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Streaming dots */}
        {message.isStreaming && !message.content && (
          <div className="flex gap-1.5 py-3">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  )
}
