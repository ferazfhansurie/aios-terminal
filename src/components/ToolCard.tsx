import type { ToolCall } from '../types'

const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '🔧',
  Bash: '⚡',
  Glob: '🔍',
  Grep: '🔎',
  default: '🔨',
}

export default function ToolCard({ tool }: { tool: ToolCall }) {
  const icon = TOOL_ICONS[tool.name] || TOOL_ICONS.default
  const isRunning = tool.status === 'running'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-neutral-400 my-1">
      <span>{icon}</span>
      <span className="font-mono">{tool.name}</span>
      {tool.input?.file_path && (
        <span className="text-neutral-500 truncate max-w-[300px]">{tool.input.file_path}</span>
      )}
      {tool.input?.command && (
        <span className="text-neutral-500 truncate max-w-[300px] font-mono">{tool.input.command}</span>
      )}
      {isRunning && <span className="ml-auto animate-pulse text-orange-400">running</span>}
      {tool.status === 'done' && <span className="ml-auto text-green-400">done</span>}
      {tool.status === 'error' && <span className="ml-auto text-red-400">error</span>}
    </div>
  )
}
