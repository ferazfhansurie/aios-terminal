import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'

const THEME_PRESETS = [
  { name: 'AIOS', primaryColor: '#f97316', darkBg: '#0a0a0c', description: 'Default orange' },
  { name: 'Blue', primaryColor: '#3b82f6', darkBg: '#0f172a', description: 'Professional blue' },
  { name: 'Green', primaryColor: '#10b981', darkBg: '#0f1419', description: 'Vibrant green' },
  { name: 'Purple', primaryColor: '#8b5cf6', darkBg: '#1e1b4b', description: 'Modern purple' },
  { name: 'Pink', primaryColor: '#ec4899', darkBg: '#18181b', description: 'Creative pink' },
]

interface McpServer {
  command: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

const MCP_PRESETS: { name: string; label: string; description: string; server: McpServer }[] = [
  {
    name: 'filesystem', label: 'Filesystem', description: 'Read, write, and manage files',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory'] },
  },
  {
    name: 'postgres', label: 'PostgreSQL', description: 'Query PostgreSQL databases',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'], env: { DATABASE_URL: 'postgresql://user:password@host:5432/db' } },
  },
  {
    name: 'github', label: 'GitHub', description: 'Issues, PRs, repos, and more',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' } },
  },
  {
    name: 'slack', label: 'Slack', description: 'Read and send Slack messages',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' } },
  },
  {
    name: 'brave-search', label: 'Brave Search', description: 'Web search via Brave API',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '' } },
  },
  {
    name: 'google-maps', label: 'Google Maps', description: 'Geocoding, directions, places',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-google-maps'], env: { GOOGLE_MAPS_API_KEY: '' } },
  },
]

// --- MCP Server Card ---
function McpServerCard({
  name, server, onUpdate, onDelete,
}: {
  name: string; server: McpServer
  onUpdate: (name: string, server: McpServer) => void
  onDelete: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editCommand, setEditCommand] = useState(server.command)
  const [editArgs, setEditArgs] = useState(server.args?.join(' ') || '')
  const [editEnv, setEditEnv] = useState(
    Object.entries(server.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')
  )
  const [editUrl, setEditUrl] = useState(server.url || '')
  const isSSE = !!server.url

  const handleSave = () => {
    const envObj: Record<string, string> = {}
    editEnv.split('\n').filter(Boolean).forEach((line) => {
      const idx = line.indexOf('=')
      if (idx > 0) envObj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })
    if (isSSE || editUrl) {
      onUpdate(name, { command: '', url: editUrl, env: Object.keys(envObj).length > 0 ? envObj : undefined })
    } else {
      onUpdate(name, {
        command: editCommand,
        args: editArgs.trim() ? editArgs.trim().split(/\s+/) : undefined,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
      })
    }
    setExpanded(false)
  }

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => setExpanded(!expanded)}>
        <span className="w-2 h-2 rounded-full bg-green-500/80 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-200 font-mono">{name}</div>
          <div className="text-[11px] text-neutral-500 truncate">
            {isSSE ? server.url : `${server.command} ${server.args?.join(' ') || ''}`}
          </div>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-neutral-600 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-3 space-y-3 bg-white/[0.01]">
          {isSSE || editUrl ? (
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">SSE URL</label>
              <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="http://localhost:3000/sse" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Command</label>
                <input value={editCommand} onChange={(e) => setEditCommand(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="npx" />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Arguments</label>
                <input value={editArgs} onChange={(e) => setEditArgs(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="-y @modelcontextprotocol/server-name" />
              </div>
            </>
          )}
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Environment Variables <span className="text-neutral-600">(KEY=value, one per line)</span></label>
            <textarea value={editEnv} onChange={(e) => setEditEnv(e.target.value)} rows={Math.max(2, editEnv.split('\n').length)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12] resize-none" placeholder="API_KEY=your-key-here" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} className="px-3 py-1.5 rounded-lg accent-bg text-white text-xs font-medium hover:brightness-90 transition-all">Save</button>
            <button onClick={() => setExpanded(false)} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-neutral-400 text-xs font-medium hover:bg-white/[0.1] transition-all">Cancel</button>
            <div className="flex-1" />
            <button onClick={() => onDelete(name)} className="px-3 py-1.5 rounded-lg text-red-400 text-xs font-medium hover:bg-red-500/10 transition-all">Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Add Connector Modal ---
function AddServerModal({ onAdd, onClose }: { onAdd: (name: string, server: McpServer) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'preset' | 'custom' | 'sse'>('preset')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [env, setEnv] = useState('')

  const handlePreset = (preset: typeof MCP_PRESETS[0]) => onAdd(preset.name, preset.server)

  const handleCustom = () => {
    if (!name.trim()) return
    const envObj: Record<string, string> = {}
    env.split('\n').filter(Boolean).forEach((line) => {
      const idx = line.indexOf('=')
      if (idx > 0) envObj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })
    if (mode === 'sse') {
      onAdd(name.trim(), { command: '', url, env: Object.keys(envObj).length > 0 ? envObj : undefined })
    } else {
      onAdd(name.trim(), {
        command: command || 'npx',
        args: args.trim() ? args.trim().split(/\s+/) : undefined,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[520px] max-h-[80vh] bg-[#141416] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-base font-semibold text-neutral-100">Add Connector</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Connect tools, databases, and APIs to AIOS</p>
        </div>
        <div className="flex gap-1 px-5 pt-3">
          {(['preset', 'custom', 'sse'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === m ? 'accent-bg-15 accent-text' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04]'}`}>
              {m === 'preset' ? 'Popular' : m === 'custom' ? 'Custom (stdio)' : 'Remote (SSE)'}
            </button>
          ))}
        </div>
        <div className="px-5 py-4 overflow-y-auto max-h-[50vh]">
          {mode === 'preset' && (
            <div className="grid grid-cols-2 gap-2">
              {MCP_PRESETS.map((preset) => (
                <button key={preset.name} onClick={() => handlePreset(preset)} className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02] transition-all text-left group">
                  <div className="w-8 h-8 rounded-lg accent-bg-10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm accent-text font-bold">{preset.label.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-200 group-hover:text-neutral-100">{preset.label}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{preset.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {mode === 'custom' && (
            <div className="space-y-3">
              <div><label className="text-[11px] text-neutral-500 block mb-1">Connector Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="my-server" autoFocus /></div>
              <div><label className="text-[11px] text-neutral-500 block mb-1">Command</label><input value={command} onChange={(e) => setCommand(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="npx" /></div>
              <div><label className="text-[11px] text-neutral-500 block mb-1">Arguments</label><input value={args} onChange={(e) => setArgs(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="-y @modelcontextprotocol/server-name /path" /></div>
              <div><label className="text-[11px] text-neutral-500 block mb-1">Environment Variables</label><textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12] resize-none" placeholder="API_KEY=your-key-here" /></div>
              <button onClick={handleCustom} disabled={!name.trim()} className="w-full px-4 py-2.5 rounded-xl accent-bg text-white text-sm font-medium hover:brightness-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed">Add Connector</button>
            </div>
          )}
          {mode === 'sse' && (
            <div className="space-y-3">
              <div><label className="text-[11px] text-neutral-500 block mb-1">Connector Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="my-remote-server" autoFocus /></div>
              <div><label className="text-[11px] text-neutral-500 block mb-1">SSE URL</label><input value={url} onChange={(e) => setUrl(e.target.value)} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]" placeholder="http://localhost:3000/sse" /></div>
              <div><label className="text-[11px] text-neutral-500 block mb-1">Environment Variables <span className="text-neutral-600">(optional)</span></label><textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={2} className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12] resize-none" placeholder="API_KEY=your-key-here" /></div>
              <button onClick={handleCustom} disabled={!name.trim() || !url.trim()} className="w-full px-4 py-2.5 rounded-xl accent-bg text-white text-sm font-medium hover:brightness-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed">Add Connector</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- WA Types ---
interface WaConnection {
  id: string
  name: string
  instancePath: string
  status: 'offline' | 'disconnected' | 'qr' | 'connecting' | 'ready' | 'error'
  phoneNumber?: string | null
  qrDataUrl?: string | null
  uptime?: number
  lastError?: string | null
  sessionExists?: boolean
}

const WA_STATUS_LABELS: Record<string, { text: string; color: string }> = {
  offline: { text: 'Offline', color: 'bg-neutral-600' },
  disconnected: { text: 'Disconnected', color: 'bg-red-500/60' },
  qr: { text: 'Scan QR', color: 'bg-yellow-500/80 animate-pulse' },
  connecting: { text: 'Connecting', color: 'bg-yellow-500/80 animate-pulse' },
  ready: { text: 'Connected', color: 'bg-green-500/80' },
  error: { text: 'Error', color: 'bg-red-500/80' },
}

// --- WhatsApp Connection Card ---
function WaConnectionCard({
  conn,
  onConnect,
  onDisconnect,
  onRemove,
  connecting,
}: {
  conn: WaConnection
  onConnect: () => void
  onDisconnect: () => void
  onRemove: () => void
  connecting: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const info = WA_STATUS_LABELS[conn.status] || WA_STATUS_LABELS.offline
  const isIdle = conn.status === 'offline' || conn.status === 'disconnected' || conn.status === 'error'

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${info.color}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-200">{conn.name}</div>
          <div className="text-[11px] text-neutral-500 truncate">
            {conn.status === 'ready' && conn.phoneNumber
              ? conn.phoneNumber
              : conn.instancePath}
          </div>
        </div>
        <span className="text-[10px] text-neutral-500 shrink-0">{info.text}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-neutral-600 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-3 space-y-3 bg-white/[0.01]">
          {/* Session indicator */}
          {conn.sessionExists && isIdle && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600/5 border border-green-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
              <span className="text-[11px] text-green-400/80">Existing session found</span>
            </div>
          )}

          {/* Instance path (hide in web mode) */}
          {!(window as any).__AIOS_WEB__ && conn.instancePath && (
            <div className="text-[11px] text-neutral-500">
              <span className="text-neutral-600">Path:</span> <span className="font-mono">{conn.instancePath}</span>
            </div>
          )}

          {/* QR Code */}
          {conn.status === 'qr' && conn.qrDataUrl && (
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="text-sm text-neutral-300 font-medium">Scan with WhatsApp</div>
              <div className="bg-white p-3 rounded-xl">
                <img src={conn.qrDataUrl} alt="QR Code" className="w-48 h-48" />
              </div>
              <div className="text-[11px] text-neutral-500">Open WhatsApp &gt; Linked Devices &gt; Link a Device</div>
            </div>
          )}

          {/* Connecting spinner */}
          {conn.status === 'connecting' && (
            <div className="flex items-center justify-center gap-2 py-3">
              <span className="w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
              <span className="text-sm text-neutral-400">Connecting...</span>
            </div>
          )}

          {/* Connected info */}
          {conn.status === 'ready' && conn.phoneNumber && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-600/10 border border-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-500/80" />
              <div className="flex-1">
                <div className="text-sm text-green-400 font-medium">{conn.phoneNumber}</div>
                {conn.uptime !== undefined && (
                  <div className="text-[11px] text-neutral-500">
                    Uptime: {Math.floor(conn.uptime / 60)}m {conn.uptime % 60}s
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {conn.status === 'error' && conn.lastError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-xs text-red-400">{conn.lastError}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {isIdle ? (
              <button
                onClick={onConnect}
                disabled={connecting}
                className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                {connecting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connecting...
                  </>
                ) : (
                  conn.sessionExists ? 'Reconnect' : 'Connect'
                )}
              </button>
            ) : (
              <button
                onClick={onDisconnect}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-neutral-300 text-xs font-medium hover:bg-white/[0.1] transition-all"
              >
                Disconnect
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={onRemove}
              className="px-3 py-1.5 rounded-lg text-red-400 text-xs font-medium hover:bg-red-500/10 transition-all"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============== MAIN SETTINGS VIEW ==============
export default function SettingsView() {
  const { config, setConfig } = useAppStore()

  // MCP state
  const [mcpServers, setMcpServers] = useState<Record<string, McpServer>>({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [mcpLoaded, setMcpLoaded] = useState(false)

  // WhatsApp (multi-connection) state
  const [waConnections, setWaConnections] = useState<WaConnection[]>([])
  const [waLoaded, setWaLoaded] = useState(false)
  const [waConnectingIds, setWaConnectingIds] = useState<Set<string>>(new Set())
  const [waShowAdd, setWaShowAdd] = useState(false)
  const [waNewName, setWaNewName] = useState('')
  const [waNewPath, setWaNewPath] = useState('')
  const [waInstancePath, setWaInstancePath] = useState('') // active instance path for config storage

  // --- Load MCP ---
  useEffect(() => {
    const aios = (window as any).aios
    if (!aios?.getMcpServers) { setMcpLoaded(true); return }
    aios.getMcpServers()
      .then((servers: Record<string, McpServer>) => { setMcpServers(servers || {}); setMcpLoaded(true) })
      .catch(() => setMcpLoaded(true))
  }, [])

  // --- Load WhatsApp connections ---
  useEffect(() => {
    const aios = (window as any).aios
    if (!aios) { setWaLoaded(true); return }

    const loadWa = async () => {
      try {
        const appInfo = await aios.getAppInfo()
        const instPath = appInfo?.cwd || ''
        setWaInstancePath(instPath)
        setWaNewPath(instPath) // default new connection path

        if (aios.listWhatsAppConnections) {
          const conns: WaConnection[] = await aios.listWhatsAppConnections(instPath)
          setWaConnections(conns || [])
        }
      } catch {}
      setWaLoaded(true)
    }
    loadWa()

    // Real-time status updates
    let unsub: (() => void) | undefined
    if (aios.onWhatsAppStatusChanged) {
      unsub = aios.onWhatsAppStatusChanged((data: { connectionId?: string; connections: WaConnection[] }) => {
        setWaConnections(data.connections || [])
        if (data.connectionId) {
          const conn = data.connections?.find((c: WaConnection) => c.id === data.connectionId)
          if (conn && (conn.status === 'ready' || conn.status === 'offline' || conn.status === 'error')) {
            setWaConnectingIds((prev) => {
              const next = new Set(prev)
              next.delete(data.connectionId!)
              return next
            })
          }
        }
      })
    }
    return () => { unsub?.() }
  }, [])

  // --- MCP helpers ---
  const saveMcp = useCallback(async (servers: Record<string, McpServer>) => {
    setMcpServers(servers)
    const aios = (window as any).aios
    if (aios?.saveMcpServers) await aios.saveMcpServers(servers)
  }, [])

  const handleAddServer = useCallback((name: string, server: McpServer) => {
    saveMcp({ ...mcpServers, [name]: server })
    setShowAddModal(false)
  }, [mcpServers, saveMcp])

  const handleUpdateServer = useCallback((name: string, server: McpServer) => {
    saveMcp({ ...mcpServers, [name]: server })
  }, [mcpServers, saveMcp])

  const handleDeleteServer = useCallback((name: string) => {
    const updated = { ...mcpServers }
    delete updated[name]
    saveMcp(updated)
  }, [mcpServers, saveMcp])

  // --- WhatsApp helpers ---
  const addWaConnection = useCallback(async () => {
    const aios = (window as any).aios
    const isWeb = !!(window as any).__AIOS_WEB__
    if (!aios?.addWhatsAppConnection || !waNewName.trim() || (!isWeb && !waNewPath.trim())) return
    const id = `aios-${waNewName.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`
    await aios.addWhatsAppConnection({
      id,
      name: waNewName.trim(),
      instancePath: waNewPath.trim(),
      configInstancePath: waInstancePath,
    })
    // Refresh list
    const conns = await aios.listWhatsAppConnections(waInstancePath)
    setWaConnections(conns || [])
    setWaNewName('')
    setWaShowAdd(false)
  }, [waNewName, waNewPath, waInstancePath])

  const connectWa = useCallback(async (connectionId: string) => {
    const aios = (window as any).aios
    if (!aios?.connectWhatsApp) return
    setWaConnectingIds((prev) => new Set(prev).add(connectionId))
    const result = await aios.connectWhatsApp(connectionId)
    if (!result.success) {
      setWaConnectingIds((prev) => {
        const next = new Set(prev)
        next.delete(connectionId)
        return next
      })
    }
  }, [])

  const disconnectWa = useCallback(async (connectionId: string) => {
    const aios = (window as any).aios
    if (!aios?.disconnectWhatsApp) return
    await aios.disconnectWhatsApp(connectionId)
  }, [])

  const removeWa = useCallback(async (connectionId: string) => {
    const aios = (window as any).aios
    if (!aios?.removeWhatsAppConnection) return
    await aios.removeWhatsAppConnection(connectionId, waInstancePath)
    setWaConnections((prev) => prev.filter((c) => c.id !== connectionId))
  }, [waInstancePath])

  // --- Theme ---
  const handleThemeChange = (theme: typeof THEME_PRESETS[0]) => {
    setConfig({ theme: { name: theme.name, primaryColor: theme.primaryColor, darkBg: theme.darkBg } })
  }

  const handleAppearance = (mode: 'dark' | 'light') => {
    setConfig({ appearance: mode })
  }

  const serverEntries = Object.entries(mcpServers)
  const connectedCount = waConnections.filter((c) => c.status === 'ready').length

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 pb-24">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-100 mb-1">Settings</h1>
          <p className="text-sm text-neutral-500">Customize your AIOS experience</p>
        </div>

        {/* Connectors */}
        <div className="bg-[#1a1a1e] rounded-xl border border-white/[0.08] p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Connectors</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Connect tools, databases, and APIs</p>
            </div>
            <button onClick={() => setShowAddModal(true)} className="px-3 py-1.5 rounded-lg accent-bg text-white text-xs font-medium hover:brightness-90 transition-all flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Add
            </button>
          </div>
          {!mcpLoaded ? (
            <div className="text-sm text-neutral-500 py-4 text-center">Loading...</div>
          ) : serverEntries.length === 0 ? (
            <div className="border border-dashed border-white/[0.08] rounded-xl py-8 text-center">
              <div className="text-neutral-600 text-sm mb-1">No connectors added</div>
              <div className="text-neutral-600 text-xs">Add connectors to give AIOS access to external tools and data</div>
            </div>
          ) : (
            <div className="space-y-2">
              {serverEntries.map(([name, server]) => (
                <McpServerCard key={name} name={name} server={server} onUpdate={handleUpdateServer} onDelete={handleDeleteServer} />
              ))}
            </div>
          )}
        </div>

        {/* WhatsApp (multi-connection) */}
        <div className="bg-[#1a1a1e] rounded-xl border border-white/[0.08] p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-600/15 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" strokeWidth="1.5"/></svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-100">WhatsApp</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {connectedCount > 0
                    ? `${connectedCount} connected`
                    : `${waConnections.length} connection${waConnections.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setWaShowAdd(!waShowAdd)}
              className="px-3 py-1.5 rounded-lg accent-bg text-white text-xs font-medium hover:brightness-90 transition-all flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Add
            </button>
          </div>

          {!waLoaded ? (
            <div className="text-sm text-neutral-500 py-4 text-center">Loading...</div>
          ) : (
            <div className="space-y-3">
              {/* Add new connection form */}
              {waShowAdd && (
                <div className="border border-white/[0.08] rounded-xl p-4 space-y-3 bg-white/[0.01]">
                  <div className="text-sm font-medium text-neutral-200 mb-2">New Connection</div>
                  <div>
                    <label className="text-[11px] text-neutral-500 block mb-1">Name</label>
                    <input
                      value={waNewName}
                      onChange={(e) => setWaNewName(e.target.value)}
                      className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]"
                      placeholder="e.g. Personal, Business, Client"
                      autoFocus
                    />
                  </div>
                  {!(window as any).__AIOS_WEB__ && (
                    <div>
                      <label className="text-[11px] text-neutral-500 block mb-1">Instance Path <span className="text-neutral-600">(where .wwebjs_auth will be stored)</span></label>
                      <input
                        value={waNewPath}
                        onChange={(e) => setWaNewPath(e.target.value)}
                        className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-white/[0.12]"
                        placeholder="/path/to/aios-instance"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={addWaConnection}
                      disabled={!waNewName.trim()}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Add Connection
                    </button>
                    <button
                      onClick={() => { setWaShowAdd(false); setWaNewName('') }}
                      className="px-4 py-2 rounded-lg bg-white/[0.06] text-neutral-400 text-xs font-medium hover:bg-white/[0.1] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Connection list */}
              {waConnections.length === 0 && !waShowAdd ? (
                <div className="border border-dashed border-white/[0.08] rounded-xl py-8 text-center">
                  <div className="text-neutral-600 text-sm mb-1">No WhatsApp connections</div>
                  <div className="text-neutral-600 text-xs">Add a connection to link your WhatsApp account</div>
                </div>
              ) : (
                waConnections.map((conn) => (
                  <WaConnectionCard
                    key={conn.id}
                    conn={conn}
                    onConnect={() => connectWa(conn.id)}
                    onDisconnect={() => disconnectWa(conn.id)}
                    onRemove={() => removeWa(conn.id)}
                    connecting={waConnectingIds.has(conn.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Account & Plan */}
        <div className="bg-[#1a1a1e] rounded-xl border border-white/[0.08] p-6 mb-5">
          <h2 className="text-base font-semibold text-neutral-100 mb-4">Account</h2>
          {config.apiKey?.startsWith('user:') && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
              <div className="w-8 h-8 rounded-full accent-bg-15 accent-text flex items-center justify-center text-sm font-bold">
                {config.apiKey.replace('user:', '').charAt(0).toUpperCase()}
              </div>
              <div className="text-sm text-neutral-300">{config.apiKey.replace('user:', '')}</div>
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-neutral-200 font-medium">{config.tier === 'pro' ? 'Pro Plan' : 'Free Plan'}</div>
              <p className="text-xs text-neutral-500 mt-0.5">{config.tier === 'pro' ? 'Unlimited usage and advanced features' : '500 credits per day'}</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${config.tier === 'pro' ? 'accent-bg-15 accent-text' : 'bg-white/[0.06] text-neutral-400'}`}>
              {config.tier === 'pro' ? 'PRO' : 'FREE'}
            </span>
          </div>
          {config.tier !== 'pro' && (
            <a href="https://wa.me/60162089049?text=Hi%2C%20I%27d%20like%20to%20upgrade%20to%20AIOS%20Pro" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-green-600/15 border border-green-500/20 hover:bg-green-600/25 transition-colors group">
              <span className="text-lg">💬</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-green-400 group-hover:text-green-300">Upgrade to Pro</div>
                <div className="text-[11px] text-neutral-500">WhatsApp +60 16-208 9049</div>
              </div>
              <span className="text-neutral-600 group-hover:text-neutral-400 text-sm">→</span>
            </a>
          )}
        </div>

        {/* Appearance */}
        <div className="bg-[#1a1a1e] rounded-xl border border-white/[0.08] p-6 mb-5">
          <h2 className="text-base font-semibold text-neutral-100 mb-4">Appearance</h2>
          <div className="mb-5">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2.5 block">Mode</label>
            <div className="flex gap-2">
              <button onClick={() => handleAppearance('dark')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${config.appearance === 'dark' ? 'accent-border-50 accent-bg-10' : 'border-white/[0.06] bg-[#0f0f13] hover:border-white/[0.12]'}`}>
                <span className="text-sm">🌙</span><span className="text-sm text-neutral-200 font-medium">Dark</span>
              </button>
              <button onClick={() => handleAppearance('light')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${config.appearance === 'light' ? 'accent-border-50 accent-bg-10' : 'border-white/[0.06] bg-[#0f0f13] hover:border-white/[0.12]'}`}>
                <span className="text-sm">☀️</span><span className="text-sm text-neutral-200 font-medium">Light</span>
              </button>
            </div>
          </div>
          <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2.5 block">Accent Color</label>
          <div className="grid grid-cols-5 gap-2">
            {THEME_PRESETS.map((theme) => (
              <button key={theme.name} onClick={() => handleThemeChange(theme)} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${config.theme.name === theme.name ? 'accent-border-50 accent-bg-10' : 'border-white/[0.06] bg-[#0f0f13] hover:border-white/[0.12]'}`} title={theme.description}>
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
                <span className="text-[10px] text-neutral-400">{theme.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="bg-[#1a1a1e] rounded-xl border border-white/[0.08] p-6 mb-5">
          <h2 className="text-base font-semibold text-neutral-100 mb-4">About</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-neutral-500">Version</span><span className="text-neutral-200">v0.3.0</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Built by</span><span className="text-neutral-200">Adletic Agency</span></div>
          </div>
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-neutral-400 mb-2">Keyboard Shortcuts</h4>
              {[['New Chat', '⌘N'], ['Toggle Sidebar', '⌘B'], ['Settings', '⌘,'], ['Skills & Commands', '⌘K']].map(([label, key]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-neutral-500">{label}</span>
                  <kbd className="px-1.5 py-0.5 bg-[#0f0f13] border border-white/[0.06] rounded text-neutral-400 text-[11px]">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => { setConfig({ apiKey: undefined, tier: 'free' }); localStorage.removeItem('aios-config') }}
          className="w-full px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-sm font-medium transition-colors"
        >
          Log out
        </button>
      </div>

      {showAddModal && <AddServerModal onAdd={handleAddServer} onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
