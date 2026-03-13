import { useState } from 'react'
import type { ToolCall } from '../types'

const TOOL_ICONS: Record<string, string> = {
  Read: '📄', Write: '✏️', Edit: '🔧', Bash: '⚡', Glob: '🔍', Grep: '🔎',
  Agent: '🤖', WebFetch: '🌐', WebSearch: '🔍', Skill: '⭐',
  ListMcpResourcesTool: '🔌', ReadMcpResourceTool: '🔌',
  NotebookEdit: '📓', TaskCreate: '📋', TaskUpdate: '📋',
  default: '🔨',
}

export default function ToolCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const icon = TOOL_ICONS[tool.name] || TOOL_ICONS.default
  const isRunning = tool.status === 'running'
  const hasOutput = !!tool.output

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden transition-all">
      <div
        className={`flex items-center gap-2 px-3 py-2 text-xs ${hasOutput ? 'cursor-pointer hover:bg-white/[0.02]' : ''}`}
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <span className="text-sm">{icon}</span>
        <span className="font-mono text-neutral-300">{tool.name}</span>
        {tool.input?.file_path && (
          <span className="text-neutral-500 truncate max-w-[250px] font-mono">{tool.input.file_path.split('/').pop()}</span>
        )}
        {tool.input?.command && (
          <span className="text-neutral-500 truncate max-w-[250px] font-mono">{tool.input.command}</span>
        )}
        {tool.input?.pattern && (
          <span className="text-neutral-500 truncate max-w-[200px] font-mono">{tool.input.pattern}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {isRunning && (
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
              <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" style={{ animationDelay: '300ms' }} />
            </span>
          )}
          {tool.status === 'done' && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          {tool.status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
          {hasOutput && (
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none"
              className={`text-neutral-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </div>
      {expanded && tool.output && (
        <div className="px-3 pb-2 pt-0">
          <div className="text-[11px] text-neutral-500 font-mono bg-white/[0.02] rounded-lg p-2 max-h-48 overflow-y-auto whitespace-pre-wrap border border-white/[0.03]">
            {tool.output}
          </div>
        </div>
      )}
    </div>
  )
}
