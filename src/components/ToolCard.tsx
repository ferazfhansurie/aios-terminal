import { useState, useEffect } from 'react'
import type { ToolCall } from '../types'

const TOOL_ICONS: Record<string, string> = {
  Read: '📄', Write: '✏️', Edit: '🔧', Bash: '⚡', Glob: '🔍', Grep: '🔎',
  Agent: '🤖', WebFetch: '🌐', WebSearch: '🔍', Skill: '⭐',
  ListMcpResourcesTool: '🔌', ReadMcpResourceTool: '🔌',
  NotebookEdit: '📓', TaskCreate: '📋', TaskUpdate: '📋',
  default: '🔨',
}

function formatInput(tool: ToolCall): string {
  if (!tool.input) return ''
  const inp = tool.input

  // Show the most relevant field per tool type
  switch (tool.name) {
    case 'Read':
      return inp.file_path?.split('/').slice(-2).join('/') || ''
    case 'Write':
      return inp.file_path?.split('/').slice(-2).join('/') || ''
    case 'Edit':
      return inp.file_path?.split('/').slice(-2).join('/') || ''
    case 'Bash':
      return inp.command || ''
    case 'Glob':
      return inp.pattern || ''
    case 'Grep':
      return inp.pattern || ''
    case 'Agent':
      return inp.description || inp.prompt?.slice(0, 80) || ''
    case 'Skill':
      return inp.skill || ''
    case 'WebFetch':
    case 'WebSearch':
      return inp.url || inp.query || ''
    default:
      // For MCP tools, show first string value
      for (const val of Object.values(inp)) {
        if (typeof val === 'string' && val.length < 100) return val
      }
      return ''
  }
}

function getInputDetails(tool: ToolCall): { label: string; value: string }[] {
  if (!tool.input) return []
  const details: { label: string; value: string }[] = []
  const inp = tool.input

  for (const [key, val] of Object.entries(inp)) {
    if (val === null || val === undefined) continue
    const strVal = typeof val === 'string' ? val :
      typeof val === 'number' || typeof val === 'boolean' ? String(val) :
      JSON.stringify(val, null, 2)
    if (strVal.length > 0) {
      details.push({ label: key, value: strVal })
    }
  }
  return details
}

export default function ToolCard({ tool }: { tool: ToolCall }) {
  const [manualToggle, setManualToggle] = useState<boolean | null>(null)
  const icon = TOOL_ICONS[tool.name] || TOOL_ICONS.default
  const isRunning = tool.status === 'running'
  const summary = formatInput(tool)
  const hasDetails = !!tool.input || !!tool.output
  // Auto-expand running tools, collapse when done (unless manually toggled)
  const expanded = manualToggle !== null ? manualToggle : isRunning

  // Running timer
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isRunning) { setElapsed(0); return }
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [isRunning])

  return (
    <div className={`rounded-lg overflow-hidden transition-all text-xs ${isRunning ? 'bg-white/[0.03] border border-white/[0.08]' : 'bg-white/[0.02] border border-white/[0.04]'}`}>
      {/* Header — always clickable */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setManualToggle(expanded ? false : true)}
      >
        {/* Status indicator */}
        {isRunning ? (
          <span className="w-3 h-3 shrink-0 relative flex items-center justify-center">
            <span className="absolute w-3 h-3 rounded-full accent-bg-20 animate-ping" />
            <span className="w-1.5 h-1.5 rounded-full accent-bg" />
          </span>
        ) : tool.status === 'done' ? (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500/80 shrink-0" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        )}

        <span className="text-[11px]">{icon}</span>
        <span className={`font-mono font-medium ${isRunning ? 'accent-text' : 'text-neutral-300'}`}>{tool.name}</span>

        {/* Summary */}
        {summary && (
          <span className="text-neutral-500 truncate font-mono flex-1 min-w-0">
            {summary.length > 80 ? summary.slice(0, 80) + '…' : summary}
          </span>
        )}

        {/* Running timer */}
        {isRunning && elapsed > 0 && (
          <span className="text-[10px] text-neutral-600 font-mono shrink-0">{elapsed}s</span>
        )}

        {/* Expand chevron */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={`text-neutral-600 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/[0.04]">
          {/* Input details */}
          {tool.input && (
            <div className="px-3 py-2">
              <div className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1.5 font-medium">Input</div>
              <div className="space-y-1.5">
                {getInputDetails(tool).map(({ label, value }) => (
                  <div key={label}>
                    <span className="text-neutral-600 font-mono">{label}: </span>
                    {value.includes('\n') || value.length > 100 ? (
                      <pre className="mt-1 text-[11px] text-neutral-400 font-mono bg-[#0e0e10] rounded-lg p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap border border-white/[0.03]">
                        {value}
                      </pre>
                    ) : (
                      <span className="text-neutral-400 font-mono">{value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output */}
          {tool.output && (
            <div className="px-3 py-2 border-t border-white/[0.04]">
              <div className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1.5 font-medium">Output</div>
              <pre className="text-[11px] text-neutral-400 font-mono bg-[#0e0e10] rounded-lg p-2 max-h-64 overflow-y-auto overflow-x-auto whitespace-pre-wrap border border-white/[0.03] leading-relaxed">
                {tool.output.length > 5000 ? tool.output.slice(0, 5000) + '\n... (truncated)' : tool.output}
              </pre>
            </div>
          )}

          {/* Running state with no output yet */}
          {isRunning && !tool.output && (
            <div className="px-3 py-2 border-t border-white/[0.04]">
              <div className="flex items-center gap-2 text-neutral-600">
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full accent-pulse animate-pulse" />
                  <span className="w-1 h-1 rounded-full accent-pulse animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full accent-pulse animate-pulse" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="text-[11px]">Running...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
