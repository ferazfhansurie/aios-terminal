import { useState, useEffect } from 'react'

export default function StatusBar() {
  const [info, setInfo] = useState<{ version: string; cwd: string; companyName: string } | null>(null)

  useEffect(() => {
    window.aios.getAppInfo().then(setInfo)
  }, [])

  return (
    <div className="h-8 border-t border-neutral-800 bg-neutral-900 flex items-center px-4 text-xs text-neutral-500 shrink-0">
      <span className="text-orange-500 font-medium">AIOS</span>
      <span className="mx-2 text-neutral-700">|</span>
      <span>{info?.companyName || '...'}</span>
      <span className="mx-2 text-neutral-700">|</span>
      <span className="text-green-500">Connected</span>
      <div className="flex-1" />
      <span className="text-neutral-600">v{info?.version || '...'}</span>
    </div>
  )
}
