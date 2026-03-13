import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { query } from "@anthropic-ai/claude-code";
import path from "path";
import os from "os";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { initWhatsApp, listConnections, addConnection, removeConnection, connectClient, disconnectClient, destroyAll } from "./whatsapp.js";

// ═══ Version ═══
const VERSION = "0.4.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──
const AIOS_PASSWORD = process.env.AIOS_PASSWORD || "aios2024";
const DEFAULT_CWD = process.env.AIOS_CWD || path.join(os.homedir(), "Repo/firaz/adletic/aios-firaz");
const PORT = parseInt(process.env.PORT || "3456");
const BIND_HOST = process.env.AIOS_HOST || "0.0.0.0";
const MAX_CONNECTIONS = parseInt(process.env.AIOS_MAX_CONN || "5");
const MAX_TURNS = parseInt(process.env.AIOS_MAX_TURNS || "200");
const MAX_PROMPT_LENGTH = 50_000;
const FREE_DAILY_CREDITS = 500;

// ── Validate CWD ──
if (!fs.existsSync(DEFAULT_CWD)) {
  console.error(`[fatal] CWD does not exist: ${DEFAULT_CWD}`);
  process.exit(1);
}

// ── System prompt for AI guardrails ──
const AIOS_SYSTEM_PROMPT = `You are running on bisnesgpt server (production). Be concise, direct, and take action.

WEB SELF-UPDATE PROCEDURE — when asked to update or deploy the web UI:
1. Source repo is at ~/aios-terminal (git, has vite.web.config.ts)
2. Edit source files in ~/aios-terminal/src/ or ~/aios-terminal/web/
3. Build: cd ~/aios-terminal && source ~/.nvm/nvm.sh && npx vite build --config vite.web.config.ts
4. Deploy: rm -rf ~/aios-web/dist/assets/* && cp -r ~/aios-terminal/web/dist/* ~/aios-web/dist/
5. For server changes: cp ~/aios-terminal/web/server.ts ~/aios-web/server.ts && pm2 restart aios-web
6. NEVER create standalone HTML apps with CDN scripts. ALWAYS use the Vite build pipeline.
7. NEVER replace dist/index.html with hand-written HTML. It must come from the Vite build.
8. After deploying server changes, commit: cd ~/aios-terminal && git add -A && git commit -m "description" && git push

Your working directory is ${DEFAULT_CWD}. You can also work in ~/aios-terminal for web updates.`;

// ── Session tokens ──
const validSessions = new Set<string>();

function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  validSessions.add(token);
  return token;
}

function isValidSession(token: string | undefined | null): boolean {
  return !!token && validSessions.has(token);
}

// ═══ SQLITE DATABASE ═══
const DB_PATH = path.join(DEFAULT_CWD, ".aios-web.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

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
    conversation_id TEXT NOT NULL,
    role TEXT CHECK(role IN ('user', 'assistant')) NOT NULL,
    content TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    tool_calls TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    credits_used REAL NOT NULL DEFAULT 0,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    conversation_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credits_date ON credits(date);
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    type TEXT CHECK(type IN ('once', 'daily', 'weekly', 'interval')) NOT NULL,
    time TEXT,
    day_of_week INTEGER,
    date TEXT,
    interval_minutes INTEGER,
    enabled INTEGER DEFAULT 1,
    last_run INTEGER,
    last_status TEXT,
    last_output TEXT,
    run_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schedule_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id TEXT NOT NULL,
    status TEXT NOT NULL,
    output TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_runs_sched ON schedule_runs(schedule_id);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT,
    tier TEXT DEFAULT 'free',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// Ensure default instance exists
const defaultInstanceId = "default";
db.prepare("INSERT OR IGNORE INTO instances (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
  defaultInstanceId, path.basename(DEFAULT_CWD), DEFAULT_CWD, Date.now()
);
let activeCwd = DEFAULT_CWD;
let activeInstanceId = defaultInstanceId;

// DB helpers
const stmts = {
  createConv: db.prepare("INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"),
  listConvs: db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?"),
  updateConv: db.prepare("UPDATE conversations SET title = COALESCE(?, title), session_id = COALESCE(?, session_id), updated_at = ? WHERE id = ?"),
  deleteConv: db.prepare("DELETE FROM conversations WHERE id = ?"),
  deleteConvMsgs: db.prepare("DELETE FROM messages WHERE conversation_id = ?"),
  getMessages: db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"),
  addMessage: db.prepare("INSERT INTO messages (conversation_id, role, content, tokens_used, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
  getCreditsToday: db.prepare("SELECT COALESCE(SUM(credits_used), 0) as total FROM credits WHERE date = ?"),
  addCredit: db.prepare("INSERT INTO credits (date, credits_used, tokens_used, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)"),
  getCreditHistory: db.prepare("SELECT date, SUM(credits_used) as credits FROM credits WHERE date >= ? GROUP BY date ORDER BY date DESC"),
  // Schedules
  createSchedule: db.prepare("INSERT INTO schedules (id, name, command, type, time, day_of_week, date, interval_minutes, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"),
  getSchedule: db.prepare("SELECT * FROM schedules WHERE id = ?"),
  listSchedules: db.prepare("SELECT * FROM schedules ORDER BY created_at DESC"),
  updateSchedule: db.prepare("UPDATE schedules SET name=?, command=?, type=?, time=?, day_of_week=?, date=?, interval_minutes=?, updated_at=? WHERE id=?"),
  deleteSchedule: db.prepare("DELETE FROM schedules WHERE id = ?"),
  toggleSchedule: db.prepare("UPDATE schedules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?"),
  markScheduleRun: db.prepare("UPDATE schedules SET last_run=?, last_status=?, last_output=?, run_count=run_count+1, updated_at=? WHERE id=?"),
  addScheduleRun: db.prepare("INSERT INTO schedule_runs (schedule_id, status, output, started_at) VALUES (?, ?, ?, ?)"),
  getScheduleRuns: db.prepare("SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT ?"),
  pruneRuns: db.prepare("DELETE FROM schedule_runs WHERE schedule_id = ? AND id NOT IN (SELECT id FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT 50)"),
};

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Load MCP servers ──
let mcpServers: Record<string, any> | undefined;
function getMcpConfigPath() { return path.join(activeCwd, ".mcp.json"); }
const mcpConfigPath = getMcpConfigPath();
if (fs.existsSync(mcpConfigPath)) {
  try {
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
    if (mcpConfig.mcpServers) {
      mcpServers = mcpConfig.mcpServers;
    }
  } catch {}
}

// ═══ EXPRESS ═══
const app = express();
app.disable("x-powered-by");
const server = createServer(app);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Serve the React build from web/dist
const staticDir = path.join(__dirname, "dist");
if (fs.existsSync(staticDir)) {
  // HTML: no-cache (always fresh). Assets: hashed filenames, cache forever.
  app.use(express.static(staticDir, {
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));
}

app.use(express.json({ limit: "50mb" }));

// ── Auth helpers ──
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/register", (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) { res.status(409).json({ error: "Email already registered" }); return; }
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  db.prepare("INSERT INTO users (email, password_hash, salt, name, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(email, passwordHash, salt, name || "", "free", Date.now());
  res.json({ success: true, token: createSession(), tier: "free", name: name || "" });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  // Legacy: password-only login for backward compat
  if (!email && password) {
    if (password !== AIOS_PASSWORD) { res.status(401).json({ error: "Wrong password" }); return; }
    res.json({ token: createSession() });
    return;
  }
  if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user) { res.status(401).json({ error: "No account found with this email" }); return; }
  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) { res.status(401).json({ error: "Invalid password" }); return; }
  res.json({ success: true, token: createSession(), tier: user.tier || "free", name: user.name || "" });
});

function requireToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.query.token as string) || req.headers.authorization?.replace("Bearer ", "");
  if (!isValidSession(token)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ═══ CONVERSATION API ═══
app.post("/api/conversations", requireToken, (req, res) => {
  const { id, title } = req.body;
  const now = Date.now();
  stmts.createConv.run(id, title || "New chat", now, now);
  res.json({ ok: true });
});

app.get("/api/conversations", requireToken, (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const rows = stmts.listConvs.all(limit) as any[];
  res.json(rows);
});

app.put("/api/conversations/:id", requireToken, (req, res) => {
  const { title, session_id } = req.body;
  stmts.updateConv.run(title || null, session_id || null, Date.now(), req.params.id);
  res.json({ ok: true });
});

app.delete("/api/conversations/:id", requireToken, (req, res) => {
  stmts.deleteConvMsgs.run(req.params.id);
  stmts.deleteConv.run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/conversations/:id/messages", requireToken, (req, res) => {
  const rows = stmts.getMessages.all(req.params.id) as any[];
  res.json(rows);
});

app.post("/api/conversations/:id/messages", requireToken, (req, res) => {
  const { role, content, tokens, toolCalls } = req.body;
  stmts.addMessage.run(req.params.id, role, content, tokens || 0, toolCalls || null, Date.now());
  res.json({ ok: true });
});

// ═══ CREDITS API ═══
app.get("/api/credits/today", requireToken, (_req, res) => {
  const row = stmts.getCreditsToday.get(todayStr()) as any;
  res.json({ used: row?.total || 0 });
});

app.get("/api/credits/history", requireToken, (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const rows = stmts.getCreditHistory.all(since);
  res.json(rows);
});

app.get("/api/credits/limit", requireToken, (_req, res) => {
  res.json({ limit: FREE_DAILY_CREDITS });
});

// ═══ FILES API ═══
function safePath(rel: string): string | null {
  const resolved = path.resolve(activeCwd, rel);
  return resolved.startsWith(activeCwd) ? resolved : null;
}

// Claude directory structure
app.get("/api/claude-dir", requireToken, (_req, res) => {
  const claudeDir = path.join(activeCwd, ".claude");
  const result: any = { commands: [], skills: [], context: [], memory: [], outputs: [], settings: null };

  const cmdsDir = path.join(claudeDir, "commands");
  if (fs.existsSync(cmdsDir)) {
    result.commands = fs.readdirSync(cmdsDir).filter(f => f.endsWith(".md")).map(f => ({
      name: f.replace(".md", ""), filename: path.join(cmdsDir, f),
    }));
  }

  const skillsDir = path.join(claudeDir, "skills");
  if (fs.existsSync(skillsDir)) {
    result.skills = fs.readdirSync(skillsDir).map(f => ({
      name: f.replace(".md", ""), dirname: path.join(skillsDir, f),
      isDir: fs.statSync(path.join(skillsDir, f)).isDirectory(),
    }));
  }

  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
  const ctxDir = path.join(claudeDir, "context");
  if (fs.existsSync(ctxDir)) {
    result.context = fs.readdirSync(ctxDir)
      .filter(f => f.endsWith(".md") || IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map(f => ({ name: f.endsWith(".md") ? f.replace(".md", "") : f, filename: path.join(ctxDir, f) }));
  }

  // Memory from Claude's project dir
  const encodedCwd = activeCwd.replace(/\//g, "-");
  const memoryDir = path.join(os.homedir(), `.claude/projects/${encodedCwd}/memory`);
  if (fs.existsSync(memoryDir)) {
    result.memory = fs.readdirSync(memoryDir).filter(f => f.endsWith(".md")).map(f => ({
      name: f.replace(".md", ""), filename: path.join(memoryDir, f),
    }));
  }

  const outputsDir = path.join(activeCwd, "outputs");
  if (fs.existsSync(outputsDir)) {
    result.outputs = fs.readdirSync(outputsDir)
      .filter(f => !fs.statSync(path.join(outputsDir, f)).isDirectory())
      .map(f => ({ name: f, filename: path.join(outputsDir, f) }));
  }

  const settingsPath = path.join(claudeDir, "settings.json");
  if (fs.existsSync(settingsPath)) {
    try { result.settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")); } catch {}
  }

  res.json(result);
});

app.get("/api/files/read", requireToken, (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: "Missing path" }); return; }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

app.post("/api/files/write", requireToken, (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) { res.status(400).json({ error: "Missing path" }); return; }
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/files/image", requireToken, (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: "Missing path" }); return; }
  try {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : "image/png";
    const data = fs.readFileSync(filePath);
    res.json({ dataUrl: `data:${mime};base64,${data.toString("base64")}` });
  } catch {
    res.status(404).json({ error: "Image not found" });
  }
});

app.post("/api/files/temp-image", requireToken, (req, res) => {
  const { base64Data, mimeType } = req.body;
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/gif" ? "gif" : "jpg";
  const tmpDir = path.join(activeCwd, "files");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `paste-${Date.now()}.${ext}`);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  res.json({ path: filePath });
});

app.post("/api/files/upload", requireToken, (req, res) => {
  const { name, base64Data } = req.body;
  if (!name || !base64Data) { res.status(400).json({ error: "Missing name or data" }); return; }
  const tmpDir = path.join(activeCwd, "files");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(tmpDir, `${Date.now()}-${safeName}`);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  res.json({ path: filePath });
});

app.get("/api/files", requireToken, (req, res) => {
  const rel = typeof req.query.path === "string" ? req.query.path : "";
  const target = safePath(rel);
  if (!target) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      res.status(404).json({ error: "Not found" }); return;
    }
    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter(e => !e.name.startsWith(".") && e.name !== "node_modules")
      .slice(0, 100)
      .map(e => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
    res.json({ path: path.relative(activeCwd, target) || ".", entries });
  } catch { res.json({ path: rel, entries: [] }); }
});

// Browse any directory on the server (for folder picker)
app.get("/api/browse", requireToken, (req, res) => {
  const dirPath = typeof req.query.path === "string" ? req.query.path : os.homedir();
  const resolved = path.resolve(dirPath);
  try {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      res.status(404).json({ error: "Not a directory" }); return;
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "__pycache__")
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 100)
      .map(e => e.name);
    const hasClaude = fs.existsSync(path.join(resolved, ".claude"));
    res.json({ path: resolved, parent: path.dirname(resolved), entries, hasClaude });
  } catch { res.json({ path: resolved, parent: path.dirname(resolved), entries: [], hasClaude: false }); }
});

// ═══ INSTANCES API ═══
app.get("/api/instances", requireToken, (_req, res) => {
  const rows = db.prepare("SELECT * FROM instances ORDER BY created_at ASC").all();
  res.json(rows);
});

app.get("/api/instances/active", requireToken, (_req, res) => {
  res.json({ id: activeInstanceId, name: path.basename(activeCwd), path: activeCwd });
});

app.post("/api/instances", requireToken, (req, res) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: "Missing name" }); return; }
  // Create new instance folder under home
  const folderPath = path.join(os.homedir(), "aios-workspaces", name.replace(/[^a-zA-Z0-9_-]/g, "-"));
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
  const claudeDir = path.join(folderPath, ".claude");
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
  const id = `aios-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  db.prepare("INSERT INTO instances (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(id, name, folderPath, Date.now());
  const instance = { id, name, path: folderPath, created_at: Date.now() };
  activeInstanceId = id;
  activeCwd = folderPath;
  res.json(instance);
});

app.post("/api/instances/add-folder", requireToken, (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) { res.status(400).json({ error: "Missing folderPath" }); return; }
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) { res.status(400).json({ error: "Folder does not exist" }); return; }
  if (!fs.statSync(resolved).isDirectory()) { res.status(400).json({ error: "Path is not a directory" }); return; }
  // Check for .claude/ dir
  const claudeDir = path.join(resolved, ".claude");
  if (!fs.existsSync(claudeDir)) {
    // Auto-create .claude/ so any folder can be used
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  // Check for duplicate
  const existing = db.prepare("SELECT * FROM instances WHERE path = ?").get(resolved) as any;
  if (existing) {
    activeInstanceId = existing.id;
    activeCwd = existing.path;
    res.json(existing);
    return;
  }
  const folderName = path.basename(resolved);
  const id = `aios-${folderName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  db.prepare("INSERT INTO instances (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(id, folderName, resolved, Date.now());
  const instance = { id, name: folderName, path: resolved, created_at: Date.now() };
  activeInstanceId = id;
  activeCwd = resolved;
  res.json(instance);
});

app.post("/api/instances/:id/switch", requireToken, (req, res) => {
  const row = db.prepare("SELECT * FROM instances WHERE id = ?").get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: "Instance not found" }); return; }
  activeInstanceId = row.id;
  activeCwd = row.path;
  res.json({ id: row.id, name: row.name, path: row.path });
});

app.delete("/api/instances/:id", requireToken, (req, res) => {
  if (req.params.id === "default") { res.status(400).json({ error: "Cannot delete default instance" }); return; }
  db.prepare("DELETE FROM instances WHERE id = ?").run(req.params.id);
  if (activeInstanceId === req.params.id) {
    activeInstanceId = defaultInstanceId;
    activeCwd = DEFAULT_CWD;
  }
  res.json({ ok: true });
});

app.put("/api/instances/:id/rename", requireToken, (req, res) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: "Missing name" }); return; }
  db.prepare("UPDATE instances SET name = ? WHERE id = ?").run(name, req.params.id);
  res.json({ ok: true });
});

// ═══ MCP API ═══
app.get("/api/mcp", requireToken, (_req, res) => {
  const cfgPath = getMcpConfigPath();
  if (fs.existsSync(cfgPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      res.json(config.mcpServers || {});
      return;
    } catch {}
  }
  res.json({});
});

app.post("/api/mcp", requireToken, (req, res) => {
  const cfgPath = getMcpConfigPath();
  fs.writeFileSync(cfgPath, JSON.stringify({ mcpServers: req.body }, null, 2));
  mcpServers = req.body;
  res.json({ ok: true });
});

// ═══ SESSIONS API (Claude Code JSONL history) ═══
function getSessionDir(): string {
  const encodedCwd = activeCwd.replace(/\//g, "-");
  return path.join(os.homedir(), `.claude/projects/${encodedCwd}`);
}

function getSessionMeta(): Record<string, string> {
  const metaPath = path.join(getSessionDir(), "session-meta.json");
  if (!fs.existsSync(metaPath)) return {};
  try { return JSON.parse(fs.readFileSync(metaPath, "utf-8")); } catch { return {}; }
}

function readSessions() {
  const sessionDir = getSessionDir();
  if (!fs.existsSync(sessionDir)) return [];
  const meta = getSessionMeta();
  const sessions: any[] = [];
  const files = fs.readdirSync(sessionDir).filter(f => f.endsWith(".jsonl"));
  for (const file of files) {
    const filePath = path.join(sessionDir, file);
    const id = file.replace(".jsonl", "");
    const mtime = fs.statSync(filePath).mtimeMs;
    let firstMsg = "";
    let msgCount = 0;
    try {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const rec = JSON.parse(line);
        if (rec.type === "user") {
          msgCount++;
          if (!firstMsg) {
            const content = rec.message?.content;
            if (typeof content === "string") firstMsg = content;
            else if (Array.isArray(content)) {
              const text = content.find((c: any) => c?.type === "text")?.text;
              if (text) firstMsg = text;
            }
          }
        }
      }
    } catch {}
    if (msgCount > 0) {
      const title = meta[id] || firstMsg.replace(/<[^>]+>/g, " ").trim().slice(0, 60) || "(no message)";
      sessions.push({ id, title, messageCount: msgCount, timestamp: mtime });
    }
  }
  return sessions.sort((a: any, b: any) => b.timestamp - a.timestamp);
}

const MAX_OUTPUT_LEN = 3000;
const MAX_THINKING_LEN = 2000;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\n... (truncated)" : s;
}

function readSessionMessages(sessionId: string) {
  const filePath = path.join(getSessionDir(), `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  const messages: any[] = [];
  const pendingTools = new Map<string, any>();
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    for (const line of data.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === "user" && rec.message?.content) {
          const content = rec.message.content;
          // Backfill tool results
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === "tool_result" && block.tool_use_id) {
                const pending = pendingTools.get(block.tool_use_id);
                if (pending) {
                  let output = "";
                  if (typeof block.content === "string") output = block.content;
                  else if (Array.isArray(block.content)) {
                    output = block.content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
                  }
                  pending.output = truncate(output, MAX_OUTPUT_LEN);
                  pendingTools.delete(block.tool_use_id);
                }
              }
            }
          }
          let text = "";
          if (typeof content === "string") text = content;
          else if (Array.isArray(content)) {
            text = content.filter((c: any) => c?.type === "text" && c.text && !c.text.startsWith("<ide_"))
              .map((c: any) => c.text).join("\n");
          }
          if (text.trim()) messages.push({ role: "user", content: text.trim() });
        }
        if (rec.type === "assistant" && Array.isArray(rec.message?.content)) {
          let text = "";
          let thinking = "";
          const toolCalls: any[] = [];
          for (const block of rec.message.content) {
            if (block?.type === "text" && block.text) text += block.text;
            if (block?.type === "thinking" && block.thinking) thinking += block.thinking;
            if (block?.type === "tool_use") {
              const tc = { id: block.id, name: block.name, input: block.input, output: "", status: "done" };
              toolCalls.push(tc);
              pendingTools.set(block.id, tc);
            }
          }
          if (thinking) thinking = truncate(thinking, MAX_THINKING_LEN);
          const prev = messages[messages.length - 1];
          if (prev?.role === "assistant") {
            if (text) prev.content = (prev.content || "") + text;
            if (thinking) prev.thinking = (prev.thinking || "") + thinking;
            if (toolCalls.length > 0) prev.toolCalls = [...(prev.toolCalls || []), ...toolCalls];
          } else if (text || thinking || toolCalls.length > 0) {
            messages.push({
              role: "assistant", content: text,
              thinking: thinking || undefined,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            });
          }
        }
      } catch {}
    }
  } catch {}
  return messages;
}

app.get("/api/sessions", requireToken, (_req, res) => {
  res.json(readSessions());
});

app.get("/api/sessions/:id/messages", requireToken, (req, res) => {
  res.json(readSessionMessages(req.params.id));
});

app.post("/api/sessions/:id/rename", requireToken, (req, res) => {
  const sessionDir = getSessionDir();
  const metaPath = path.join(sessionDir, "session-meta.json");
  const meta = getSessionMeta();
  meta[req.params.id] = req.body.title;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  res.json({ ok: true });
});

app.delete("/api/sessions/:id", requireToken, (req, res) => {
  const filePath = path.join(getSessionDir(), `${req.params.id}.jsonl`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const meta = getSessionMeta();
  if (meta[req.params.id]) {
    delete meta[req.params.id];
    fs.writeFileSync(path.join(getSessionDir(), "session-meta.json"), JSON.stringify(meta, null, 2));
  }
  res.json({ ok: true });
});

// ═══ SCHEDULES API ═══
function getNextRun(task: any): number | null {
  if (!task.enabled) return null;
  const now = new Date();
  if (task.type === "once") {
    if (!task.date || !task.time) return null;
    const [h, m] = task.time.split(":").map(Number);
    const d = new Date(task.date + "T00:00:00");
    d.setHours(h, m, 0, 0);
    return d.getTime() > now.getTime() ? d.getTime() : null;
  }
  if (task.type === "daily") {
    if (!task.time) return null;
    const [h, m] = task.time.split(":").map(Number);
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  if (task.type === "weekly") {
    if (!task.time || task.day_of_week == null) return null;
    const [h, m] = task.time.split(":").map(Number);
    const next = new Date();
    next.setHours(h, m, 0, 0);
    let daysUntil = task.day_of_week - next.getDay();
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && next.getTime() <= now.getTime()) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
    return next.getTime();
  }
  if (task.type === "interval") {
    if (!task.interval_minutes) return null;
    const base = task.last_run || task.created_at;
    const next = base + task.interval_minutes * 60 * 1000;
    return next > now.getTime() ? next : now.getTime() + 1000;
  }
  return null;
}

function enrichSchedule(row: any) {
  return {
    ...row,
    enabled: !!row.enabled,
    nextRun: getNextRun(row),
    dayOfWeek: row.day_of_week,
    intervalMinutes: row.interval_minutes,
    lastRun: row.last_run,
    lastStatus: row.last_status,
    lastOutput: row.last_output,
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get("/api/schedules", requireToken, (_req, res) => {
  const rows = stmts.listSchedules.all() as any[];
  res.json(rows.map(enrichSchedule));
});

app.get("/api/schedules/:id", requireToken, (req, res) => {
  const row = stmts.getSchedule.get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(enrichSchedule(row));
});

app.post("/api/schedules", requireToken, (req, res) => {
  const d = req.body;
  const id = `sched_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  const now = Date.now();
  stmts.createSchedule.run(id, d.name || "Untitled", d.command || "", d.type || "daily", d.time || null, d.dayOfWeek ?? null, d.date || null, d.intervalMinutes ?? null, now, now);
  const row = stmts.getSchedule.get(id);
  res.json(enrichSchedule(row));
  broadcastWs({ type: "schedules_changed" });
});

app.put("/api/schedules/:id", requireToken, (req, res) => {
  const d = req.body;
  stmts.updateSchedule.run(d.name, d.command, d.type, d.time || null, d.dayOfWeek ?? null, d.date || null, d.intervalMinutes ?? null, Date.now(), req.params.id);
  const row = stmts.getSchedule.get(req.params.id);
  res.json(enrichSchedule(row));
  broadcastWs({ type: "schedules_changed" });
});

app.delete("/api/schedules/:id", requireToken, (req, res) => {
  stmts.deleteSchedule.run(req.params.id);
  res.json({ ok: true });
  broadcastWs({ type: "schedules_changed" });
});

app.post("/api/schedules/:id/toggle", requireToken, (req, res) => {
  stmts.toggleSchedule.run(Date.now(), req.params.id);
  const row = stmts.getSchedule.get(req.params.id) as any;
  res.json({ enabled: !!row?.enabled });
  broadcastWs({ type: "schedules_changed" });
});

app.post("/api/schedules/:id/run", requireToken, (req, res) => {
  const row = stmts.getSchedule.get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  executeScheduledTask(row);
  res.json({ ok: true });
});

app.get("/api/schedules/:id/runs", requireToken, (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const rows = stmts.getScheduleRuns.all(req.params.id, limit);
  res.json(rows);
});

// ═══ SETUP API ═══
app.get("/api/setup/status", requireToken, (_req, res) => {
  // Skip wizard if CLAUDE.md already has real content
  const claudeMdPath = path.join(activeCwd, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, "utf-8");
    if (content.length > 100 && !content.includes("[NOT SET]")) {
      res.json({ needsSetup: false }); return;
    }
  }
  const personalPath = path.join(activeCwd, ".claude", "context", "personal-info.md");
  if (fs.existsSync(personalPath)) {
    const content = fs.readFileSync(personalPath, "utf-8");
    if (!content.includes("[NOT SET]")) { res.json({ needsSetup: false }); return; }
  }
  res.json({ needsSetup: true });
});

app.post("/api/setup", requireToken, (req, res) => {
  const data = req.body;
  const ctxDir = path.join(activeCwd, ".claude", "context");
  if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true });

  // Personal info
  fs.writeFileSync(path.join(ctxDir, "personal-info.md"), `# Team Member\n\n- **Name:** ${data.name || "Not set"}\n- **Role:** ${data.role || "Not set"}\n- **Business:** ${data.businessName || "Not set"}\n- **Onboarded:** ${todayStr()}\n`, "utf-8");

  // Business info
  let biz = `# ${data.businessName || "Business"}\n\n## Overview\n${data.businessDescription || "Not set"}\n\n## Market\n${data.market || "Not set"}\n\n## Currency\n${data.currency || "RM"}\n\n`;
  if (data.products?.length) {
    biz += "## Products & Services\n";
    for (const p of data.products) biz += `- **${p.name}** — ${data.currency || "RM"}${p.price}${p.description ? ` — ${p.description}` : ""}\n`;
    biz += "\n";
  }
  if (data.team?.length) {
    biz += "## Team\n";
    for (const t of data.team) biz += `- **${t.name}** — ${t.role}\n`;
    biz += "\n";
  }
  if (data.clients?.length) {
    biz += "## Clients\n";
    for (const c of data.clients) biz += `- **${c.name}** — ${data.currency || "RM"}${c.revenue}/mo (${c.status})\n`;
    biz += "\n";
  }
  fs.writeFileSync(path.join(ctxDir, "business-info.md"), biz, "utf-8");

  // Current data
  fs.writeFileSync(path.join(ctxDir, "current-data.md"), `# Current Data\n\nLast updated: ${todayStr()}\n\n## Metrics\n- Revenue: Not tracked yet\n\n## Recent Activity\n- AIOS setup completed\n`, "utf-8");

  // CLAUDE.md
  const claudeMd = `# AIOS — AI Operating System\n\nYou are AIOS, an AI co-founder for ${data.businessName || "this business"}.\n\n## Identity\n- You work with ${data.name || "the team"}${data.role ? ` (${data.role})` : ""}.\n- Talk like a sharp co-founder, not a help desk. Short, direct, opinionated.\n- Take action first. NEVER list capabilities. Just do things.\n\n## Context Files\n- \`.claude/context/personal-info.md\` — Who you're working with\n- \`.claude/context/business-info.md\` — Company, products, clients\n- \`.claude/context/current-data.md\` — Live metrics\n\n## Preferences\n- Concise and direct\n- Currency: ${data.currency || "RM"}\n`;
  fs.writeFileSync(path.join(activeCwd, "CLAUDE.md"), claudeMd, "utf-8");

  res.json({ success: true });
});

// ═══ WHATSAPP API ═══
initWhatsApp({ defaultCwd: DEFAULT_CWD, broadcastFn: broadcastWs });

app.get("/api/whatsapp/connections", requireToken, (_req, res) => {
  res.json(listConnections());
});

app.post("/api/whatsapp/connections", requireToken, (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) { res.status(400).json({ error: "Missing id or name" }); return; }
  const result = addConnection(id, name);
  if (!result.success) { res.status(409).json(result); return; }
  res.json(result);
});

app.delete("/api/whatsapp/connections/:id", requireToken, async (req, res) => {
  await removeConnection(req.params.id);
  res.json({ ok: true });
});

app.post("/api/whatsapp/connections/:id/connect", requireToken, async (req, res) => {
  const result = await connectClient(req.params.id);
  if (!result.success) { res.status(500).json(result); return; }
  res.json(result);
});

app.post("/api/whatsapp/connections/:id/disconnect", requireToken, async (req, res) => {
  await disconnectClient(req.params.id);
  res.json({ ok: true });
});

// ═══ SYSTEM INFO ═══
app.get("/api/info", requireToken, (_req, res) => {
  res.json({
    cwd: activeCwd,
    version: VERSION,
    projectName: path.basename(activeCwd),
    companyName: path.basename(activeCwd),
    instanceId: activeInstanceId,
  });
});

// ═══ SELF-UPDATE / DEPLOY ═══
app.post("/api/deploy", requireToken, (req, res) => {
  const { files } = req.body; // { files: [{ path: "index.html", content: "base64..." }, ...] }
  if (!files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "Missing files array" });
    return;
  }
  try {
    // Clean old assets (Vite hashed filenames change every build)
    const assetsDir = path.join(staticDir, "assets");
    if (fs.existsSync(assetsDir)) {
      for (const f of fs.readdirSync(assetsDir)) {
        fs.unlinkSync(path.join(assetsDir, f));
      }
    } else {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Write new files
    let deployed = 0;
    for (const file of files) {
      const targetPath = path.join(staticDir, file.path);
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetPath, Buffer.from(file.content, "base64"));
      deployed++;
    }

    console.log(`[deploy] Updated ${deployed} frontend files`);
    res.json({ ok: true, deployed });
  } catch (err: any) {
    console.error(`[deploy] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Server-side self-update (replaces server.ts + restarts)
app.post("/api/deploy/server", requireToken, (req, res) => {
  const { files } = req.body; // [{ path: "server.ts", content: "base64..." }, ...]
  if (!files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "Missing files array" });
    return;
  }
  try {
    let deployed = 0;
    for (const file of files) {
      const targetPath = path.join(__dirname, file.path);
      fs.writeFileSync(targetPath, Buffer.from(file.content, "base64"));
      deployed++;
    }
    console.log(`[deploy] Updated ${deployed} server files, restarting...`);
    res.json({ ok: true, deployed, restarting: true });

    // Restart after response is sent
    setTimeout(() => { process.exit(0); }, 500); // PM2 will restart
  } catch (err: any) {
    console.error(`[deploy] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/deploy/version", (_req, res) => {
  res.json({ version: VERSION });
});

// SPA fallback — serve index.html for all non-API routes
app.get("*", (_req, res) => {
  const indexPath = path.join(staticDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("AIOS not found — run deploy");
  }
});

// ═══ WEBSOCKET ═══
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function broadcastWs(data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch {}
    }
  });
}

wss.on("connection", (ws, req) => {
  if (wss.clients.size > MAX_CONNECTIONS) {
    ws.close(4003, "Too many connections"); return;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  if (!isValidSession(token)) {
    ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
    ws.close(4001, "Unauthorized"); return;
  }

  log(`client connected (${wss.clients.size} total)`);

  let activeQuery = false;
  let shouldAbort = false;
  let currentGenerator: AsyncGenerator<any> | null = null;

  ws.on("message", async (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "abort") {
      shouldAbort = true;
      if (currentGenerator) {
        try { await currentGenerator.return(undefined); } catch {}
        currentGenerator = null;
      }
      activeQuery = false;
      send({ type: "query_complete" });
      return;
    }

    if (msg.type !== "query") return;
    if (activeQuery) { send({ type: "error", message: "Query already in progress" }); return; }

    const prompt = typeof msg.prompt === "string" ? msg.prompt.trim() : "";
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      send({ type: "error", message: prompt ? "Prompt too long" : "Empty prompt" }); return;
    }

    activeQuery = true;
    shouldAbort = false;

    const opts: Record<string, any> = {
      permissionMode: "bypassPermissions",
      systemPrompt: AIOS_SYSTEM_PROMPT,
      cwd: activeCwd,
      includePartialMessages: true,
      maxTurns: Math.min(typeof msg.maxTurns === "number" ? msg.maxTurns : MAX_TURNS, MAX_TURNS),
    };
    if (mcpServers) opts.mcpServers = mcpServers;
    if (msg.sessionId) opts.resume = msg.sessionId;

    log(`query: "${prompt.substring(0, 80)}"`);

    try {
      const generator = query({ prompt, options: opts });
      currentGenerator = generator;

      for await (const message of generator) {
        if (shouldAbort || ws.readyState !== WebSocket.OPEN) break;
        send(message);
      }
    } catch (err: any) {
      log(`error: ${err.message}`);
      send({ type: "error", message: "Query failed" });
    }

    currentGenerator = null;
    activeQuery = false;
    if (ws.readyState === WebSocket.OPEN) send({ type: "query_complete" });
  });

  ws.on("close", () => {
    log(`client disconnected (${wss.clients.size} remaining)`);
    shouldAbort = true;
    if (currentGenerator) {
      currentGenerator.return(undefined).catch(() => {});
      currentGenerator = null;
    }
  });

  ws.on("error", (err) => log(`ws error: ${err.message}`));

  function send(data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(data)); } catch {}
    }
  }

  send({ type: "welcome", version: VERSION, cwd: activeCwd, projectName: path.basename(activeCwd) });
});

// ── Scheduler ──
function isDue(task: any): boolean {
  if (!task.enabled) return false;
  const nextRun = getNextRun(task);
  if (!nextRun) return false;
  const now = Date.now();
  return nextRun <= now + 30_000 && !(task.last_run && now - task.last_run < 120_000);
}

async function executeScheduledTask(task: any) {
  log(`[scheduler] Running: ${task.name}`);
  const startedAt = Date.now();
  stmts.addScheduleRun.run(task.id, "running", null, startedAt);

  try {
    let resultText = "";
    const schedOpts: Record<string, any> = {
      permissionMode: "bypassPermissions",
      systemPrompt: AIOS_SYSTEM_PROMPT,
      cwd: activeCwd,
      maxTurns: 50,
    };
    if (mcpServers) schedOpts.mcpServers = mcpServers;

    for await (const msg of query({ prompt: task.command, options: schedOpts })) {
      if (msg.type === "result") resultText = JSON.stringify(msg).slice(0, 2000);
    }

    stmts.markScheduleRun.run(Date.now(), "success", resultText, Date.now(), task.id);
    stmts.pruneRuns.run(task.id, task.id);
    log(`[scheduler] Completed: ${task.name}`);
  } catch (err: any) {
    stmts.markScheduleRun.run(Date.now(), "error", err.message, Date.now(), task.id);
    log(`[scheduler] Failed: ${task.name} — ${err.message}`);
  }

  broadcastWs({ type: "schedules_changed" });
}

function checkSchedules() {
  try {
    const tasks = stmts.listSchedules.all() as any[];
    for (const task of tasks) {
      if (isDue(task)) executeScheduledTask(task);
    }
  } catch (err: any) {
    log(`[scheduler] check error: ${err.message}`);
  }
}

// ── Heartbeat + scheduler ──
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => { if (ws.readyState === WebSocket.OPEN) ws.ping(); });
}, 30_000);
const scheduleCheck = setInterval(checkSchedules, 30_000);

// ── Graceful shutdown ──
function shutdown() {
  log("shutting down...");
  clearInterval(heartbeat);
  clearInterval(scheduleCheck);
  destroyAll().catch(() => {});
  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));
  db.close();
  server.close(() => { log("stopped"); process.exit(0); });
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── Start ──
server.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  [error] Port ${PORT} is already in use.`);
    console.error(`  Run: kill -9 $(lsof -ti:${PORT}) && npm run serve:web\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, BIND_HOST, () => {
  console.log("");
  console.log(`  AIOS Web Server v${VERSION}`);
  console.log("  ─────────────────────────────────");
  console.log(`  Local:  http://${BIND_HOST}:${PORT}`);
  console.log(`  CWD:    ${DEFAULT_CWD}`);
  console.log(`  DB:     ${DB_PATH}`);
  console.log(`  Max:    ${MAX_CONNECTIONS} connections, ${MAX_TURNS} turns`);
  console.log(`  MCP:    ${mcpServers ? Object.keys(mcpServers).join(", ") : "none"}`);
  console.log("");
});
