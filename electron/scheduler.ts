import { ipcMain, BrowserWindow } from 'electron'
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, addScheduleRun, getScheduleRuns, getSchedule } from './db'

let checkInterval: ReturnType<typeof setInterval> | null = null
let win: BrowserWindow | null = null
let sendCommandFn: ((cmd: string) => void) | null = null

function generateId(): string {
  return `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Calculate next run time for a task */
export function getNextRun(task: any): number | null {
  if (!task.enabled) return null
  const now = new Date()

  if (task.type === 'once') {
    if (!task.date || !task.time) return null
    const [h, m] = task.time.split(':').map(Number)
    const d = new Date(task.date + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    const taskTime = d.getTime()
    if (taskTime > now.getTime()) return taskTime
    if (!task.last_run && (now.getTime() - taskTime) < 600_000) return taskTime
    return null
  }

  if (task.type === 'daily') {
    if (!task.time) return null
    const [h, m] = task.time.split(':').map(Number)
    const next = new Date()
    next.setHours(h, m, 0, 0)
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
    return next.getTime()
  }

  if (task.type === 'weekly') {
    if (!task.time || task.day_of_week === undefined || task.day_of_week === null) return null
    const [h, m] = task.time.split(':').map(Number)
    const next = new Date()
    next.setHours(h, m, 0, 0)
    const currentDay = next.getDay()
    let daysUntil = task.day_of_week - currentDay
    if (daysUntil < 0) daysUntil += 7
    if (daysUntil === 0 && next.getTime() <= now.getTime()) daysUntil = 7
    next.setDate(next.getDate() + daysUntil)
    return next.getTime()
  }

  if (task.type === 'interval') {
    if (!task.interval_minutes) return null
    const base = task.last_run || task.created_at
    const next = base + task.interval_minutes * 60 * 1000
    return next > now.getTime() ? next : now.getTime() + 1000
  }

  return null
}

function isDue(task: any): boolean {
  if (!task.enabled) return false
  const nextRun = getNextRun(task)
  if (!nextRun) return false
  const now = Date.now()
  const recentlyRan = task.last_run && (now - task.last_run) < 120_000
  return nextRun <= now + 30_000 && !recentlyRan
}

function checkSchedules() {
  try {
    const tasks = listSchedules()
    for (const task of tasks) {
      if (isDue(task as any)) {
        const startedAt = Date.now()
        if (sendCommandFn) sendCommandFn((task as any).command)

        updateSchedule((task as any).id, {
          last_run: startedAt,
          last_status: 'success',
          run_count: ((task as any).run_count || 0) + 1,
        })
        addScheduleRun((task as any).id, 'success', undefined, startedAt)

        if ((task as any).type === 'once') {
          updateSchedule((task as any).id, { enabled: 0 })
        }
        broadcastScheduleChange()
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in check loop:', err)
  }
}

function broadcastScheduleChange() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('schedules:changed')
  }
}

function enrichSchedules(tasks: any[]) {
  return tasks.map(t => ({
    ...t,
    enabled: !!t.enabled,
    nextRun: getNextRun(t),
  }))
}

export function setupScheduler(
  window: BrowserWindow,
  _cwd: string,
  commandSender: (cmd: string) => void
) {
  win = window
  sendCommandFn = commandSender

  ipcMain.removeHandler('schedules:list')
  ipcMain.removeHandler('schedules:get')
  ipcMain.removeHandler('schedules:create')
  ipcMain.removeHandler('schedules:update')
  ipcMain.removeHandler('schedules:delete')
  ipcMain.removeHandler('schedules:toggle')
  ipcMain.removeHandler('schedules:run-now')
  ipcMain.removeHandler('schedules:runs')

  ipcMain.handle('schedules:list', () => enrichSchedules(listSchedules()))

  ipcMain.handle('schedules:get', (_event, id: string) => {
    const task = getSchedule(id)
    if (!task) return null
    return { ...task, enabled: !!task.enabled, nextRun: getNextRun(task) }
  })

  ipcMain.handle('schedules:create', (_event, data: any) => {
    const id = generateId()
    const task = createSchedule({
      id,
      name: data.name || 'Untitled',
      command: data.command || '',
      type: data.type || 'daily',
      time: data.time,
      dayOfWeek: data.dayOfWeek,
      date: data.date,
      intervalMinutes: data.intervalMinutes,
    })
    broadcastScheduleChange()
    return task ? { ...task, enabled: !!task.enabled, nextRun: getNextRun(task) } : null
  })

  ipcMain.handle('schedules:update', (_event, id: string, data: any) => {
    const mapped: Record<string, any> = {}
    if ('name' in data) mapped.name = data.name
    if ('command' in data) mapped.command = data.command
    if ('type' in data) mapped.type = data.type
    if ('time' in data) mapped.time = data.time
    if ('dayOfWeek' in data) mapped.day_of_week = data.dayOfWeek
    if ('date' in data) mapped.date = data.date
    if ('intervalMinutes' in data) mapped.interval_minutes = data.intervalMinutes
    if ('enabled' in data) mapped.enabled = data.enabled ? 1 : 0
    const task = updateSchedule(id, mapped)
    broadcastScheduleChange()
    return task ? { ...task, enabled: !!task.enabled, nextRun: getNextRun(task) } : null
  })

  ipcMain.handle('schedules:delete', (_event, id: string) => {
    deleteSchedule(id)
    broadcastScheduleChange()
    return true
  })

  ipcMain.handle('schedules:toggle', (_event, id: string) => {
    const task = getSchedule(id)
    if (!task) return false
    const newEnabled = task.enabled ? 0 : 1
    updateSchedule(id, { enabled: newEnabled })
    broadcastScheduleChange()
    return !!newEnabled
  })

  ipcMain.handle('schedules:run-now', (_event, id: string) => {
    const task = getSchedule(id)
    if (!task || !sendCommandFn) return false
    sendCommandFn(task.command)
    const startedAt = Date.now()
    updateSchedule(id, {
      last_run: startedAt,
      last_status: 'success',
      run_count: (task.run_count || 0) + 1,
    })
    addScheduleRun(id, 'success', 'Manual trigger', startedAt)
    broadcastScheduleChange()
    return true
  })

  ipcMain.handle('schedules:runs', (_event, id: string, limit?: number) => {
    return getScheduleRuns(id, limit)
  })

  if (checkInterval) clearInterval(checkInterval)
  setTimeout(checkSchedules, 2000)
  checkInterval = setInterval(checkSchedules, 30_000)
}

export function updateSchedulerCwd(_cwd: string) {
  // No-op — schedules are in SQLite, not per-instance JSON
}

export function destroyScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}
