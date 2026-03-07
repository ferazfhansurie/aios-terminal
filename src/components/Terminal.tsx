import { useEffect, useRef } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

declare global {
  interface Window {
    aios: {
      onPtyData: (cb: (data: string) => void) => void
      sendPtyInput: (data: string) => void
      resizePty: (cols: number, rows: number) => void
      sendCommand: (cmd: string) => void
      replayPty: () => Promise<string>
      getClaudeDir: () => Promise<any>
      readFile: (path: string) => Promise<string>
      readImage: (path: string) => Promise<string>
      writeFile: (path: string, content: string) => Promise<void>
      onFilesChanged: (cb: () => void) => void
      copyToContext: (srcPath: string) => Promise<string>
      saveFile: (srcPath: string) => Promise<string>
      listFiles: () => Promise<{ name: string; filename: string }[]>
      getAppInfo: () => Promise<{ version: string; cwd: string; companyName: string }>
      restartSession: (resumeId?: string) => Promise<void>
      listSessions: () => Promise<{ id: string; title: string; messageCount: number; timestamp: number }[]>
      onPtyRestarted: (cb: () => void) => void
      getPathForFile: (file: File) => string
    }
  }
}

export default function Terminal() {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)

  useEffect(() => {
    if (!termRef.current) return

    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
      theme: {
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
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(termRef.current)

    // Double-RAF ensures flex layout is fully resolved before fitting
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
        window.aios.resizePty(term.cols, term.rows)
      })
    })

    // Terminal input -> PTY
    term.onData((data) => {
      window.aios.sendPtyInput(data)
    })

    // PTY output -> terminal
    window.aios.onPtyData((data) => {
      term.write(data)
    })

    // Replay buffered output that arrived before this component mounted
    window.aios.replayPty().then((buffered) => {
      if (buffered) term.write(buffered)
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      window.aios.resizePty(term.cols, term.rows)
    })
    resizeObserver.observe(termRef.current)

    xtermRef.current = term

    return () => {
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [])

  return <div ref={termRef} className="w-full h-full" />
}
