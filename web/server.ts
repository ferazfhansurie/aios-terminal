import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { query } from "@anthropic-ai/claude-code";
import path from "path";
import os from "os";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

// ═══ Version ═══
const VERSION = "0.3.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──
const AUTH_TOKEN =
  process.env.AIOS_TOKEN || crypto.randomBytes(32).toString("hex");
const DEFAULT_CWD =
  process.env.AIOS_CWD ||
  path.join(os.homedir(), "Repo/firaz/adletic/aios-firaz");
const PORT = parseInt(process.env.PORT || "3456");
const BIND_HOST = process.env.AIOS_HOST || "127.0.0.1";
const MAX_CONNECTIONS = parseInt(process.env.AIOS_MAX_CONN || "5");
const MAX_TURNS = parseInt(process.env.AIOS_MAX_TURNS || "200");
const MAX_PROMPT_LENGTH = 50_000;

// ── Validate CWD ──
if (!fs.existsSync(DEFAULT_CWD)) {
  console.error(`[fatal] CWD does not exist: ${DEFAULT_CWD}`);
  console.error(`  Set AIOS_CWD to a valid directory.`);
  process.exit(1);
}

// ── Express ──
const app = express();
app.disable("x-powered-by");
const server = createServer(app);

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; img-src 'self' data:; connect-src 'self' ws: wss:;"
  );
  next();
});

app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Auth middleware for API routes ──
function requireToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const token =
    (req.query.token as string) ||
    req.headers.authorization?.replace("Bearer ", "");
  if (token !== AUTH_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Commands API ──
app.get("/api/commands", requireToken, (_req, res) => {
  const commandsDir = path.join(DEFAULT_CWD, ".claude", "commands");
  try {
    if (!fs.existsSync(commandsDir)) {
      res.json([]);
      return;
    }
    const files = fs
      .readdirSync(commandsDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    const commands = files.map((f) => {
      const name = f.replace(/\.md$/, "");
      const content = fs.readFileSync(path.join(commandsDir, f), "utf-8");
      const firstLine =
        content
          .split("\n")
          .find((l) => l.startsWith("## "))
          ?.replace(/^##\s*/, "") || name;
      return { name, label: firstLine };
    });
    res.json(commands);
  } catch {
    res.json([]);
  }
});

// ── Files API ──
app.get("/api/files", requireToken, (req, res) => {
  const rel = typeof req.query.path === "string" ? req.query.path : "";
  const target = path.resolve(DEFAULT_CWD, rel);
  if (!target.startsWith(DEFAULT_CWD)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    if (!fs.existsSync(target)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "Not a directory" });
      return;
    }
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter(
        (e) =>
          !e.name.startsWith(".") &&
          e.name !== "node_modules" &&
          e.name !== "__pycache__" &&
          e.name !== ".git",
      )
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 100)
      .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
    res.json({ path: path.relative(DEFAULT_CWD, target) || ".", entries });
  } catch {
    res.json({ path: rel, entries: [] });
  }
});

// ═══ SCHEDULE API ═══
interface ScheduledTask {
  id: string;
  name: string;
  command: string;
  type: "once" | "daily" | "weekly" | "interval";
  time?: string;
  dayOfWeek?: number;
  date?: string;
  intervalMinutes?: number;
  enabled: boolean;
  lastRun?: number;
  lastStatus?: string;
  createdAt: number;
  history: { timestamp: number; status: string }[];
}

const schedulesPath = path.join(DEFAULT_CWD, ".claude", "schedules.json");

function readSchedules(): ScheduledTask[] {
  if (!fs.existsSync(schedulesPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(schedulesPath, "utf-8"));
  } catch {
    return [];
  }
}

function writeSchedules(tasks: ScheduledTask[]) {
  const dir = path.dirname(schedulesPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(schedulesPath, JSON.stringify(tasks, null, 2), "utf-8");
  // Broadcast to all connected WebSocket clients
  broadcastWs({ type: "schedules_changed" });
}

function broadcastWs(data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch {}
    }
  });
}

function generateScheduleId(): string {
  return `sched_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function getNextRun(task: ScheduledTask): number | null {
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
    if (!task.time || task.dayOfWeek === undefined) return null;
    const [h, m] = task.time.split(":").map(Number);
    const next = new Date();
    next.setHours(h, m, 0, 0);
    const currentDay = next.getDay();
    let daysUntil = task.dayOfWeek - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && next.getTime() <= now.getTime()) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
    return next.getTime();
  }

  if (task.type === "interval") {
    if (!task.intervalMinutes) return null;
    const base = task.lastRun || task.createdAt;
    const next = base + task.intervalMinutes * 60 * 1000;
    return next > now.getTime() ? next : now.getTime() + 1000;
  }

  return null;
}

function isDue(task: ScheduledTask): boolean {
  if (!task.enabled) return false;
  const nextRun = getNextRun(task);
  if (!nextRun) return false;
  const now = Date.now();
  const recentlyRan = task.lastRun && now - task.lastRun < 120_000;
  return nextRun <= now + 30_000 && !recentlyRan;
}

async function executeScheduledTask(task: ScheduledTask) {
  log(`[scheduler] Running: ${task.name} — ${task.command.substring(0, 60)}`);
  broadcastWs({
    type: "schedule_execution",
    taskId: task.id,
    taskName: task.name,
    status: "started",
  });

  try {
    const result = [];
    for await (const msg of query({
      prompt: task.command,
      options: {
        allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "TodoWrite"],
        permissionMode: "bypassPermissions" as any,
        cwd: DEFAULT_CWD,
        maxTurns: 50,
      },
    })) {
      if (msg.type === "result") result.push(msg);
    }
    log(`[scheduler] Completed: ${task.name}`);
    broadcastWs({
      type: "schedule_execution",
      taskId: task.id,
      taskName: task.name,
      status: "completed",
    });
  } catch (err: any) {
    log(`[scheduler] Failed: ${task.name} — ${err.message}`);
    broadcastWs({
      type: "schedule_execution",
      taskId: task.id,
      taskName: task.name,
      status: "failed",
      error: err.message,
    });
  }
}

function checkSchedules() {
  const tasks = readSchedules();
  let changed = false;

  for (const task of tasks) {
    if (isDue(task)) {
      executeScheduledTask(task);
      task.lastRun = Date.now();
      task.lastStatus = "success";
      task.history.push({ timestamp: Date.now(), status: "executed" });
      if (task.history.length > 20) task.history = task.history.slice(-20);
      if (task.type === "once") task.enabled = false;
      changed = true;
    }
  }

  if (changed) writeSchedules(tasks);
}

// Schedule REST endpoints
app.get("/api/schedules", requireToken, (_req, res) => {
  const tasks = readSchedules();
  res.json(tasks.map((t) => ({ ...t, nextRun: getNextRun(t) })));
});

app.post("/api/schedules", requireToken, (req, res) => {
  const data = req.body;
  const tasks = readSchedules();
  const task: ScheduledTask = {
    id: generateScheduleId(),
    name: data.name || "Untitled",
    command: data.command || "",
    type: data.type || "daily",
    time: data.time,
    dayOfWeek: data.dayOfWeek,
    date: data.date,
    intervalMinutes: data.intervalMinutes,
    enabled: true,
    createdAt: Date.now(),
    history: [],
  };
  tasks.push(task);
  writeSchedules(tasks);
  res.json({ ...task, nextRun: getNextRun(task) });
});

app.put("/api/schedules/:id", requireToken, (req, res) => {
  const tasks = readSchedules();
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Not found" }); return; }
  tasks[idx] = { ...tasks[idx], ...req.body, id: req.params.id };
  writeSchedules(tasks);
  res.json({ ...tasks[idx], nextRun: getNextRun(tasks[idx]) });
});

app.delete("/api/schedules/:id", requireToken, (req, res) => {
  const tasks = readSchedules().filter((t) => t.id !== req.params.id);
  writeSchedules(tasks);
  res.json({ ok: true });
});

app.post("/api/schedules/:id/toggle", requireToken, (req, res) => {
  const tasks = readSchedules();
  const task = tasks.find((t) => t.id === req.params.id);
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  task.enabled = !task.enabled;
  writeSchedules(tasks);
  res.json({ enabled: task.enabled });
});

app.post("/api/schedules/:id/run", requireToken, (req, res) => {
  const tasks = readSchedules();
  const task = tasks.find((t) => t.id === req.params.id);
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  executeScheduledTask(task);
  task.lastRun = Date.now();
  task.lastStatus = "success";
  task.history.push({ timestamp: Date.now(), status: "manual" });
  if (task.history.length > 20) task.history = task.history.slice(-20);
  writeSchedules(tasks);
  res.json({ ok: true });
});

// ═══ SESSION HISTORY ═══
interface SessionRecord {
  id: string;
  title: string;
  firstPrompt: string;
  messageCount: number;
  totalCost: number;
  createdAt: number;
  updatedAt: number;
  claudeSessionId?: string;
}

const sessionsDir = path.join(DEFAULT_CWD, ".claude", "web-sessions");

function ensureSessionsDir() {
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
}

function getSessionIndex(): SessionRecord[] {
  ensureSessionsDir();
  const indexPath = path.join(sessionsDir, "index.json");
  if (!fs.existsSync(indexPath)) return [];
  try { return JSON.parse(fs.readFileSync(indexPath, "utf-8")); } catch { return []; }
}

function saveSessionIndex(sessions: SessionRecord[]) {
  ensureSessionsDir();
  fs.writeFileSync(path.join(sessionsDir, "index.json"), JSON.stringify(sessions, null, 2));
}

function upsertSession(record: SessionRecord) {
  const sessions = getSessionIndex();
  const idx = sessions.findIndex(s => s.id === record.id);
  if (idx >= 0) sessions[idx] = record;
  else sessions.unshift(record);
  if (sessions.length > 100) sessions.length = 100;
  saveSessionIndex(sessions);
}

function deleteSessionRecord(id: string) {
  const sessions = getSessionIndex().filter(s => s.id !== id);
  saveSessionIndex(sessions);
}

// Session API
app.get("/api/sessions", requireToken, (_req, res) => {
  res.json(getSessionIndex());
});

app.delete("/api/sessions/:id", requireToken, (req, res) => {
  deleteSessionRecord(req.params.id);
  res.json({ ok: true });
});

app.post("/api/sessions/:id/rename", requireToken, (req, res) => {
  const sessions = getSessionIndex();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  session.title = req.body.title || session.title;
  saveSessionIndex(sessions);
  res.json(session);
});

// ═══ SYSTEM INFO ═══
app.get("/api/info", requireToken, (_req, res) => {
  let claudeMd = "";
  const claudeMdPath = path.join(DEFAULT_CWD, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    claudeMd = fs.readFileSync(claudeMdPath, "utf-8");
  }
  // Count files in project
  let fileCount = 0;
  try {
    const entries = fs.readdirSync(DEFAULT_CWD, { withFileTypes: true });
    fileCount = entries.filter(e => !e.name.startsWith(".") && e.name !== "node_modules").length;
  } catch { /* */ }

  res.json({
    cwd: DEFAULT_CWD,
    claudeMd,
    version: VERSION,
    fileCount,
    projectName: path.basename(DEFAULT_CWD),
  });
});

// ── WebSocket ──
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 256 * 1024, // 256KB max message
});

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

wss.on("connection", (ws, req) => {
  // Connection limit
  if (wss.clients.size > MAX_CONNECTIONS) {
    ws.close(4003, "Too many connections");
    return;
  }

  // Auth
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  if (token !== AUTH_TOKEN) {
    ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
    ws.close(4001, "Unauthorized");
    return;
  }

  log(`client connected (${wss.clients.size} total)`);

  let activeQuery = false;
  let shouldAbort = false;
  let currentGenerator: AsyncGenerator<any> | null = null;
  // Per-connection session tracking
  let connSessionRecord: SessionRecord | null = null;

  ws.on("message", async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send({ type: "error", message: "Invalid JSON" });
      return;
    }

    // Abort
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

    // Save session metadata from client
    if (msg.type === "save_session") {
      if (connSessionRecord) {
        connSessionRecord.title = msg.title || connSessionRecord.title;
        connSessionRecord.updatedAt = Date.now();
        upsertSession(connSessionRecord);
        send({ type: "session_saved", session: connSessionRecord });
      }
      return;
    }

    if (msg.type !== "query") return;
    if (activeQuery) {
      send({ type: "error", message: "Query already in progress" });
      return;
    }

    // Validate prompt
    const prompt = typeof msg.prompt === "string" ? msg.prompt.trim() : "";
    if (!prompt) {
      send({ type: "error", message: "Empty prompt" });
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      send({ type: "error", message: `Prompt too long (max ${MAX_PROMPT_LENGTH} chars)` });
      return;
    }

    // Initialize or update session record
    if (!connSessionRecord || msg.newSession) {
      connSessionRecord = {
        id: msg.tabId || `ws_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
        title: prompt.substring(0, 60),
        firstPrompt: prompt,
        messageCount: 0,
        totalCost: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    connSessionRecord.messageCount++;
    connSessionRecord.updatedAt = Date.now();

    activeQuery = true;
    shouldAbort = false;

    // Server controls security-sensitive options — NOT the client
    const opts: Record<string, any> = {
      allowedTools: [
        "Read", "Edit", "Write", "Bash", "Glob", "Grep",
        "WebSearch", "WebFetch", "Agent", "TodoWrite",
      ],
      permissionMode: "bypassPermissions",
      cwd: DEFAULT_CWD,
      includePartialMessages: true,
      maxTurns: Math.min(
        typeof msg.maxTurns === "number" ? msg.maxTurns : MAX_TURNS,
        MAX_TURNS
      ),
    };

    if (msg.sessionId && typeof msg.sessionId === "string") {
      opts.resume = msg.sessionId;
    }

    log(`query: "${prompt.substring(0, 80)}${prompt.length > 80 ? "..." : ""}"`);

    try {
      const generator = query({ prompt, options: opts });
      currentGenerator = generator;

      for await (const message of generator) {
        if (shouldAbort || ws.readyState !== WebSocket.OPEN) break;
        send(message);

        // Track session ID and cost from result
        if (message.type === "result") {
          if (message.session_id && connSessionRecord) {
            connSessionRecord.claudeSessionId = message.session_id;
          }
          if (message.total_cost_usd !== undefined && connSessionRecord) {
            connSessionRecord.totalCost = message.total_cost_usd;
          }
        }
      }
    } catch (err: any) {
      const safeMsg = err.code === "ENOENT" ? "File or command not found"
        : err.code === "EACCES" ? "Permission denied"
        : "Query failed";
      log(`error: ${err.message}`);
      send({ type: "error", message: safeMsg });
    }

    currentGenerator = null;
    activeQuery = false;

    // Auto-save session after query completes
    if (connSessionRecord) {
      upsertSession(connSessionRecord);
    }

    if (ws.readyState === WebSocket.OPEN) {
      send({ type: "query_complete" });
    }
  });

  ws.on("close", () => {
    log(`client disconnected (${wss.clients.size} remaining)`);
    shouldAbort = true;
    if (currentGenerator) {
      currentGenerator.return(undefined).catch(() => {});
      currentGenerator = null;
    }
    activeQuery = false;
  });

  ws.on("error", (err) => {
    log(`ws error: ${err.message}`);
  });

  function send(data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(data)); } catch {}
    }
  }

  // Welcome — mirrors Electron app's app:info IPC
  send({
    type: "welcome",
    message: "Connected to AIOS",
    cwd: DEFAULT_CWD,
    version: VERSION,
    companyName: "Adletic (0210)",
    uptime: Math.floor(process.uptime()),
    projectName: path.basename(DEFAULT_CWD),
  });
});

// ── Heartbeat ──
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  });
}, 30_000);

// ── Scheduler ──
const scheduleCheckInterval = setInterval(checkSchedules, 30_000);

// ── Graceful shutdown ──
function shutdown() {
  log("shutting down...");
  clearInterval(heartbeat);
  clearInterval(scheduleCheckInterval);
  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));
  server.close(() => {
    log("stopped");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── Start ──
server.listen(PORT, BIND_HOST, () => {
  const url = `http://localhost:${PORT}?token=${AUTH_TOKEN}`;
  console.log("");
  console.log(`  AIOS Web Server v${VERSION}`);
  console.log("  ─────────────────────────────────");
  console.log(`  Local:  http://${BIND_HOST}:${PORT}`);
  console.log(`  CWD:    ${DEFAULT_CWD}`);
  console.log(`  Max:    ${MAX_CONNECTIONS} connections, ${MAX_TURNS} turns`);
  console.log("");
  console.log(`  ${url}`);
  console.log("");
});
