import { useState, useEffect } from 'react'

function shortenPath(cwd: string): string {
  const parts = cwd.split('/')
  if (parts.length <= 3) return cwd
  return '…/' + parts.slice(-2).join('/')
}

export default function StatusBar() {
  const [info, setInfo] = useState<{ version: string; cwd: string; companyName: string } | null>(null)

  useEffect(() => {
    window.aios.getAppInfo().then(setInfo)
  }, [])

  return (
    <div className="h-6 border-t border-neutral-800/50 bg-neutral-950/90 flex items-center px-4 gap-2.5 text-[10px] text-neutral-600 shrink-0">
      <span className="text-orange-500/70 font-bold tracking-[0.2em] uppercase text-[9px]">AIOS</span>
      <Divider />
      <span className="text-neutral-500 font-medium">{info?.companyName || '—'}</span>
      {info?.cwd && (
        <>
          <Divider />
          <span className="text-neutral-700 font-mono text-[9px]" title={info.cwd}>
            {shortenPath(info.cwd)}
          </span>
        </>
      )}
      <Divider />
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500/80 shadow-[0_0_5px_#22c55e80]" />
        <span className="text-green-700">Connected</span>
      </span>
      <div className="flex-1" />
      <span className="text-neutral-800 font-mono">v{info?.version || '0.1.0'}</span>
    </div>
  )
}

function Divider() {
  return <span className="w-px h-3 bg-neutral-800 shrink-0" />
}
