import Database from 'better-sqlite3'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'

let db: Database.Database

export function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'aios.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      tool_calls TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      credits_used REAL NOT NULL DEFAULT 0,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      conversation_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('once', 'daily', 'weekly', 'interval')),
      time TEXT,
      day_of_week INTEGER,
      date TEXT,
      interval_minutes INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run INTEGER,
      last_status TEXT,
      last_output TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedule_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      output TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_credits_date ON credits(date);
    CREATE INDEX IF NOT EXISTS idx_schedule_runs ON schedule_runs(schedule_id);
  `)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ── Conversations ──

export function createConversation(id: string, title: string) {
  const now = Date.now()
  // Use INSERT OR IGNORE to handle duplicate IDs gracefully
  const result = getDb().prepare(
    'INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, title, now, now)

  // If conversation already exists, just return the existing one
  if (result.changes === 0) {
    const existing = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any
    return existing || { id, title, created_at: now, updated_at: now }
  }

  return { id, title, created_at: now, updated_at: now }
}

export function listConversations(limit = 50) {
  return getDb().prepare(
    'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?'
  ).all(limit)
}

export function updateConversation(id: string, updates: { title?: string; session_id?: string }) {
  const sets: string[] = ['updated_at = ?']
  const vals: any[] = [Date.now()]
  if (updates.title) { sets.push('title = ?'); vals.push(updates.title) }
  if (updates.session_id) { sets.push('session_id = ?'); vals.push(updates.session_id) }
  vals.push(id)
  getDb().prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function deleteConversation(id: string) {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

// ── Messages ──

export function addMessage(conversationId: string, role: string, content: string, tokensUsed = 0, toolCalls?: string) {
  getDb().prepare(
    'INSERT INTO messages (conversation_id, role, content, tokens_used, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(conversationId, role, content, tokensUsed, toolCalls || null, Date.now())
}

export function getMessages(conversationId: string) {
  return getDb().prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId)
}

// ── Credits ──

export function addCreditUsage(tokensUsed: number, conversationId?: string) {
  const today = new Date().toISOString().split('T')[0]
  const credits = tokensUsed / 10
  getDb().prepare(
    'INSERT INTO credits (date, credits_used, tokens_used, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(today, credits, tokensUsed, conversationId || null, Date.now())
}

export function getCreditsUsedToday(): number {
  const today = new Date().toISOString().split('T')[0]
  const row = getDb().prepare(
    'SELECT COALESCE(SUM(credits_used), 0) as total FROM credits WHERE date = ?'
  ).get(today) as any
  return row?.total || 0
}

export function getCreditHistory(days = 7) {
  return getDb().prepare(
    `SELECT date, SUM(credits_used) as credits, SUM(tokens_used) as tokens
     FROM credits
     WHERE date >= date('now', ?)
     GROUP BY date
     ORDER BY date DESC`
  ).all(`-${days} days`)
}

// ── Auth ──

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
}

export function registerUser(email: string, password: string, name: string): { success: boolean; error?: string } {
  const existing = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    return { success: false, error: 'Email already registered' }
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)
  getDb().prepare(
    'INSERT INTO users (email, password_hash, salt, name, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(email, passwordHash, salt, name, 'free', Date.now())
  return { success: true }
}

export function loginUser(email: string, password: string): { success: boolean; tier?: string; name?: string; error?: string } {
  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as any
  if (!user) {
    return { success: false, error: 'No account found with this email' }
  }
  const hash = hashPassword(password, user.salt)
  if (hash !== user.password_hash) {
    return { success: false, error: 'Invalid password' }
  }
  return { success: true, tier: user.tier, name: user.name }
}

export function getUserTier(email: string): string {
  const user = getDb().prepare('SELECT tier FROM users WHERE email = ?').get(email) as any
  return user?.tier || 'free'
}

export function setUserTier(email: string, tier: string) {
  getDb().prepare('UPDATE users SET tier = ? WHERE email = ?').run(tier, email)
}

export function ensureProUser(email: string, name: string) {
  const existing = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    getDb().prepare('UPDATE users SET tier = ? WHERE email = ?').run('pro', email)
  } else {
    // Create the user with a default password hash (owner can reset later)
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = hashPassword('aios2026', salt)
    getDb().prepare(
      'INSERT INTO users (email, password_hash, salt, name, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(email, passwordHash, salt, name, 'pro', Date.now())
  }
}

// ── Schedules ──

export function createSchedule(data: {
  id: string; name: string; command: string; type: string
  time?: string; dayOfWeek?: number; date?: string; intervalMinutes?: number
}) {
  const now = Date.now()
  getDb().prepare(
    `INSERT INTO schedules (id, name, command, type, time, day_of_week, date, interval_minutes, enabled, run_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
  ).run(data.id, data.name, data.command, data.type, data.time || null, data.dayOfWeek ?? null, data.date || null, data.intervalMinutes ?? null, now, now)
  return getSchedule(data.id)
}

export function getSchedule(id: string) {
  return getDb().prepare('SELECT * FROM schedules WHERE id = ?').get(id) as any
}

export function listSchedules() {
  return getDb().prepare('SELECT * FROM schedules ORDER BY created_at DESC').all()
}

export function updateSchedule(id: string, data: Record<string, any>) {
  const allowed = ['name', 'command', 'type', 'time', 'day_of_week', 'date', 'interval_minutes', 'enabled', 'last_run', 'last_status', 'last_output', 'run_count']
  const sets: string[] = ['updated_at = ?']
  const vals: any[] = [Date.now()]
  for (const key of allowed) {
    if (key in data) {
      sets.push(`${key} = ?`)
      vals.push(data[key] ?? null)
    }
  }
  vals.push(id)
  getDb().prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return getSchedule(id)
}

export function deleteSchedule(id: string) {
  getDb().prepare('DELETE FROM schedules WHERE id = ?').run(id)
}

export function addScheduleRun(scheduleId: string, status: string, output?: string, startedAt?: number) {
  const now = Date.now()
  getDb().prepare(
    'INSERT INTO schedule_runs (schedule_id, status, output, started_at, completed_at) VALUES (?, ?, ?, ?, ?)'
  ).run(scheduleId, status, output || null, startedAt || now, now)
  // Keep only last 50 runs per schedule
  getDb().prepare(
    `DELETE FROM schedule_runs WHERE schedule_id = ? AND id NOT IN (
      SELECT id FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT 50
    )`
  ).run(scheduleId, scheduleId)
}

export function getScheduleRuns(scheduleId: string, limit = 20) {
  return getDb().prepare(
    'SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT ?'
  ).all(scheduleId, limit)
}

export function closeDb() {
  if (db) db.close()
}
