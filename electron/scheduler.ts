import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'

export interface ScheduledTask {
  id: string
  name: string
  command: string
  type: 'once' | 'daily' | 'weekly' | 'interval'
  time?: string            // HH:MM for daily/weekly/once
  dayOfWeek?: number       // 0=Sun..6=Sat for weekly
  date?: string            // YYYY-MM-DD for once
  intervalMinutes?: number // for interval type
  enabled: boolean
  lastRun?: number
  lastStatus?: 'success' | 'pending' | 'skipped'
  createdAt: number
  history: { timestamp: number; status: string }[]
}

let schedulesPath = ''
let checkInterval: ReturnType<typeof setInterval> | null = null
let win: BrowserWindow | null = null
let sendCommandFn: ((cmd: string) => void) | null = null

function readSchedules(): ScheduledTask[] {
  if (!schedulesPath || !fs.existsSync(schedulesPath)) return []
  try {
    return JSON.parse(fs.readFileSync(schedulesPath, 'utf-8'))
  } catch {
    return []
  }
}

function writeSchedules(tasks: ScheduledTask[]) {
  if (!schedulesPath) return
  const dir = path.dirname(schedulesPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(schedulesPath, JSON.stringify(tasks, null, 2), 'utf-8')
  win?.webContents.send('schedules:changed')
}

function generateId(): string {
  return `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Calculate next run time for a task */
export function getNextRun(task: ScheduledTask): number | null {
  if (!task.enabled) return null
  const now = new Date()

  if (task.type === 'once') {
    if (!task.date || !task.time) return null
    const [h, m] = task.time.split(':').map(Number)
    const d = new Date(task.date + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    return d.getTime() > now.getTime() ? d.getTime() : null
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
    if (!task.time || task.dayOfWeek === undefined) return null
    const [h, m] = task.time.split(':').map(Number)
    const next = new Date()
    next.setHours(h, m, 0, 0)
    const currentDay = next.getDay()
    let daysUntil = task.dayOfWeek - currentDay
    if (daysUntil < 0) daysUntil += 7
    if (daysUntil === 0 && next.getTime() <= now.getTime()) daysUntil = 7
    next.setDate(next.getDate() + daysUntil)
    return next.getTime()
  }

  if (task.type === 'interval') {
    if (!task.intervalMinutes) return null
    const base = task.lastRun || task.createdAt
    const next = base + task.intervalMinutes * 60 * 1000
    return next > now.getTime() ? next : now.getTime() + 1000 // due now
  }

  return null
}

/** Check if a task is due to run */
function isDue(task: ScheduledTask): boolean {
  if (!task.enabled) return false
  const nextRun = getNextRun(task)
  if (!nextRun) return false
  const now = Date.now()
  // Due if within 30 seconds of the scheduled time
  // and hasn't run in the last 2 minutes (prevent double-fire)
  const recentlyRan = task.lastRun && (now - task.lastRun) < 120_000
  return nextRun <= now + 30_000 && !recentlyRan
}

/** Main check loop — runs every 30 seconds */
function checkSchedules() {
  const tasks = readSchedules()
  let changed = false

  for (const task of tasks) {
    if (isDue(task)) {
      // Execute the command
      if (sendCommandFn) {
        sendCommandFn(task.command)
      }
      task.lastRun = Date.now()
      task.lastStatus = 'success'
      task.history.push({ timestamp: Date.now(), status: 'executed' })
      // Keep only last 20 history entries
      if (task.history.length > 20) task.history = task.history.slice(-20)
      // Disable one-time tasks after execution
      if (task.type === 'once') task.enabled = false
      changed = true
    }
  }

  if (changed) writeSchedules(tasks)
}

export function setupScheduler(
  window: BrowserWindow,
  cwd: string,
  commandSender: (cmd: string) => void
) {
  win = window
  sendCommandFn = commandSender
  schedulesPath = path.join(cwd, '.claude', 'schedules.json')

  // Clear old handlers
  ipcMain.removeHandler('schedules:list')
  ipcMain.removeHandler('schedules:create')
  ipcMain.removeHandler('schedules:update')
  ipcMain.removeHandler('schedules:delete')
  ipcMain.removeHandler('schedules:toggle')
  ipcMain.removeHandler('schedules:run-now')

  ipcMain.handle('schedules:list', () => {
    const tasks = readSchedules()
    // Enrich with next run times
    return tasks.map(t => ({
      ...t,
      nextRun: getNextRun(t),
    }))
  })

  ipcMain.handle('schedules:create', (_event, data: Partial<ScheduledTask>) => {
    const tasks = readSchedules()
    const task: ScheduledTask = {
      id: generateId(),
      name: data.name || 'Untitled',
      command: data.command || '',
      type: data.type || 'daily',
      time: data.time,
      dayOfWeek: data.dayOfWeek,
      date: data.date,
      intervalMinutes: data.intervalMinutes,
      enabled: true,
      createdAt: Date.now(),
      history: [],
    }
    tasks.push(task)
    writeSchedules(tasks)
    return { ...task, nextRun: getNextRun(task) }
  })

  ipcMain.handle('schedules:update', (_event, id: string, data: Partial<ScheduledTask>) => {
    const tasks = readSchedules()
    const idx = tasks.findIndex(t => t.id === id)
    if (idx === -1) return null
    tasks[idx] = { ...tasks[idx], ...data, id } // preserve id
    writeSchedules(tasks)
    return { ...tasks[idx], nextRun: getNextRun(tasks[idx]) }
  })

  ipcMain.handle('schedules:delete', (_event, id: string) => {
    const tasks = readSchedules().filter(t => t.id !== id)
    writeSchedules(tasks)
    return true
  })

  ipcMain.handle('schedules:toggle', (_event, id: string) => {
    const tasks = readSchedules()
    const task = tasks.find(t => t.id === id)
    if (!task) return false
    task.enabled = !task.enabled
    writeSchedules(tasks)
    return task.enabled
  })

  ipcMain.handle('schedules:run-now', (_event, id: string) => {
    const tasks = readSchedules()
    const task = tasks.find(t => t.id === id)
    if (!task || !sendCommandFn) return false
    sendCommandFn(task.command)
    task.lastRun = Date.now()
    task.lastStatus = 'success'
    task.history.push({ timestamp: Date.now(), status: 'manual' })
    if (task.history.length > 20) task.history = task.history.slice(-20)
    writeSchedules(tasks)
    return true
  })

  // Start the check loop
  if (checkInterval) clearInterval(checkInterval)
  checkInterval = setInterval(checkSchedules, 30_000)
}

export function updateSchedulerCwd(cwd: string) {
  schedulesPath = path.join(cwd, '.claude', 'schedules.json')
}

export function destroyScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}
