import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface PtyTab {
  id: string
  label: string
  active: boolean
  alive: boolean
  createdAt: number
}

declare global {
  interface Window {
    aios: {
      onPtyData: (cb: (data: string) => void) => (() => void)
      sendPtyInput: (data: string) => void
      resizePty: (cols: number, rows: number) => void
      sendCommand: (cmd: string) => void
      replayPty: () => Promise<string>
      getClaudeDir: () => Promise<any>
      readFile: (path: string) => Promise<string>
      readImage: (path: string) => Promise<string>
      writeFile: (path: string, content: string) => Promise<void>
      onFilesChanged: (cb: () => void) => (() => void)
      copyToContext: (srcPath: string) => Promise<string>
      saveFile: (srcPath: string) => Promise<string>
      listFiles: () => Promise<{ name: string; filename: string }[]>
      getAppInfo: () => Promise<{ version: string; cwd: string; companyName: string; instanceId: string }>
      restartSession: (resumeId?: string) => Promise<void>
      listSessions: () => Promise<{ id: string; title: string; messageCount: number; timestamp: number }[]>
      onPtyRestarted: (cb: () => void) => (() => void)
      getPathForFile: (file: File) => string
      // Instance management
      listInstances: () => Promise<{ id: string; name: string; path: string; created: number }[]>
      getActiveInstance: () => Promise<{ id: string; name: string; path: string; created: number }>
      switchInstance: (id: string) => Promise<boolean>
      createInstance: (name: string) => Promise<{ id: string; name: string; path: string; created: number }>
      deleteInstance: (id: string) => Promise<boolean>
      renameInstance: (id: string, name: string) => Promise<boolean>
      addFolder: () => Promise<any>
      onInstanceSwitched: (cb: (instance: any) => void) => (() => void)
      // Terminal tabs
      listTabs: () => Promise<PtyTab[]>
      createTab: (label?: string) => Promise<{ id: string; label: string }>
      closeTab: (id: string) => Promise<boolean>
      switchTab: (id: string) => Promise<boolean>
      renameTab: (id: string, label: string) => Promise<boolean>
      onTabsChanged: (cb: (tabs: PtyTab[]) => void) => (() => void)
      onTabSwitched: (cb: (buffer: string) => void) => (() => void)
      // Schedule management
      listSchedules: () => Promise<any[]>
      createSchedule: (data: any) => Promise<any>
      updateSchedule: (id: string, data: any) => Promise<any>
      deleteSchedule: (id: string) => Promise<boolean>
      toggleSchedule: (id: string) => Promise<boolean>
      runScheduleNow: (id: string) => Promise<boolean>
      onSchedulesChanged: (cb: () => void) => (() => void)
    }
  }
}

const TERM_THEME = {
  background: '#0a0a0a',
  foreground: '#e5e5e5',
  cursor: '#f97316',
  selectionBackground: '#f9731640',
  black: '#0a0a0a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e5e5e5',
  brightBlack: '#525252',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
} as const

function createTerm() {
  return new XTerminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
    theme: TERM_THEME,
    allowProposedApi: true,
  })
}

export default function Terminal() {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [tabs, setTabs] = useState<PtyTab[]>([])
  const tabsRef = useRef<PtyTab[]>([])

  // Keep ref in sync for use in event handlers
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  const initTerm = useCallback(() => {
    const container = termRef.current
    if (!container) return

    if (xtermRef.current) {
      xtermRef.current.dispose()
      xtermRef.current = null
    }
    container.innerHTML = ''

    const term = createTerm()
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(container)

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
        window.aios.resizePty(term.cols, term.rows)
      })
    })

    term.onData((data) => {
      window.aios.sendPtyInput(data)
    })

    window.aios.replayPty().then((buffered) => {
      if (buffered) term.write(buffered)
    })
  }, [])

  useEffect(() => {
    initTerm()

    // Load initial tabs
    window.aios.listTabs().then(setTabs)

    const removePtyData = window.aios.onPtyData((data) => {
      xtermRef.current?.write(data)
    })

    // Full reinit — for new tabs, instance switches
    const removeRestarted = window.aios.onPtyRestarted(() => {
      initTerm()
    })

    // Tab switch — just clear and replay buffer (no reinit)
    const removeTabSwitched = window.aios.onTabSwitched((buffer: string) => {
      const term = xtermRef.current
      if (term) {
        term.clear()
        term.reset()
        if (buffer) term.write(buffer)
      }
    })

    const removeTabsChanged = window.aios.onTabsChanged((newTabs) => {
      setTabs(newTabs)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit()
      if (xtermRef.current) {
        window.aios.resizePty(xtermRef.current.cols, xtermRef.current.rows)
      }
    })
    if (termRef.current) resizeObserver.observe(termRef.current)

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        window.aios.createTab()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        const currentTabs = tabsRef.current
        const activeTab = currentTabs.find(t => t.active)
        if (activeTab && currentTabs.length > 1) {
          window.aios.closeTab(activeTab.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      resizeObserver.disconnect()
      removePtyData()
      removeRestarted()
      removeTabSwitched()
      removeTabsChanged()
      window.removeEventListener('keydown', handleKeyDown)
      xtermRef.current?.dispose()
    }
  }, [initTerm])

  const handleNewTab = () => {
    window.aios.createTab()
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    if (tabs.length <= 1) return
    window.aios.closeTab(tabId)
  }

  const handleSwitchTab = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || tab.active) return
    window.aios.switchTab(tabId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="h-8 border-b border-neutral-800/40 flex items-center shrink-0 bg-neutral-950">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSwitchTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 h-8 text-[11px] shrink-0 border-r border-neutral-800/30
                       transition-all duration-150 group relative
                       ${tab.active
                         ? 'bg-neutral-900/80 text-neutral-300'
                         : 'text-neutral-600 hover:text-neutral-400 hover:bg-neutral-900/40'
                       }`}
          >
            {tab.active && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-500/60" />
            )}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              tab.alive ? 'bg-green-500/70' : 'bg-neutral-700'
            }`} />
            <span className="truncate max-w-[100px]">{tab.label}</span>
            {tabs.length > 1 && (
              <span
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="ml-0.5 text-[9px] text-neutral-700 hover:text-red-400
                           opacity-0 group-hover:opacity-100 transition-all shrink-0
                           w-4 h-4 flex items-center justify-center rounded hover:bg-neutral-800"
              >
                ✕
              </span>
            )}
          </button>
        ))}
        {/* New tab — directly after the last tab */}
        <button
          onClick={handleNewTab}
          className="shrink-0 w-7 h-8 flex items-center justify-center
                     text-neutral-700 hover:text-orange-400 hover:bg-neutral-800/60
                     transition-colors text-sm"
          title="New Claude tab (⌘T)"
        >
          +
        </button>
      </div>

      {/* Terminal content */}
      <div ref={termRef} className="flex-1 min-h-0" />
    </div>
  )
}
