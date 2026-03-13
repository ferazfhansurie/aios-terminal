import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../types'
import ToolCard from './ToolCard'

export default function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-orange-500/15 text-neutral-100 rounded-2xl rounded-br-md px-4 py-3 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4">
      {message.thinking && (
        <details className="mb-2">
          <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-400">
            Thinking...
          </summary>
          <div className="mt-1 text-xs text-neutral-500 bg-white/[0.02] rounded-lg p-3 font-mono whitespace-pre-wrap">
            {message.thinking}
          </div>
        </details>
      )}

      {message.toolCalls?.map((tool, i) => (
        <ToolCard key={`${tool.name}-${i}`} tool={tool} />
      ))}

      {message.content && (
        <div className="max-w-[80%] text-sm text-neutral-200 prose prose-invert prose-sm max-w-none
          prose-pre:bg-[#141416] prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-lg
          prose-code:text-orange-300 prose-code:font-mono prose-code:text-xs
          prose-a:text-orange-400 prose-a:no-underline hover:prose-a:underline
          prose-headings:text-neutral-100 prose-strong:text-neutral-100">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {message.isStreaming && !message.content && (
        <div className="flex gap-1 py-2">
          <span className="w-2 h-2 rounded-full bg-orange-500/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-orange-500/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-orange-500/50 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}
    </div>
  )
}
