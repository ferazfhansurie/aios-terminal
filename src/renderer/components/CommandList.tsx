interface Command {
  name: string
  filename: string
}

export default function CommandList({ commands }: { commands: Command[] }) {
  const handleClick = (name: string) => {
    window.aios.sendCommand(`/${name}`)
  }

  return (
    <div className="space-y-1">
      {commands.map((cmd) => (
        <button
          key={cmd.name}
          onClick={() => handleClick(cmd.name)}
          className="w-full text-left px-3 py-2 rounded-lg text-sm
                     text-neutral-300 hover:bg-neutral-800 hover:text-orange-400
                     transition-colors flex items-center gap-2"
        >
          <span className="text-orange-500/60 font-mono text-xs">/</span>
          {cmd.name}
        </button>
      ))}
    </div>
  )
}
