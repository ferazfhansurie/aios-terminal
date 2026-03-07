import { useState } from 'react'
import Terminal from './components/Terminal'
import Sidebar from './components/Sidebar'
import FileViewer from './components/FileViewer'
import StatusBar from './components/StatusBar'

export default function App() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      {/* Sidebar */}
      <div className="w-64 border-r border-neutral-800 bg-neutral-900 flex flex-col shrink-0">
        <Sidebar onFileSelect={setSelectedFile} />
      </div>
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 min-h-0 flex">
          {/* Terminal */}
          <div className={selectedFile ? 'w-1/2 border-r border-neutral-800' : 'w-full'}>
            <Terminal />
          </div>
          {/* File viewer (split) */}
          {selectedFile && (
            <div className="w-1/2">
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
