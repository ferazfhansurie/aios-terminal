import { useState, useEffect } from 'react'
import Terminal from './components/Terminal'
import Sidebar from './components/Sidebar'
import FileViewer from './components/FileViewer'
import StatusBar from './components/StatusBar'
import CommandPalette from './components/CommandPalette'

export default function App() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

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
        <Sidebar onFileSelect={setSelectedFile} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Terminal header */}
        <div className="h-8 border-b border-neutral-800/40 flex items-center px-4 gap-3 shrink-0">
          <span className="text-[10px] text-neutral-700 tracking-widest uppercase font-semibold">Terminal</span>
          <div className="flex-1" />
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 text-[10px] text-neutral-700 hover:text-neutral-400
                       transition-colors px-2 py-1 rounded hover:bg-neutral-800/60 group"
          >
            <span className="font-mono text-neutral-600 group-hover:text-orange-500/60 transition-colors">⌘K</span>
            <span className="text-neutral-800">·</span>
            <span>commands</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 relative flex">
          {/* Terminal */}
          <div className={`min-w-0 flex-1 ${selectedFile ? 'border-r border-neutral-800/60' : ''}`}>
            <Terminal />
          </div>

          {/* File viewer (split panel) */}
          {selectedFile && (
            <div className="w-[45%] shrink-0 min-w-0">
              <FileViewer
                filePath={selectedFile}
                onClose={() => setSelectedFile(null)}
              />
            </div>
          )}
        </div>
        <StatusBar />
      </div>
    </div>
  )
}
