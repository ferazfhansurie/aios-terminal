import Database from 'better-sqlite3'
import path from 'path'
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

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_credits_date ON credits(date);
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
  getDb().prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, title, now, now)
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

export function closeDb() {
  if (db) db.close()
}
