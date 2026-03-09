import { useState, useEffect } from 'react'
import Terminal from './components/Terminal'
import Sidebar from './components/Sidebar'
import FileViewer from './components/FileViewer'
import SchedulePanel from './components/SchedulePanel'
import StatusBar from './components/StatusBar'
import CommandPalette from './components/CommandPalette'

type RightPanel = { type: 'file'; path: string } | { type: 'schedule' } | null

export default function App() {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Convenience for sidebar file select
  const handleFileSelect = (path: string) => setRightPanel({ type: 'file', path })
  const handleScheduleOpen = () => setRightPanel({ type: 'schedule' })
  const closePanel = () => setRightPanel(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(p => !p)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-full bg-neutral-950 text-neutral-100">
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

      {/* Sidebar */}
      <div className="w-52 border-r border-neutral-800/40 bg-neutral-950 flex flex-col shrink-0">
        <Sidebar onFileSelect={handleFileSelect} onScheduleOpen={handleScheduleOpen} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 min-h-0 relative flex">
          {/* Terminal */}
          <div className={`min-w-0 flex-1 ${rightPanel ? 'border-r border-neutral-800/60' : ''}`}>
            <Terminal />
          </div>

          {/* Right panel (file viewer or schedule) */}
          {rightPanel?.type === 'file' && (
            <div className="w-[45%] shrink-0 min-w-0">
              <FileViewer filePath={rightPanel.path} onClose={closePanel} />
            </div>
          )}
          {rightPanel?.type === 'schedule' && (
            <div className="w-[45%] shrink-0 min-w-0">
              <SchedulePanel onClose={closePanel} />
            </div>
          )}
        </div>
        <StatusBar />
      </div>
    </div>
  )
}
