import { useEffect, useState, useCallback, useRef } from 'react'
import type { ScheduledTask, ScheduleRun, ScheduleType } from '../types'

// ── Helpers ──

const aios = () => (window as any).aios

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const TYPE_LABELS: Record<ScheduleType, string> = {
  once: 'Once',
  daily: 'Daily',
  weekly: 'Weekly',
  interval: 'Interval',
}

function formatNextRun(ts: number | null | undefined): string {
  if (!ts) return 'Not scheduled'
  const d = new Date(ts)
  const now = new Date()
  const diff = ts - now.getTime()
  if (diff < 0) return 'Overdue'
  const isToday = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const time = d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (isToday) return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  const dayName = d.toLocaleDateString('en-MY', { weekday: 'short' })
  return `${dayName} ${time}`
}

function formatTimestamp(ts: number | undefined): string {
  if (!ts) return '--'
  const d = new Date(ts)
  return d.toLocaleString('en-MY', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDuration(start: number, end?: number): string {
  if (!end) return 'running'
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

// ── SVG Icons ──

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="7" y1="2" x2="7" y2="12" />
      <line x1="2" y1="7" x2="12" y2="7" />
    </svg>
  )
}

function IconPlay() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <polygon points="2,1 11,6 2,11" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 1.5l2 2L4 10H2v-2z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h8M4.5 3V2h3v1M3 3l.5 7h5l.5-7" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
    >
      <polyline points="3,1.5 7,5 3,8.5" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="6" cy="6" r="5" />
      <polyline points="6,3 6,6 8,7.5" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  )
}

// ── Toggle ──

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={`relative w-8 h-[18px] rounded-full transition-colors duration-150 flex-shrink-0 ${
        enabled ? 'accent-bg' : 'bg-white/[0.08]'
      }`}
      aria-label={enabled ? 'Disable' : 'Enable'}
    >
      <div
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-150 ${
          enabled ? 'left-[15px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}

// ── Status Dot ──

function StatusDot({ status }: { status?: 'success' | 'error' | 'running' }) {
  if (!status) return null
  const color =
    status === 'success' ? 'bg-emerald-400' :
    status === 'error' ? 'bg-red-400' :
    'bg-amber-400 animate-pulse'
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
}

// ── Type Badge ──

function TypeBadge({ type }: { type: ScheduleType }) {
  return (
    <span className="accent-bg-15 accent-text text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded">
      {TYPE_LABELS[type]}
    </span>
  )
}

// ── Schedule Card ──

function ScheduleCard({
  task,
  onEdit,
  onDelete,
  onToggle,
  onRunNow,
}: {
  task: ScheduledTask
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onRunNow: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [runs, setRuns] = useState<ScheduleRun[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)

  const loadRuns = useCallback(async () => {
    if (!expanded) return
    setLoadingRuns(true)
    try {
      const result = await aios().getScheduleRuns(task.id, 10)
      setRuns(result || [])
    } catch {
      setRuns([])
    } finally {
      setLoadingRuns(false)
    }
  }, [expanded, task.id])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  return (
    <div className={`bg-[#1a1a1e] rounded-xl border border-white/[0.08] transition-colors ${
      !task.enabled ? 'opacity-60' : ''
    }`}>
      {/* Main row */}
      <div
        className="flex items-start gap-4 p-5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand indicator */}
        <div className="pt-1 text-neutral-600">
          <IconChevron open={expanded} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Top line: name + type + toggle */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-semibold text-neutral-100 truncate">{task.name}</span>
            <TypeBadge type={task.type} />
            <div className="ml-auto flex-shrink-0">
              <Toggle enabled={task.enabled} onChange={onToggle} />
            </div>
          </div>

          {/* Command preview */}
          <div className="font-mono text-xs text-neutral-400 truncate mb-3 bg-[#0e0e10] rounded-md px-2.5 py-1.5 border border-white/[0.04]">
            {task.command}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-5 flex-wrap">
            {/* Next run */}
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <IconClock />
              <span>{formatNextRun(task.nextRun)}</span>
            </div>

            {/* Last run */}
            {task.lastRun && (
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <StatusDot status={task.lastStatus} />
                <span>{formatTimestamp(task.lastRun)}</span>
              </div>
            )}

            {/* Run count */}
            <div className="text-[11px] text-neutral-600">
              {task.runCount} run{task.runCount !== 1 ? 's' : ''}
            </div>

            {/* Interval detail */}
            {task.type === 'interval' && task.intervalMinutes && (
              <div className="text-[11px] text-neutral-600">
                every {task.intervalMinutes}m
              </div>
            )}

            {/* Weekly detail */}
            {task.type === 'weekly' && task.dayOfWeek !== undefined && (
              <div className="text-[11px] text-neutral-600">
                {DAYS[task.dayOfWeek]} {task.time || ''}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onRunNow}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] transition-colors"
            title="Run now"
          >
            <IconPlay />
          </button>
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] transition-colors"
            title="Edit"
          >
            <IconEdit />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-5 pb-5">
          {/* Full command */}
          <div className="mt-4 mb-4">
            <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Command</div>
            <pre className="font-mono text-xs text-neutral-300 bg-[#0e0e10] rounded-lg p-3 border border-white/[0.04] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
              {task.command}
            </pre>
          </div>

          {/* Last output */}
          {task.lastOutput && (
            <div className="mb-4">
              <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Last Output</div>
              <pre className="font-mono text-[11px] text-neutral-400 bg-[#0e0e10] rounded-lg p-3 border border-white/[0.04] whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {task.lastOutput}
              </pre>
            </div>
          )}

          {/* Run history */}
          <div>
            <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Run History</div>
            {loadingRuns ? (
              <div className="text-[11px] text-neutral-600 py-2">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="text-[11px] text-neutral-600 py-2">No runs yet</div>
            ) : (
              <div className="space-y-1">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center gap-3 text-[11px] py-1.5 px-2 rounded-md hover:bg-white/[0.03]"
                  >
                    <StatusDot status={run.status} />
                    <span className="text-neutral-400 font-mono w-32 flex-shrink-0">
                      {formatTimestamp(run.startedAt)}
                    </span>
                    <span className="text-neutral-600 w-16 flex-shrink-0">
                      {formatDuration(run.startedAt, run.completedAt)}
                    </span>
                    {run.output && (
                      <span className="text-neutral-500 truncate font-mono">
                        {run.output.slice(0, 120)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create/Edit Modal ──

interface FormData {
  name: string
  command: string
  type: ScheduleType
  time: string
  dayOfWeek: number
  date: string
  intervalMinutes: number
}

const EMPTY_FORM: FormData = {
  name: '',
  command: '',
  type: 'daily',
  time: '09:00',
  dayOfWeek: 1,
  date: '',
  intervalMinutes: 60,
}

function ScheduleModal({
  task,
  onSave,
  onClose,
}: {
  task: ScheduledTask | null  // null = create mode
  onSave: (data: Partial<FormData>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<FormData>(() => {
    if (task) {
      return {
        name: task.name,
        command: task.command,
        type: task.type,
        time: task.time || '09:00',
        dayOfWeek: task.dayOfWeek ?? 1,
        date: task.date || '',
        intervalMinutes: task.intervalMinutes || 60,
      }
    }
    return { ...EMPTY_FORM }
  })
  const [saving, setSaving] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.name.trim() || !form.command.trim()) return
    setSaving(true)
    try {
      const data: Partial<FormData> = {
        name: form.name.trim(),
        command: form.command.trim(),
        type: form.type,
      }
      if (form.type === 'daily' || form.type === 'weekly' || form.type === 'once') {
        data.time = form.time
      }
      if (form.type === 'weekly') {
        data.dayOfWeek = form.dayOfWeek
      }
      if (form.type === 'once') {
        data.date = form.date
      }
      if (form.type === 'interval') {
        data.intervalMinutes = form.intervalMinutes
      }
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const isValid = form.name.trim() && form.command.trim() && (form.type !== 'once' || form.date)

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-[#141416] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-base font-semibold text-neutral-100">
            {task ? 'Edit Schedule' : 'New Schedule'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.06] transition-colors"
          >
            <IconX />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Daily report"
              className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none accent-ring"
              autoFocus
            />
          </div>

          {/* Command */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Command</label>
            <textarea
              value={form.command}
              onChange={(e) => update('command', e.target.value)}
              placeholder="The prompt or command to run..."
              rows={4}
              className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-neutral-200 font-mono placeholder:text-neutral-600 focus:outline-none accent-ring resize-none"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Type</label>
            <div className="flex gap-2">
              {(['once', 'daily', 'weekly', 'interval'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update('type', t)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    form.type === t
                      ? 'accent-bg accent-border text-white'
                      : 'bg-[#0e0e10] border-white/[0.06] text-neutral-400 hover:text-neutral-200 hover:border-white/[0.12]'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional fields */}
          {(form.type === 'daily' || form.type === 'weekly' || form.type === 'once') && (
            <div className="flex gap-4">
              {/* Date field for 'once' */}
              {form.type === 'once' && (
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => update('date', e.target.value)}
                    className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none accent-ring [color-scheme:dark]"
                  />
                </div>
              )}

              {/* Day selector for 'weekly' */}
              {form.type === 'weekly' && (
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Day</label>
                  <div className="flex gap-1">
                    {DAYS.map((day, i) => (
                      <button
                        key={day}
                        onClick={() => update('dayOfWeek', i)}
                        className={`flex-1 py-1.5 text-[10px] font-medium rounded-md border transition-colors ${
                          form.dayOfWeek === i
                            ? 'accent-bg accent-border text-white'
                            : 'bg-[#0e0e10] border-white/[0.06] text-neutral-500 hover:text-neutral-300 hover:border-white/[0.12]'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Time picker */}
              <div className={form.type === 'daily' ? 'flex-1' : 'w-28'}>
                <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Time</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => update('time', e.target.value)}
                  className="w-full bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none accent-ring [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          {form.type === 'interval' && (
            <div>
              <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">
                Interval (minutes)
              </label>
              <input
                type="number"
                min={1}
                value={form.intervalMinutes}
                onChange={(e) => update('intervalMinutes', Math.max(1, parseInt(e.target.value) || 1))}
                className="w-32 bg-[#0e0e10] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-neutral-200 font-mono focus:outline-none accent-ring"
              />
              <p className="text-[11px] text-neutral-600 mt-1.5">
                Runs every {form.intervalMinutes} minute{form.intervalMinutes !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className={`px-5 py-2 text-xs font-medium rounded-lg transition-colors ${
                isValid && !saving
                  ? 'accent-bg text-white hover:brightness-90'
                  : 'bg-white/[0.06] text-neutral-600 cursor-not-allowed'
              }`}
            >
              {saving ? 'Saving...' : task ? 'Save Changes' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Empty State ──

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 rounded-2xl accent-bg-10 flex items-center justify-center mb-5">
        <IconClock />
      </div>
      <h3 className="text-base font-semibold text-neutral-200 mb-2">No schedules yet</h3>
      <p className="text-sm text-neutral-500 max-w-xs mb-6">
        Schedules let you run prompts automatically -- daily reports, periodic checks, one-off reminders, and more.
      </p>
      <button
        onClick={onCreate}
        className="accent-bg text-white text-xs font-medium px-5 py-2.5 rounded-lg hover:brightness-90 transition-colors flex items-center gap-2"
      >
        <IconPlus />
        Create Schedule
      </button>
    </div>
  )
}

// ── Delete Confirm ──

function DeleteConfirm({
  name,
  onConfirm,
  onCancel,
}: {
  name: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onCancel() }}
    >
      <div className="bg-[#141416] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-neutral-100 mb-2">Delete Schedule</h3>
        <p className="text-sm text-neutral-400 mb-6">
          Are you sure you want to delete <span className="text-neutral-200 font-medium">"{name}"</span>? This cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 text-xs font-medium bg-red-500/90 text-white rounded-lg hover:bg-red-500 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──

export default function ScheduleView() {
  const [schedules, setSchedules] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [modalTask, setModalTask] = useState<ScheduledTask | null | undefined>(undefined) // undefined = closed, null = create
  const [deleteTask, setDeleteTask] = useState<ScheduledTask | null>(null)

  // Load schedules
  const loadSchedules = useCallback(async () => {
    try {
      const result = await aios().listSchedules()
      setSchedules(result || [])
    } catch {
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  // Listen for changes
  useEffect(() => {
    const api = aios()
    if (!api?.onSchedulesChanged) return
    const unsub = api.onSchedulesChanged(() => {
      loadSchedules()
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [loadSchedules])

  // Handlers
  const handleCreate = useCallback(async (data: Partial<FormData>) => {
    await aios().createSchedule(data)
    setModalTask(undefined)
    loadSchedules()
  }, [loadSchedules])

  const handleUpdate = useCallback(async (data: Partial<FormData>) => {
    if (!modalTask) return
    await aios().updateSchedule(modalTask.id, data)
    setModalTask(undefined)
    loadSchedules()
  }, [modalTask, loadSchedules])

  const handleDelete = useCallback(async () => {
    if (!deleteTask) return
    await aios().deleteSchedule(deleteTask.id)
    setDeleteTask(null)
    loadSchedules()
  }, [deleteTask, loadSchedules])

  const handleToggle = useCallback(async (id: string) => {
    await aios().toggleSchedule(id)
    loadSchedules()
  }, [loadSchedules])

  const handleRunNow = useCallback(async (id: string) => {
    await aios().runScheduleNow(id)
    loadSchedules()
  }, [loadSchedules])

  // Sort: enabled first, then by nextRun ascending
  const sorted = [...schedules].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    const aNext = a.nextRun ?? Infinity
    const bNext = b.nextRun ?? Infinity
    return aNext - bNext
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-neutral-600">Loading schedules...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
        <h1 className="text-base font-semibold text-neutral-100">Schedules</h1>
        {schedules.length > 0 && (
          <button
            onClick={() => setModalTask(null)}
            className="accent-bg text-white text-xs font-medium px-4 py-2 rounded-lg hover:brightness-90 transition-colors flex items-center gap-2"
          >
            <IconPlus />
            New Schedule
          </button>
        )}
      </div>

      {/* Content */}
      {schedules.length === 0 ? (
        <EmptyState onCreate={() => setModalTask(null)} />
      ) : (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-3">
            {sorted.map((task) => (
              <ScheduleCard
                key={task.id}
                task={task}
                onEdit={() => setModalTask(task)}
                onDelete={() => setDeleteTask(task)}
                onToggle={() => handleToggle(task.id)}
                onRunNow={() => handleRunNow(task.id)}
              />
            ))}
          </div>

          {/* Summary */}
          <div className="mt-4 text-[11px] text-neutral-600 text-center">
            {schedules.filter((s) => s.enabled).length} active / {schedules.length} total
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalTask !== undefined && (
        <ScheduleModal
          task={modalTask}
          onSave={modalTask ? handleUpdate : handleCreate}
          onClose={() => setModalTask(undefined)}
        />
      )}

      {/* Delete Confirm */}
      {deleteTask && (
        <DeleteConfirm
          name={deleteTask.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTask(null)}
        />
      )}
    </div>
  )
}
