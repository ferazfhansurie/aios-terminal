export default function App() {
  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      {/* Sidebar */}
      <div className="w-64 border-r border-neutral-800 bg-neutral-900 flex flex-col">
        <div className="p-4 border-b border-neutral-800">
          <h1 className="text-lg font-semibold text-orange-500">AIOS</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-neutral-500 text-sm p-2">Sidebar coming soon...</p>
        </div>
      </div>
      {/* Terminal area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 bg-neutral-950 p-1">
          <p className="text-neutral-500 p-4">Terminal coming soon...</p>
        </div>
        {/* Status bar */}
        <div className="h-8 border-t border-neutral-800 bg-neutral-900 flex items-center px-4 text-xs text-neutral-500">
          AIOS Terminal v0.1.0
        </div>
      </div>
    </div>
  )
}
