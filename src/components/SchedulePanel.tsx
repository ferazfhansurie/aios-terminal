import { useState, useEffect, useRef } from 'react'

interface ScheduledTask {
  id: string
  name: string
  command: string
  type: 'once' | 'daily' | 'weekly' | 'interval'
  time?: string
  dayOfWeek?: number
  date?: string
  intervalMinutes?: number
  enabled: boolean
  lastRun?: number
  lastStatus?: string
  nextRun?: number | null
  createdAt: number
  history: { timestamp: number; status: string }[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TYPES: { value: ScheduledTask['type']; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'interval', label: 'Interval' },
  { value: 'once', label: 'Once' },
]

function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts) return '—'
  const now = Date.now()
  const diff = ts - now

  if (diff < 0) {
    const ago = Math.abs(diff)
    if (ago < 60_000) return 'just now'
    if (ago < 3600_000) return `${Math.floor(ago / 60_000)}m ago`
    if (ago < 86400_000) return `${Math.floor(ago / 3600_000)}h ago`
    return `${Math.floor(ago / 86400_000)}d ago`
  }

  if (diff < 60_000) return 'now'
  if (diff < 3600_000) return `in ${Math.floor(diff / 60_000)}m`
  if (diff < 86400_000) return `in ${Math.floor(diff / 3600_000)}h`
  return `in ${Math.floor(diff / 86400_000)}d`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-MY', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function getScheduleDescription(task: ScheduledTask): string {
  if (task.type === 'daily') return `Daily at ${task.time || '??:??'}`
  if (task.type === 'weekly') return `${DAYS[task.dayOfWeek ?? 0]}s at ${task.time || '??:??'}`
  if (task.type === 'interval') return `Every ${task.intervalMinutes || '??'}min`
  if (task.type === 'once') return `${task.date || '??'} at ${task.time || '??:??'}`
  return ''
}

export default function SchedulePanel({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list')
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadTasks = async () => {
    const list = await window.aios.listSchedules()
    setTasks(list)
  }

  useEffect(() => {
    loadTasks()
    const unsub = window.aios.onSchedulesChanged(() => loadTasks())
    // Refresh relative times every 30s
    const timer = setInterval(loadTasks, 30_000)
    return () => { unsub(); clearInterval(timer) }
  }, [])

  const handleDelete = async (id: string) => {
    await window.aios.deleteSchedule(id)
    loadTasks()
  }

  const handleToggle = async (id: string) => {
    await window.aios.toggleSchedule(id)
    loadTasks()
  }

  const handleRunNow = async (id: string) => {
    await window.aios.runScheduleNow(id)
    loadTasks()
  }

  const handleEdit = (task: ScheduledTask) => {
    setEditingTask(task)
    setView('edit')
  }

  const handleSaved = () => {
    setView('list')
    setEditingTask(null)
    loadTasks()
  }

  // Sort: enabled first, then by next run time
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    const aNext = a.nextRun ?? Infinity
    const bNext = b.nextRun ?? Infinity
    return aNext - bNext
  })

  const enabledCount = tasks.filter(t => t.enabled).length

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800/70 bg-neutral-900/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-orange-500/60 text-sm">⏱</span>
          <span className="text-[13px] font-medium text-neutral-200">Schedule</span>
          {enabledCount > 0 && (
            <span className="text-[9px] text-orange-400/60 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
              {enabledCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {view === 'list' && (
            <button
              onClick={() => { setEditingTask(null); setView('create') }}
              className="text-[11px] px-2.5 py-1 rounded-md text-orange-400/80 border border-orange-500/20
                         hover:bg-orange-500/10 hover:text-orange-400 transition-all"
            >
              + New
            </button>
          )}
          {view !== 'list' && (
            <button
              onClick={() => { setView('list'); setEditingTask(null) }}
              className="text-[11px] px-2.5 py-1 rounded-md text-neutral-500
                         hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-1 w-6 h-6 flex items-center justify-center rounded-md
                       text-neutral-700 hover:text-neutral-300 hover:bg-neutral-800 transition-colors text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {(view === 'create' || view === 'edit') ? (
          <ScheduleForm
            task={editingTask}
            onSave={handleSaved}
            onCancel={() => { setView('list'); setEditingTask(null) }}
          />
        ) : sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <span className="text-2xl text-neutral-800">⏱</span>
            <div>
              <p className="text-sm text-neutral-500">No scheduled tasks</p>
              <p className="text-[11px] text-neutral-700 mt-1">
                Schedule commands to run automatically
              </p>
            </div>
            <button
              onClick={() => setView('create')}
              className="mt-2 text-[11px] px-4 py-1.5 rounded-md bg-orange-500/90 text-white
                         hover:bg-orange-500 transition-colors font-medium"
            >
              Create Schedule
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/30">
            {sortedTasks.map(task => (
              <div key={task.id} className="group">
                {/* Task row */}
                <div
                  className={`px-4 py-3 flex items-start gap-3 cursor-pointer
                             hover:bg-neutral-900/80 transition-colors
                             ${!task.enabled ? 'opacity-40' : ''}`}
                  onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                >
                  {/* Status indicator */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(task.id) }}
                    className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 transition-colors border ${
                      task.enabled
                        ? 'bg-green-500/80 border-green-500/50 shadow-[0_0_6px_#22c55e40]'
                        : 'bg-neutral-800 border-neutral-700 hover:border-neutral-500'
                    }`}
                    title={task.enabled ? 'Disable' : 'Enable'}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-neutral-200 font-medium truncate">{task.name}</span>
                      <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${
                        task.type === 'daily' ? 'text-blue-400/70 bg-blue-500/10' :
                        task.type === 'weekly' ? 'text-purple-400/70 bg-purple-500/10' :
                        task.type === 'interval' ? 'text-cyan-400/70 bg-cyan-500/10' :
                        'text-amber-400/70 bg-amber-500/10'
                      }`}>{task.type}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-neutral-600 font-mono truncate">{task.command}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-neutral-700">{getScheduleDescription(task)}</span>
                      {task.nextRun && task.enabled && (
                        <span className="text-[10px] text-orange-500/50">
                          next: {formatRelativeTime(task.nextRun)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRunNow(task.id) }}
                      className="text-[9px] text-neutral-600 hover:text-green-400 px-1.5 py-0.5 rounded
                                 hover:bg-green-500/10 transition-colors"
                      title="Run now"
                    >
                      run
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(task) }}
                      className="text-[9px] text-neutral-600 hover:text-orange-400 px-1.5 py-0.5 rounded
                                 hover:bg-orange-500/10 transition-colors"
                    >
                      edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}
                      className="text-[9px] text-neutral-600 hover:text-red-400 px-1.5 py-0.5 rounded
                                 hover:bg-red-500/10 transition-colors"
                    >
                      del
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === task.id && (
                  <div className="px-4 pb-3 animate-slideDown">
                    <div className="ml-5.5 pl-3 border-l border-neutral-800/40">
                      {/* Info grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] mb-3">
                        <div>
                          <span className="text-neutral-700">Created</span>
                          <span className="text-neutral-500 ml-2">{formatTime(task.createdAt)}</span>
                        </div>
                        <div>
                          <span className="text-neutral-700">Last run</span>
                          <span className="text-neutral-500 ml-2">
                            {task.lastRun ? formatTime(task.lastRun) : 'never'}
                          </span>
                        </div>
                        {task.nextRun && (
                          <div>
                            <span className="text-neutral-700">Next run</span>
                            <span className="text-neutral-500 ml-2">{formatTime(task.nextRun)}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-neutral-700">Runs</span>
                          <span className="text-neutral-500 ml-2">{task.history.length}</span>
                        </div>
                      </div>

                      {/* Run history */}
                      {task.history.length > 0 && (
                        <div>
                          <div className="text-[9px] text-neutral-700 uppercase tracking-wider mb-1.5">
                            Recent runs
                          </div>
                          <div className="space-y-0.5 max-h-32 overflow-y-auto">
                            {[...task.history].reverse().slice(0, 10).map((run, i) => (
                              <div key={i} className="flex items-center gap-2 text-[10px]">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  run.status === 'executed' ? 'bg-green-500/60' :
                                  run.status === 'manual' ? 'bg-blue-500/60' :
                                  'bg-neutral-600'
                                }`} />
                                <span className="text-neutral-600">{formatTime(run.timestamp)}</span>
                                <span className="text-neutral-700">{run.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {tasks.length > 0 && view === 'list' && (
        <div className="shrink-0 px-4 py-1.5 border-t border-neutral-800/30 flex items-center justify-between
                        text-[9px] text-neutral-700 bg-neutral-900/30">
          <span>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          <span>{enabledCount} active</span>
        </div>
      )}
    </div>
  )
}

/* ─── Schedule Form ──────────────────────────────────────────────── */

function ScheduleForm({
  task,
  onSave,
  onCancel,
}: {
  task: ScheduledTask | null
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(task?.name || '')
  const [command, setCommand] = useState(task?.command || '')
  const [type, setType] = useState<ScheduledTask['type']>(task?.type || 'daily')
  const [time, setTime] = useState(task?.time || '09:00')
  const [dayOfWeek, setDayOfWeek] = useState(task?.dayOfWeek ?? 1)
  const [date, setDate] = useState(task?.date || new Date().toISOString().split('T')[0])
  const [intervalMinutes, setIntervalMinutes] = useState(task?.intervalMinutes ?? 60)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const isValid = name.trim() && command.trim()

  const handleSubmit = async () => {
    if (!isValid) return
    setSaving(true)
    const data = {
      name: name.trim(),
      command: command.trim(),
      type,
      time: type !== 'interval' ? time : undefined,
      dayOfWeek: type === 'weekly' ? dayOfWeek : undefined,
      date: type === 'once' ? date : undefined,
      intervalMinutes: type === 'interval' ? intervalMinutes : undefined,
    }
    if (task) {
      await window.aios.updateSchedule(task.id, data)
    } else {
      await window.aios.createSchedule(data)
    }
    setSaving(false)
    onSave()
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
        {task ? 'Edit Schedule' : 'New Schedule'}
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Name</label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Morning standup"
          className="w-full bg-neutral-900 border border-neutral-800/60 rounded-md px-3 py-2
                     text-[12px] text-neutral-200 placeholder:text-neutral-700 outline-none
                     focus:border-orange-500/40 transition-colors font-medium"
        />
      </div>

      {/* Command */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Command</label>
        <input
          type="text"
          value={command}
          onChange={e => setCommand(e.target.value)}
          placeholder="e.g. /standup, /prime, or any prompt"
          className="w-full bg-neutral-900 border border-neutral-800/60 rounded-md px-3 py-2
                     text-[12px] text-neutral-300 placeholder:text-neutral-700 outline-none
                     focus:border-orange-500/40 transition-colors font-mono"
        />
        <p className="text-[9px] text-neutral-800">Slash commands, skills, or any text prompt</p>
      </div>

      {/* Schedule Type */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Frequency</label>
        <div className="flex gap-1">
          {TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`px-3 py-1.5 rounded-md text-[11px] transition-all ${
                type === t.value
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-800/40 hover:text-neutral-400 hover:border-neutral-700/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time (for daily/weekly/once) */}
      {type !== 'interval' && (
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Time</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="w-32 bg-neutral-900 border border-neutral-800/60 rounded-md px-3 py-2
                       text-[12px] text-neutral-300 outline-none focus:border-orange-500/40
                       transition-colors font-mono [color-scheme:dark]"
          />
        </div>
      )}

      {/* Day of week (for weekly) */}
      {type === 'weekly' && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Day</label>
          <div className="flex gap-1">
            {DAYS.map((day, i) => (
              <button
                key={i}
                onClick={() => setDayOfWeek(i)}
                className={`w-9 py-1.5 rounded-md text-[10px] transition-all ${
                  dayOfWeek === i
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'bg-neutral-900 text-neutral-600 border border-neutral-800/40 hover:text-neutral-400'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date (for once) */}
      {type === 'once' && (
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-40 bg-neutral-900 border border-neutral-800/60 rounded-md px-3 py-2
                       text-[12px] text-neutral-300 outline-none focus:border-orange-500/40
                       transition-colors font-mono [color-scheme:dark]"
          />
        </div>
      )}

      {/* Interval minutes */}
      {type === 'interval' && (
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Every (minutes)</label>
          <input
            type="number"
            min={1}
            value={intervalMinutes}
            onChange={e => setIntervalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 bg-neutral-900 border border-neutral-800/60 rounded-md px-3 py-2
                       text-[12px] text-neutral-300 outline-none focus:border-orange-500/40
                       transition-colors font-mono [color-scheme:dark]"
          />
          <p className="text-[9px] text-neutral-800">
            {intervalMinutes >= 60
              ? `= ${(intervalMinutes / 60).toFixed(1)}h`
              : `= ${intervalMinutes}min`}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-neutral-800/30">
        <button
          onClick={handleSubmit}
          disabled={!isValid || saving}
          className="px-4 py-1.5 text-[11px] font-medium text-white bg-orange-500/90 hover:bg-orange-500
                     rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                     flex items-center gap-1.5"
        >
          {saving && <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />}
          {task ? 'Update' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-300
                     rounded-md hover:bg-neutral-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
