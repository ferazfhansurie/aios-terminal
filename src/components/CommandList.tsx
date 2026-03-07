interface Command {
  name: string
  filename: string
}

export default function CommandList({ commands }: { commands: Command[] }) {
  const handleClick = (name: string) => {
    window.aios.sendCommand(`/${name}`)
  }

  return (
    <div className="space-y-0.5">
      {commands.map((cmd) => (
        <button
          key={cmd.name}
          onClick={() => handleClick(cmd.name)}
          className="w-full text-left px-3 py-1.5 rounded-md text-xs
                     text-neutral-400 hover:bg-neutral-800 hover:text-orange-400
                     transition-colors flex items-center gap-2 group"
        >
          <span className="text-orange-500/40 group-hover:text-orange-500/70 font-mono transition-colors">/</span>
          {cmd.name}
        </button>
      ))}
    </div>
  )
}
