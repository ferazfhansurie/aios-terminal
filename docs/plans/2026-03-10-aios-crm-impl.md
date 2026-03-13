# AIOS Terminal CRM Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend aios-terminal web server into a full business node — Claude Code + WhatsApp (wwebjs) + CRM contacts + chat/assistant interface.

**Architecture:** Express server gains 3 new layers: (1) WhatsApp service wrapping wwebjs for QR-scan connection, message send/receive, session persistence; (2) Neon PostgreSQL database layer for contacts/messages CRUD; (3) Frontend pages (vanilla JS, same pattern as existing index.html) for WhatsApp management, contacts list, and chat/assistant interface. Navigation via top-level tabs in the existing UI.

**Tech Stack:** Express.js, WebSocket (ws), whatsapp-web.js, pg (Neon PostgreSQL), qrcode, @anthropic-ai/claude-code SDK, vanilla JS frontend (Tailwind CDN)

**Branch:** `feature/aios-crm` on aios-terminal repo

---

## Phase 1: WhatsApp (wwebjs) Integration

### Task 1: Create branch and add dependencies

**Files:**
- Modify: `web/package.json`

**Step 1: Create feature branch**

```bash
cd /Users/firazfhansurie/Repo/firaz/adletic/aios-terminal
git checkout -b feature/aios-crm
```

**Step 2: Add dependencies**

```bash
cd web
npm install whatsapp-web.js qrcode pg
npm install -D @types/qrcode @types/pg
```

New deps:
- `whatsapp-web.js` — WhatsApp Web client via Puppeteer
- `qrcode` — QR code generation (data URI for frontend)
- `pg` — PostgreSQL driver for Neon

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add wwebjs, pg, qrcode dependencies"
```

---

### Task 2: Create WhatsApp service

**Files:**
- Create: `web/services/whatsapp.ts`

**Step 1: Create the service file**

This service manages a single wwebjs client with:
- Initialization with LocalAuth (session persistence)
- QR code generation + broadcast to WebSocket clients
- Incoming message handling + DB logging
- Outgoing message sending
- Status machine (disconnected → initializing → qr → ready)

```typescript
// web/services/whatsapp.ts
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import QRCode from "qrcode";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type WAStatus = "disconnected" | "initializing" | "qr" | "authenticated" | "ready" | "error";

export interface WAMessage {
  id: string;
  chatId: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  contactName?: string;
  phoneNumber?: string;
  hasMedia: boolean;
}

export class WhatsAppService extends EventEmitter {
  private client: InstanceType<typeof Client> | null = null;
  private _status: WAStatus = "disconnected";
  private _qrCode: string | null = null;
  private _phoneNumber: string | null = null;
  private sessionPath: string;

  constructor(cwd: string) {
    super();
    this.sessionPath = path.join(cwd, ".wwebjs_auth");
  }

  get status() { return this._status; }
  get qrCode() { return this._qrCode; }
  get phoneNumber() { return this._phoneNumber; }

  private setStatus(status: WAStatus) {
    this._status = status;
    this.emit("status", { status, qrCode: this._qrCode, phoneNumber: this._phoneNumber });
  }

  async initialize(): Promise<void> {
    if (this.client) {
      console.log("[whatsapp] Already initialized, destroying first...");
      await this.destroy();
    }

    this.setStatus("initializing");

    // Detect Chrome path by platform
    const chromePaths: Record<string, string> = {
      darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      linux: "/usr/bin/google-chrome",
      win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    };
    const executablePath = chromePaths[process.platform] || undefined;

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "aios",
        dataPath: this.sessionPath,
      }),
      puppeteer: {
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-extensions",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-zygote",
          "--disable-accelerated-2d-canvas",
          "--disable-software-rasterizer",
        ],
        timeout: 120000,
      },
    });

    // QR Code
    this.client.on("qr", async (qr: string) => {
      console.log("[whatsapp] QR code received");
      try {
        this._qrCode = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
      } catch {
        this._qrCode = null;
      }
      this.setStatus("qr");
    });

    // Authenticated
    this.client.on("authenticated", () => {
      console.log("[whatsapp] Authenticated");
      this._qrCode = null;
      this.setStatus("authenticated");
    });

    // Ready
    this.client.on("ready", () => {
      console.log("[whatsapp] Ready");
      this._phoneNumber = (this.client as any)?.info?.wid?.user || null;
      this._qrCode = null;
      this.setStatus("ready");
    });

    // Incoming message
    this.client.on("message", (msg: any) => {
      // Skip status broadcasts and newsletters
      if (msg.from === "status@broadcast" || msg.from?.includes("newsletter")) return;

      const waMsg: WAMessage = {
        id: msg.id?._serialized || `${Date.now()}`,
        chatId: msg.from,
        body: msg.body || "",
        fromMe: false,
        timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
        type: msg.type || "chat",
        contactName: msg.notifyName || undefined,
        phoneNumber: msg.from?.replace("@c.us", "").replace("@g.us", ""),
        hasMedia: msg.hasMedia || false,
      };
      this.emit("message", waMsg);
    });

    // Outgoing message tracking
    this.client.on("message_create", (msg: any) => {
      if (!msg.fromMe) return;

      const waMsg: WAMessage = {
        id: msg.id?._serialized || `${Date.now()}`,
        chatId: msg.to,
        body: msg.body || "",
        fromMe: true,
        timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
        type: msg.type || "chat",
        phoneNumber: msg.to?.replace("@c.us", "").replace("@g.us", ""),
        hasMedia: msg.hasMedia || false,
      };
      this.emit("message_create", waMsg);
    });

    // Disconnected
    this.client.on("disconnected", (reason: string) => {
      console.log(`[whatsapp] Disconnected: ${reason}`);
      this._phoneNumber = null;
      this.setStatus("disconnected");
    });

    // Auth failure
    this.client.on("auth_failure", (error: any) => {
      console.log(`[whatsapp] Auth failure: ${error}`);
      this.setStatus("error");
    });

    try {
      await this.client.initialize();
    } catch (err: any) {
      console.error(`[whatsapp] Init error: ${err.message}`);
      this.setStatus("error");
    }
  }

  async sendMessage(chatId: string, content: string): Promise<any> {
    if (!this.client || this._status !== "ready") {
      throw new Error("WhatsApp not connected");
    }
    // Ensure chatId has @c.us suffix
    const to = chatId.includes("@") ? chatId : `${chatId}@c.us`;
    return this.client.sendMessage(to, content);
  }

  async getChats(limit = 50): Promise<any[]> {
    if (!this.client || this._status !== "ready") return [];
    try {
      const chats = await this.client.getChats();
      return chats.slice(0, limit).map((c: any) => ({
        id: c.id._serialized,
        name: c.name || c.id.user,
        isGroup: c.isGroup,
        unreadCount: c.unreadCount,
        lastMessage: c.lastMessage?.body?.substring(0, 100) || "",
        timestamp: c.lastMessage?.timestamp || 0,
      }));
    } catch {
      return [];
    }
  }

  async getMessages(chatId: string, limit = 50): Promise<WAMessage[]> {
    if (!this.client || this._status !== "ready") return [];
    try {
      const chat = await this.client.getChatById(chatId);
      const msgs = await chat.fetchMessages({ limit });
      return msgs.map((msg: any) => ({
        id: msg.id._serialized,
        chatId: msg.from || chatId,
        body: msg.body || "",
        fromMe: msg.fromMe,
        timestamp: msg.timestamp,
        type: msg.type || "chat",
        contactName: msg.notifyName,
        phoneNumber: (msg.fromMe ? msg.to : msg.from)?.replace("@c.us", ""),
        hasMedia: msg.hasMedia || false,
      }));
    } catch {
      return [];
    }
  }

  async destroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch {}
      this.client = null;
    }
    this._status = "disconnected";
    this._qrCode = null;
    this._phoneNumber = null;
  }

  async logout(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {}
    }
    await this.destroy();
  }

  getInfo() {
    return {
      status: this._status,
      qrCode: this._qrCode,
      phoneNumber: this._phoneNumber,
    };
  }
}
```

**Step 2: Commit**

```bash
git add web/services/whatsapp.ts
git commit -m "feat: add WhatsApp service with wwebjs"
```

---

### Task 3: Create database service

**Files:**
- Create: `web/services/database.ts`

**Step 1: Create the database service**

Direct Neon PostgreSQL queries — no ORM. Reads connection string from env.

```typescript
// web/services/database.ts
import pg from "pg";
const { Pool } = pg;

let pool: InstanceType<typeof Pool> | null = null;

export function initDatabase(connectionString: string) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", (err) => {
    console.error("[db] Pool error:", err.message);
  });
}

function getPool(): InstanceType<typeof Pool> {
  if (!pool) throw new Error("Database not initialized. Set DATABASE_URL env var.");
  return pool;
}

// ── Contacts ──

export async function getContacts(companyId: string, opts: {
  limit?: number;
  offset?: number;
  search?: string;
  tags?: string[];
} = {}) {
  const { limit = 50, offset = 0, search, tags } = opts;
  const params: any[] = [companyId];
  let where = "WHERE c.company_id = $1";
  let paramIdx = 2;

  if (search) {
    where += ` AND (c.contact_name ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx} OR c.first_name ILIKE $${paramIdx} OR c.last_name ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (tags && tags.length > 0) {
    where += ` AND c.tags && $${paramIdx}::text[]`;
    params.push(tags);
    paramIdx++;
  }

  params.push(limit, offset);

  const result = await getPool().query(`
    SELECT c.id, c.contact_id, c.contact_name, c.first_name, c.last_name,
           c.phone, c.email, c.company_name, c.tags, c.assigned_to,
           c.chat_id, c.unread_count, c.last_message_body,
           c.created_at, c.last_updated,
           c.chat_pic_full, c.notes, c.points
    FROM contacts c
    ${where}
    ORDER BY c.last_updated DESC NULLS LAST
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, params);

  const countResult = await getPool().query(`
    SELECT COUNT(*) as total FROM contacts c ${where}
  `, params.slice(0, -2));

  return {
    contacts: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset,
  };
}

export async function getContact(companyId: string, contactId: string) {
  const result = await getPool().query(
    "SELECT * FROM contacts WHERE company_id = $1 AND contact_id = $2",
    [companyId, contactId]
  );
  return result.rows[0] || null;
}

export async function updateContact(companyId: string, contactId: string, data: Record<string, any>) {
  const allowed = ["contact_name", "first_name", "last_name", "email", "phone",
    "company_name", "tags", "assigned_to", "notes", "points"];
  const fields: string[] = [];
  const values: any[] = [companyId, contactId];
  let idx = 3;

  for (const [key, val] of Object.entries(data)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }
  }

  if (fields.length === 0) return null;

  fields.push(`last_updated = NOW()`);
  const result = await getPool().query(
    `UPDATE contacts SET ${fields.join(", ")} WHERE company_id = $1 AND contact_id = $2 RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

// ── Messages ──

export async function getMessages(companyId: string, chatId: string, opts: {
  limit?: number;
  offset?: number;
} = {}) {
  const { limit = 50, offset = 0 } = opts;
  const result = await getPool().query(`
    SELECT id, contact_id, chat_id, message_body, from_me, type,
           timestamp, status, phone_index, metadata
    FROM messages
    WHERE company_id = $1 AND chat_id = $2
    ORDER BY timestamp DESC
    LIMIT $3 OFFSET $4
  `, [companyId, chatId, limit, offset]);

  return result.rows;
}

export async function saveMessage(data: {
  companyId: string;
  contactId: string;
  chatId: string;
  body: string;
  fromMe: boolean;
  type: string;
  timestamp: number;
  phoneIndex?: number;
}) {
  const result = await getPool().query(`
    INSERT INTO messages (company_id, contact_id, chat_id, message_body,
      from_me, type, timestamp, phone_index, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), $8, NOW())
    RETURNING id
  `, [data.companyId, data.contactId, data.chatId, data.body,
      data.fromMe, data.type, data.timestamp, data.phoneIndex || 0]);

  return result.rows[0];
}

// ── Tags ──

export async function getTags(companyId: string) {
  const result = await getPool().query(
    "SELECT * FROM tag_definitions WHERE company_id = $1 ORDER BY name",
    [companyId]
  );
  return result.rows;
}

// ── Employees ──

export async function getEmployees(companyId: string) {
  const result = await getPool().query(
    "SELECT name, email, role, phone_number FROM employees WHERE company_id = $1",
    [companyId]
  );
  return result.rows;
}

// ── Stats ──

export async function getStats(companyId: string) {
  const results = await Promise.all([
    getPool().query("SELECT COUNT(*) as total FROM contacts WHERE company_id = $1", [companyId]),
    getPool().query("SELECT COUNT(*) as total FROM messages WHERE company_id = $1", [companyId]),
    getPool().query(`SELECT COUNT(*) as total FROM messages WHERE company_id = $1
      AND timestamp > NOW() - INTERVAL '24 hours'`, [companyId]),
    getPool().query(`SELECT COUNT(*) as total FROM contacts WHERE company_id = $1
      AND created_at > NOW() - INTERVAL '24 hours'`, [companyId]),
  ]);

  return {
    totalContacts: parseInt(results[0].rows[0].total),
    totalMessages: parseInt(results[1].rows[0].total),
    messages24h: parseInt(results[2].rows[0].total),
    newContacts24h: parseInt(results[3].rows[0].total),
  };
}

export async function closeDatabase() {
  if (pool) await pool.end();
}
```

**Step 2: Commit**

```bash
git add web/services/database.ts
git commit -m "feat: add database service for Neon PostgreSQL"
```

---

### Task 4: Add WhatsApp + Database + Contacts + Messages API routes to server.ts

**Files:**
- Modify: `web/server.ts`

**Step 1: Add imports and initialization at top of server.ts (after line 9)**

```typescript
import { WhatsAppService } from "./services/whatsapp.js";
import { initDatabase, getContacts, getContact, updateContact,
  getMessages as getDbMessages, saveMessage, getTags, getEmployees,
  getStats, closeDatabase } from "./services/database.js";
```

**Step 2: Add config vars (after line 26)**

```typescript
const COMPANY_ID = process.env.COMPANY_ID || "0210";
const DATABASE_URL = process.env.DATABASE_URL || "";
```

**Step 3: Initialize services (after CWD validation, line 33)**

```typescript
// ── Init Database ──
if (DATABASE_URL) {
  initDatabase(DATABASE_URL);
  console.log("[db] Connected to Neon PostgreSQL");
}

// ── Init WhatsApp ──
const wa = new WhatsAppService(DEFAULT_CWD);

// Broadcast WhatsApp status changes to all WS clients
wa.on("status", (info) => {
  broadcastWs({ type: "wa_status", ...info });
});

// Broadcast incoming messages
wa.on("message", (msg) => {
  broadcastWs({ type: "wa_message", message: msg });
});

// Broadcast outgoing message tracking
wa.on("message_create", (msg) => {
  broadcastWs({ type: "wa_message_sent", message: msg });
});
```

**Step 4: Add WhatsApp API routes (before WebSocket section)**

```typescript
// ═══ WHATSAPP API ═══
app.get("/api/whatsapp/status", requireToken, (_req, res) => {
  res.json(wa.getInfo());
});

app.post("/api/whatsapp/connect", requireToken, async (_req, res) => {
  try {
    wa.initialize(); // Don't await — it runs in background
    res.json({ ok: true, message: "Initializing WhatsApp..." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/whatsapp/disconnect", requireToken, async (_req, res) => {
  await wa.destroy();
  res.json({ ok: true });
});

app.post("/api/whatsapp/logout", requireToken, async (_req, res) => {
  await wa.logout();
  res.json({ ok: true });
});

app.post("/api/whatsapp/send", requireToken, async (req, res) => {
  const { chatId, message } = req.body;
  if (!chatId || !message) {
    res.status(400).json({ error: "chatId and message required" });
    return;
  }
  try {
    await wa.sendMessage(chatId, message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/whatsapp/chats", requireToken, async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const chats = await wa.getChats(limit);
  res.json(chats);
});

app.get("/api/whatsapp/messages/:chatId", requireToken, async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const messages = await wa.getMessages(req.params.chatId, limit);
  res.json(messages);
});

// ═══ CONTACTS API ═══
app.get("/api/contacts", requireToken, async (req, res) => {
  if (!DATABASE_URL) { res.status(503).json({ error: "Database not configured" }); return; }
  const opts = {
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
    search: req.query.search as string || undefined,
    tags: req.query.tags ? (req.query.tags as string).split(",") : undefined,
  };
  try {
    const result = await getContacts(COMPANY_ID, opts);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/contacts/:contactId", requireToken, async (req, res) => {
  if (!DATABASE_URL) { res.status(503).json({ error: "Database not configured" }); return; }
  try {
    const contact = await getContact(COMPANY_ID, req.params.contactId);
    if (!contact) { res.status(404).json({ error: "Not found" }); return; }
    res.json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/contacts/:contactId", requireToken, async (req, res) => {
  if (!DATABASE_URL) { res.status(503).json({ error: "Database not configured" }); return; }
  try {
    const contact = await updateContact(COMPANY_ID, req.params.contactId, req.body);
    if (!contact) { res.status(404).json({ error: "Not found or no changes" }); return; }
    res.json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ MESSAGES API ═══
app.get("/api/messages/:chatId", requireToken, async (req, res) => {
  if (!DATABASE_URL) { res.status(503).json({ error: "Database not configured" }); return; }
  const opts = {
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
  };
  try {
    const messages = await getDbMessages(COMPANY_ID, req.params.chatId, opts);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ TAGS & EMPLOYEES API ═══
app.get("/api/tags", requireToken, async (_req, res) => {
  if (!DATABASE_URL) { res.json([]); return; }
  try { res.json(await getTags(COMPANY_ID)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get("/api/employees", requireToken, async (_req, res) => {
  if (!DATABASE_URL) { res.json([]); return; }
  try { res.json(await getEmployees(COMPANY_ID)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══ DASHBOARD STATS ═══
app.get("/api/stats", requireToken, async (_req, res) => {
  if (!DATABASE_URL) { res.json({}); return; }
  try { res.json(await getStats(COMPANY_ID)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
```

**Step 5: Update welcome message in WebSocket handler (line 638) to include WhatsApp status**

```typescript
send({
  type: "welcome",
  message: "Connected to AIOS",
  cwd: DEFAULT_CWD,
  version: VERSION,
  companyId: COMPANY_ID,
  uptime: Math.floor(process.uptime()),
  projectName: path.basename(DEFAULT_CWD),
  whatsapp: wa.getInfo(),
});
```

**Step 6: Update shutdown function to clean up WhatsApp + DB**

```typescript
async function shutdown() {
  log("shutting down...");
  clearInterval(heartbeat);
  clearInterval(scheduleCheckInterval);
  await wa.destroy();
  await closeDatabase();
  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));
  server.close(() => {
    log("stopped");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
```

**Step 7: Update CSP to allow QR code images (data: URIs already allowed for img-src)**

Already covered — existing CSP has `img-src 'self' data:;`

**Step 8: Increase JSON payload limit for contact updates**

Change line 53 from `10kb` to `256kb`:
```typescript
app.use(express.json({ limit: "256kb" }));
```

**Step 9: Commit**

```bash
git add web/server.ts
git commit -m "feat: add WhatsApp, contacts, messages, stats API routes"
```

---

### Task 5: Add navigation and WhatsApp page to frontend

**Files:**
- Modify: `web/public/index.html`

**Architecture:** The existing index.html is a single-page terminal UI. We add a top navigation bar with tabs: **Terminal** | **Contacts** | **Chat** | **WhatsApp**. Each tab shows/hides a content div. The terminal view remains the default.

**Step 1: Add navigation bar**

Insert after the opening `<body>` tag, before the existing layout. The nav bar sits at the very top with 4 tabs.

```html
<!-- Navigation Bar -->
<nav id="main-nav" class="flex items-center border-b border-neutral-800 bg-neutral-950 px-4 h-10 shrink-0">
  <div class="flex items-center gap-1 mr-6">
    <div class="w-2 h-2 rounded-full bg-orange-500"></div>
    <span class="text-xs font-semibold text-neutral-100 tracking-wider">AIOS</span>
  </div>
  <div class="flex gap-0.5" id="nav-tabs">
    <button onclick="switchPage('terminal')" data-page="terminal"
      class="nav-tab active px-3 py-1.5 text-xs rounded-md transition-colors">Terminal</button>
    <button onclick="switchPage('contacts')" data-page="contacts"
      class="nav-tab px-3 py-1.5 text-xs rounded-md transition-colors">Contacts</button>
    <button onclick="switchPage('chat')" data-page="chat"
      class="nav-tab px-3 py-1.5 text-xs rounded-md transition-colors">Chat</button>
    <button onclick="switchPage('whatsapp')" data-page="whatsapp"
      class="nav-tab px-3 py-1.5 text-xs rounded-md transition-colors">WhatsApp</button>
  </div>
  <div class="ml-auto flex items-center gap-3">
    <span id="wa-nav-status" class="text-[10px] text-neutral-500"></span>
    <span id="db-nav-status" class="text-[10px] text-neutral-500"></span>
  </div>
</nav>
```

**Step 2: Add nav tab CSS**

```css
.nav-tab { color: #737373; }
.nav-tab:hover { background: #262626; color: #e5e5e5; }
.nav-tab.active { background: #f97316; color: #0a0a0a; font-weight: 600; }
```

**Step 3: Wrap existing content in a page div**

Wrap the current sidebar + main area in:
```html
<div id="page-terminal" class="page-content flex flex-1 min-h-0">
  <!-- existing sidebar + terminal content -->
</div>
```

**Step 4: Add WhatsApp page**

```html
<div id="page-whatsapp" class="page-content hidden flex-1 min-h-0 p-6 overflow-auto">
  <div class="max-w-xl mx-auto">
    <h2 class="text-lg font-semibold text-neutral-100 mb-4">WhatsApp Connection</h2>

    <!-- Status Card -->
    <div id="wa-status-card" class="bg-neutral-900 rounded-lg border border-neutral-800 p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <div id="wa-status-dot" class="w-3 h-3 rounded-full bg-neutral-600"></div>
          <span id="wa-status-text" class="text-sm text-neutral-300">Disconnected</span>
        </div>
        <span id="wa-phone-number" class="text-xs text-neutral-500 font-mono"></span>
      </div>

      <!-- QR Code -->
      <div id="wa-qr-container" class="hidden flex flex-col items-center py-4">
        <p class="text-xs text-neutral-400 mb-3">Scan with WhatsApp on your phone</p>
        <img id="wa-qr-image" class="rounded-lg bg-white p-2" width="256" height="256" />
        <p class="text-[10px] text-neutral-500 mt-2">QR refreshes automatically</p>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-2 mt-4">
        <button id="wa-connect-btn" onclick="waConnect()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-md transition-colors">
          Connect WhatsApp
        </button>
        <button id="wa-disconnect-btn" onclick="waDisconnect()" class="hidden
          px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded-md transition-colors">
          Disconnect
        </button>
        <button id="wa-logout-btn" onclick="waLogout()" class="hidden
          px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-md transition-colors">
          Logout
        </button>
      </div>
    </div>

    <!-- Quick Send (only when connected) -->
    <div id="wa-quick-send" class="hidden bg-neutral-900 rounded-lg border border-neutral-800 p-6">
      <h3 class="text-sm font-semibold text-neutral-100 mb-3">Quick Send</h3>
      <div class="space-y-3">
        <input id="wa-send-to" type="text" placeholder="Phone number (e.g. 60123456789)"
          class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-100
                 placeholder-neutral-500 focus:border-orange-500 focus:outline-none" />
        <textarea id="wa-send-msg" placeholder="Message..."
          class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-100
                 placeholder-neutral-500 focus:border-orange-500 focus:outline-none h-20 resize-none"></textarea>
        <button onclick="waSendMessage()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-md transition-colors">
          Send Message
        </button>
      </div>
    </div>
  </div>
</div>
```

**Step 5: Add WhatsApp JavaScript**

```javascript
// ── WhatsApp Page ──
async function waConnect() {
  const btn = document.getElementById('wa-connect-btn');
  btn.textContent = 'Connecting...';
  btn.disabled = true;
  try {
    await fetch(`/api/whatsapp/connect?token=${TOKEN}`, { method: 'POST' });
  } catch (err) {
    showToast('Failed to connect: ' + err.message, 'error');
    btn.textContent = 'Connect WhatsApp';
    btn.disabled = false;
  }
}

async function waDisconnect() {
  await fetch(`/api/whatsapp/disconnect?token=${TOKEN}`, { method: 'POST' });
}

async function waLogout() {
  if (confirm('This will remove your WhatsApp session. You will need to scan QR again.')) {
    await fetch(`/api/whatsapp/logout?token=${TOKEN}`, { method: 'POST' });
  }
}

async function waSendMessage() {
  const to = document.getElementById('wa-send-to').value.trim();
  const msg = document.getElementById('wa-send-msg').value.trim();
  if (!to || !msg) { showToast('Enter phone number and message', 'warning'); return; }
  try {
    const res = await fetch(`/api/whatsapp/send?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: to, message: msg }),
    });
    if (res.ok) {
      showToast('Message sent!', 'success');
      document.getElementById('wa-send-msg').value = '';
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to send', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function updateWhatsAppUI(info) {
  const dot = document.getElementById('wa-status-dot');
  const text = document.getElementById('wa-status-text');
  const phone = document.getElementById('wa-phone-number');
  const qrContainer = document.getElementById('wa-qr-container');
  const qrImage = document.getElementById('wa-qr-image');
  const connectBtn = document.getElementById('wa-connect-btn');
  const disconnectBtn = document.getElementById('wa-disconnect-btn');
  const logoutBtn = document.getElementById('wa-logout-btn');
  const quickSend = document.getElementById('wa-quick-send');
  const navStatus = document.getElementById('wa-nav-status');

  const colors = {
    disconnected: 'bg-neutral-600', initializing: 'bg-yellow-500',
    qr: 'bg-yellow-500', authenticated: 'bg-blue-500',
    ready: 'bg-green-500', error: 'bg-red-500',
  };

  dot.className = `w-3 h-3 rounded-full ${colors[info.status] || 'bg-neutral-600'}`;
  text.textContent = info.status.charAt(0).toUpperCase() + info.status.slice(1);
  phone.textContent = info.phoneNumber ? `+${info.phoneNumber}` : '';
  navStatus.textContent = info.status === 'ready' ? `WA: +${info.phoneNumber}` :
    info.status === 'qr' ? 'WA: Scan QR' : `WA: ${info.status}`;

  // QR display
  if (info.status === 'qr' && info.qrCode) {
    qrContainer.classList.remove('hidden');
    qrImage.src = info.qrCode;
  } else {
    qrContainer.classList.add('hidden');
  }

  // Button visibility
  connectBtn.classList.toggle('hidden', info.status !== 'disconnected' && info.status !== 'error');
  connectBtn.textContent = 'Connect WhatsApp';
  connectBtn.disabled = false;
  disconnectBtn.classList.toggle('hidden', info.status === 'disconnected' || info.status === 'error');
  logoutBtn.classList.toggle('hidden', info.status !== 'ready');
  quickSend.classList.toggle('hidden', info.status !== 'ready');
}
```

**Step 6: Add page switching JavaScript**

```javascript
// ── Page Navigation ──
let activePage = 'terminal';

function switchPage(page) {
  activePage = page;
  // Hide all pages
  document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
  // Show target
  const target = document.getElementById(`page-${page}`);
  if (target) { target.classList.remove('hidden'); target.classList.add('flex'); }
  // Update nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  // Load data for page
  if (page === 'contacts') loadContacts();
  if (page === 'whatsapp') loadWhatsAppStatus();
  if (page === 'chat') loadChats();
}

async function loadWhatsAppStatus() {
  try {
    const res = await fetch(`/api/whatsapp/status?token=${TOKEN}`);
    const info = await res.json();
    updateWhatsAppUI(info);
  } catch {}
}
```

**Step 7: Handle wa_status WebSocket messages**

In the existing WebSocket message handler, add:
```javascript
if (data.type === 'wa_status') {
  updateWhatsAppUI(data);
  return;
}
if (data.type === 'wa_message') {
  // Show notification for incoming WhatsApp messages
  if (Notification.permission === 'granted') {
    new Notification('WhatsApp', {
      body: `${data.message.contactName || data.message.phoneNumber}: ${data.message.body.substring(0, 100)}`,
    });
  }
  // If on chat page, refresh
  if (activePage === 'chat') loadChats();
  return;
}
```

**Step 8: Commit**

```bash
git add web/public/index.html
git commit -m "feat: add navigation bar and WhatsApp page to frontend"
```

---

### Task 6: Add Contacts page to frontend

**Files:**
- Modify: `web/public/index.html`

**Step 1: Add contacts page HTML**

```html
<div id="page-contacts" class="page-content hidden flex-1 min-h-0 flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
    <div class="flex items-center gap-3">
      <h2 class="text-sm font-semibold text-neutral-100">Contacts</h2>
      <span id="contacts-count" class="text-[10px] text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full"></span>
    </div>
    <div class="flex items-center gap-2">
      <input id="contacts-search" type="text" placeholder="Search contacts..."
        oninput="debounceContactSearch()"
        class="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-100
               placeholder-neutral-500 focus:border-orange-500 focus:outline-none w-64" />
      <select id="contacts-tag-filter" onchange="loadContacts()"
        class="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-100
               focus:border-orange-500 focus:outline-none">
        <option value="">All Tags</option>
      </select>
    </div>
  </div>

  <!-- Table -->
  <div class="flex-1 overflow-auto">
    <table class="w-full text-xs">
      <thead class="sticky top-0 bg-neutral-900 border-b border-neutral-800">
        <tr>
          <th class="text-left px-4 py-2 text-neutral-400 font-medium">Name</th>
          <th class="text-left px-4 py-2 text-neutral-400 font-medium">Phone</th>
          <th class="text-left px-4 py-2 text-neutral-400 font-medium">Tags</th>
          <th class="text-left px-4 py-2 text-neutral-400 font-medium">Last Message</th>
          <th class="text-left px-4 py-2 text-neutral-400 font-medium">Updated</th>
        </tr>
      </thead>
      <tbody id="contacts-tbody" class="divide-y divide-neutral-800/50"></tbody>
    </table>
  </div>

  <!-- Pagination -->
  <div class="flex items-center justify-between px-4 py-2 border-t border-neutral-800">
    <span id="contacts-showing" class="text-[10px] text-neutral-500"></span>
    <div class="flex gap-1">
      <button id="contacts-prev" onclick="contactsPage(-1)"
        class="px-2 py-1 text-[10px] bg-neutral-800 rounded hover:bg-neutral-700 text-neutral-300 disabled:opacity-30">Prev</button>
      <button id="contacts-next" onclick="contactsPage(1)"
        class="px-2 py-1 text-[10px] bg-neutral-800 rounded hover:bg-neutral-700 text-neutral-300 disabled:opacity-30">Next</button>
    </div>
  </div>
</div>
```

**Step 2: Add contacts JavaScript**

```javascript
// ── Contacts Page ──
let contactsOffset = 0;
const CONTACTS_LIMIT = 50;
let contactsTotal = 0;
let searchTimeout = null;

function debounceContactSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { contactsOffset = 0; loadContacts(); }, 300);
}

async function loadContacts() {
  const search = document.getElementById('contacts-search')?.value || '';
  const tag = document.getElementById('contacts-tag-filter')?.value || '';
  const params = new URLSearchParams({
    token: TOKEN, limit: CONTACTS_LIMIT, offset: contactsOffset,
  });
  if (search) params.set('search', search);
  if (tag) params.set('tags', tag);

  try {
    const res = await fetch(`/api/contacts?${params}`);
    if (!res.ok) { document.getElementById('contacts-tbody').innerHTML =
      '<tr><td colspan="5" class="px-4 py-8 text-center text-neutral-500 text-xs">Database not configured</td></tr>'; return; }
    const data = await res.json();
    contactsTotal = data.total;
    renderContacts(data.contacts);
    updateContactsPagination();
  } catch (err) {
    document.getElementById('contacts-tbody').innerHTML =
      `<tr><td colspan="5" class="px-4 py-8 text-center text-red-400 text-xs">${err.message}</td></tr>`;
  }
}

function renderContacts(contacts) {
  const tbody = document.getElementById('contacts-tbody');
  document.getElementById('contacts-count').textContent = `${contactsTotal} total`;

  if (!contacts.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-neutral-500 text-xs">No contacts found</td></tr>';
    return;
  }

  tbody.innerHTML = contacts.map(c => {
    const tags = (c.tags || []).slice(0, 3).map(t =>
      `<span class="px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] text-neutral-400">${t}</span>`
    ).join(' ');
    const lastMsg = c.last_message_body ? c.last_message_body.substring(0, 40) + (c.last_message_body.length > 40 ? '...' : '') : '';
    const updated = c.last_updated ? timeAgo(new Date(c.last_updated)) : '';
    const name = c.contact_name || c.first_name || c.phone || 'Unknown';

    return `<tr class="hover:bg-neutral-900/50 cursor-pointer" onclick="openContactChat('${c.chat_id || c.phone}', '${name.replace(/'/g, "\\'")}')">
      <td class="px-4 py-2.5">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400 shrink-0">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="text-neutral-100 font-medium">${escapeHtml(name)}</div>
            ${c.email ? `<div class="text-[10px] text-neutral-500">${escapeHtml(c.email)}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="px-4 py-2.5 text-neutral-300 font-mono">${c.phone || ''}</td>
      <td class="px-4 py-2.5"><div class="flex gap-1 flex-wrap">${tags}</div></td>
      <td class="px-4 py-2.5 text-neutral-400 max-w-[200px] truncate">${escapeHtml(lastMsg)}</td>
      <td class="px-4 py-2.5 text-neutral-500">${updated}</td>
    </tr>`;
  }).join('');
}

function updateContactsPagination() {
  const start = contactsOffset + 1;
  const end = Math.min(contactsOffset + CONTACTS_LIMIT, contactsTotal);
  document.getElementById('contacts-showing').textContent = `${start}-${end} of ${contactsTotal}`;
  document.getElementById('contacts-prev').disabled = contactsOffset === 0;
  document.getElementById('contacts-next').disabled = contactsOffset + CONTACTS_LIMIT >= contactsTotal;
}

function contactsPage(dir) {
  contactsOffset = Math.max(0, contactsOffset + (dir * CONTACTS_LIMIT));
  loadContacts();
}

function openContactChat(chatId, name) {
  if (chatId) {
    switchPage('chat');
    selectChat(chatId, name);
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 604800) return `${Math.floor(s/86400)}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

**Step 3: Load tags for filter dropdown**

```javascript
async function loadTags() {
  try {
    const res = await fetch(`/api/tags?token=${TOKEN}`);
    if (!res.ok) return;
    const tags = await res.json();
    const select = document.getElementById('contacts-tag-filter');
    tags.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
  } catch {}
}
// Call on page load
loadTags();
```

**Step 4: Commit**

```bash
git add web/public/index.html
git commit -m "feat: add contacts page with search, filter, pagination"
```

---

### Task 7: Add Chat/Assistant page to frontend

**Files:**
- Modify: `web/public/index.html`

**Step 1: Add chat page HTML**

Two-panel layout: conversation list (left) + message thread (right).

```html
<div id="page-chat" class="page-content hidden flex-1 min-h-0 flex overflow-hidden">
  <!-- Conversation List (left) -->
  <div class="w-72 border-r border-neutral-800 flex flex-col shrink-0">
    <div class="px-3 py-2 border-b border-neutral-800">
      <input id="chat-search" type="text" placeholder="Search chats..."
        oninput="debounceChatsSearch()"
        class="w-full px-2.5 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-100
               placeholder-neutral-500 focus:border-orange-500 focus:outline-none" />
    </div>
    <div id="chat-list" class="flex-1 overflow-y-auto divide-y divide-neutral-800/30"></div>
  </div>

  <!-- Message Thread (right) -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Chat Header -->
    <div id="chat-header" class="px-4 py-2.5 border-b border-neutral-800 flex items-center gap-3">
      <div id="chat-header-avatar" class="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-sm text-neutral-400 shrink-0"></div>
      <div>
        <div id="chat-header-name" class="text-sm font-medium text-neutral-100">Select a conversation</div>
        <div id="chat-header-phone" class="text-[10px] text-neutral-500"></div>
      </div>
    </div>

    <!-- Messages -->
    <div id="chat-messages" class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      <div class="text-center text-neutral-500 text-xs py-20">Select a contact to view messages</div>
    </div>

    <!-- Message Input -->
    <div id="chat-input-area" class="hidden border-t border-neutral-800 px-4 py-3">
      <div class="flex gap-2">
        <input id="chat-input" type="text" placeholder="Type a message..."
          onkeydown="if(event.key==='Enter')sendChatMessage()"
          class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-100
                 placeholder-neutral-500 focus:border-orange-500 focus:outline-none" />
        <button onclick="sendChatMessage()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-md transition-colors shrink-0">
          Send
        </button>
      </div>
      <div class="flex items-center gap-2 mt-1.5">
        <span class="text-[10px] text-neutral-500">via WhatsApp</span>
        <span id="chat-wa-status-indicator" class="text-[10px]"></span>
      </div>
    </div>
  </div>
</div>
```

**Step 2: Add chat JavaScript**

```javascript
// ── Chat Page ──
let selectedChatId = null;
let selectedChatName = null;
let chatSearchTimeout = null;

function debounceChatsSearch() {
  clearTimeout(chatSearchTimeout);
  chatSearchTimeout = setTimeout(loadChats, 300);
}

async function loadChats() {
  const searchTerm = document.getElementById('chat-search')?.value?.toLowerCase() || '';
  const listEl = document.getElementById('chat-list');

  // Try WhatsApp chats first (live), fallback to DB contacts with messages
  let chats = [];
  try {
    const res = await fetch(`/api/whatsapp/chats?token=${TOKEN}&limit=100`);
    if (res.ok) chats = await res.json();
  } catch {}

  // If no WA chats, try DB contacts
  if (!chats.length) {
    try {
      const res = await fetch(`/api/contacts?token=${TOKEN}&limit=100&offset=0`);
      if (res.ok) {
        const data = await res.json();
        chats = data.contacts
          .filter(c => c.last_message_body)
          .map(c => ({
            id: c.chat_id || `${c.phone}@c.us`,
            name: c.contact_name || c.phone || 'Unknown',
            lastMessage: c.last_message_body?.substring(0, 60) || '',
            timestamp: c.last_updated ? new Date(c.last_updated).getTime() / 1000 : 0,
            unreadCount: c.unread_count || 0,
          }));
      }
    } catch {}
  }

  // Filter
  if (searchTerm) {
    chats = chats.filter(c =>
      (c.name || '').toLowerCase().includes(searchTerm) ||
      (c.id || '').includes(searchTerm)
    );
  }

  // Sort by most recent
  chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (!chats.length) {
    listEl.innerHTML = '<div class="px-3 py-8 text-center text-neutral-500 text-xs">No conversations</div>';
    return;
  }

  listEl.innerHTML = chats.map(c => {
    const name = c.name || c.id?.replace('@c.us', '') || 'Unknown';
    const time = c.timestamp ? timeAgo(new Date(c.timestamp * 1000)) : '';
    const isSelected = c.id === selectedChatId;
    return `<div class="px-3 py-2.5 cursor-pointer hover:bg-neutral-900 transition-colors
                 ${isSelected ? 'bg-neutral-800' : ''}"
                 onclick="selectChat('${c.id}', '${name.replace(/'/g, "\\'")}')">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400 shrink-0">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div class="min-w-0">
            <div class="text-xs text-neutral-100 font-medium truncate">${escapeHtml(name)}</div>
            <div class="text-[10px] text-neutral-500 truncate">${escapeHtml(c.lastMessage || '')}</div>
          </div>
        </div>
        <div class="text-right shrink-0 ml-2">
          <div class="text-[9px] text-neutral-600">${time}</div>
          ${c.unreadCount > 0 ? `<div class="bg-green-600 text-white text-[9px] px-1.5 rounded-full mt-0.5">${c.unreadCount}</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function selectChat(chatId, name) {
  selectedChatId = chatId;
  selectedChatName = name;

  // Update header
  document.getElementById('chat-header-name').textContent = name;
  document.getElementById('chat-header-phone').textContent = chatId?.replace('@c.us', '').replace('@g.us', '') || '';
  document.getElementById('chat-header-avatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('chat-input-area').classList.remove('hidden');

  // Update WA status indicator
  const waInfo = await fetch(`/api/whatsapp/status?token=${TOKEN}`).then(r => r.json()).catch(() => ({}));
  const indicator = document.getElementById('chat-wa-status-indicator');
  if (waInfo.status === 'ready') {
    indicator.textContent = 'Connected';
    indicator.className = 'text-[10px] text-green-500';
  } else {
    indicator.textContent = 'WhatsApp not connected — messages will not be delivered';
    indicator.className = 'text-[10px] text-red-400';
  }

  // Load messages — try WA first, then DB
  const messagesEl = document.getElementById('chat-messages');
  messagesEl.innerHTML = '<div class="text-center text-neutral-500 text-xs py-4">Loading...</div>';

  let messages = [];

  // Try WhatsApp live messages
  try {
    const res = await fetch(`/api/whatsapp/messages/${encodeURIComponent(chatId)}?token=${TOKEN}&limit=50`);
    if (res.ok) messages = await res.json();
  } catch {}

  // Fallback to DB messages
  if (!messages.length) {
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(chatId)}?token=${TOKEN}&limit=50`);
      if (res.ok) messages = await res.json();
    } catch {}
  }

  renderMessages(messages);

  // Highlight selected in chat list
  document.querySelectorAll('#chat-list > div').forEach(el => {
    el.classList.toggle('bg-neutral-800', el.onclick?.toString().includes(chatId));
  });
}

function renderMessages(messages) {
  const el = document.getElementById('chat-messages');

  if (!messages.length) {
    el.innerHTML = '<div class="text-center text-neutral-500 text-xs py-8">No messages</div>';
    return;
  }

  // Sort oldest first for display
  messages.sort((a, b) => a.timestamp - b.timestamp);

  el.innerHTML = messages.map(m => {
    const isMe = m.fromMe || m.from_me;
    const body = m.body || m.message_body || '';
    const time = new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `<div class="flex ${isMe ? 'justify-end' : 'justify-start'}">
      <div class="max-w-[70%] px-3 py-2 rounded-lg text-xs leading-relaxed
                  ${isMe ? 'bg-green-900/40 text-green-100' : 'bg-neutral-800 text-neutral-100'}">
        ${m.contactName && !isMe ? `<div class="text-[10px] text-orange-400 font-medium mb-0.5">${escapeHtml(m.contactName)}</div>` : ''}
        <div class="whitespace-pre-wrap break-words">${escapeHtml(body)}</div>
        <div class="text-[9px] ${isMe ? 'text-green-500/60' : 'text-neutral-500'} mt-1 text-right">${time}</div>
      </div>
    </div>`;
  }).join('');

  // Scroll to bottom
  el.scrollTop = el.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !selectedChatId) return;

  input.value = '';

  try {
    const res = await fetch(`/api/whatsapp/send?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: selectedChatId, message }),
    });

    if (res.ok) {
      // Add message to UI immediately
      const messagesEl = document.getElementById('chat-messages');
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      messagesEl.innerHTML += `<div class="flex justify-end">
        <div class="max-w-[70%] px-3 py-2 rounded-lg text-xs leading-relaxed bg-green-900/40 text-green-100">
          <div class="whitespace-pre-wrap break-words">${escapeHtml(message)}</div>
          <div class="text-[9px] text-green-500/60 mt-1 text-right">${time}</div>
        </div>
      </div>`;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      loadChats(); // refresh chat list
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to send', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}
```

**Step 3: Handle incoming messages in real-time**

Add to WebSocket handler:
```javascript
if (data.type === 'wa_message' && activePage === 'chat') {
  // If this message is for the selected chat, append it
  if (data.message.chatId === selectedChatId) {
    const messagesEl = document.getElementById('chat-messages');
    const m = data.message;
    const time = new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messagesEl.innerHTML += `<div class="flex justify-start">
      <div class="max-w-[70%] px-3 py-2 rounded-lg text-xs leading-relaxed bg-neutral-800 text-neutral-100">
        ${m.contactName ? `<div class="text-[10px] text-orange-400 font-medium mb-0.5">${escapeHtml(m.contactName)}</div>` : ''}
        <div class="whitespace-pre-wrap break-words">${escapeHtml(m.body)}</div>
        <div class="text-[9px] text-neutral-500 mt-1 text-right">${time}</div>
      </div>
    </div>`;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  loadChats(); // refresh chat list order
}
```

**Step 4: Commit**

```bash
git add web/public/index.html
git commit -m "feat: add chat page with conversation list, messages, and send"
```

---

## Phase 2: Integration & Polish

### Task 8: Add environment configuration

**Files:**
- Create: `web/.env.example`

**Step 1: Create env example**

```bash
# AIOS Web Server Configuration
AIOS_TOKEN=         # Auth token (auto-generated if empty)
AIOS_CWD=           # Working directory (default: ~/Repo/firaz/adletic/aios-firaz)
PORT=3456            # Server port
AIOS_HOST=127.0.0.1 # Bind host (0.0.0.0 for remote access)

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://neondb_owner:npg_Y43yGsVocuWi@ep-curly-boat-a1wfjnpy-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# Company
COMPANY_ID=0210      # Your company_id in the database

# WhatsApp (auto-managed, no config needed)
# Sessions stored in {AIOS_CWD}/.wwebjs_auth/
```

**Step 2: Add dotenv loading to server.ts**

```bash
cd web && npm install dotenv
```

Add to top of server.ts (after imports):
```typescript
import dotenv from "dotenv";
dotenv.config();
```

**Step 3: Commit**

```bash
git add web/.env.example web/server.ts web/package.json
git commit -m "feat: add env configuration with dotenv"
```

---

### Task 9: Add dashboard stats to WhatsApp page

**Files:**
- Modify: `web/public/index.html`

**Step 1: Add stats cards below WhatsApp connection card**

```html
<!-- Stats (in WhatsApp page, after quick-send div) -->
<div id="wa-stats" class="mt-6 grid grid-cols-2 gap-3">
  <div class="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
    <div class="text-[10px] text-neutral-500 uppercase tracking-wider">Contacts</div>
    <div id="stat-contacts" class="text-2xl font-semibold text-neutral-100 mt-1">-</div>
  </div>
  <div class="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
    <div class="text-[10px] text-neutral-500 uppercase tracking-wider">Messages</div>
    <div id="stat-messages" class="text-2xl font-semibold text-neutral-100 mt-1">-</div>
  </div>
  <div class="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
    <div class="text-[10px] text-neutral-500 uppercase tracking-wider">Messages (24h)</div>
    <div id="stat-messages-24h" class="text-2xl font-semibold text-neutral-100 mt-1">-</div>
  </div>
  <div class="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
    <div class="text-[10px] text-neutral-500 uppercase tracking-wider">New Contacts (24h)</div>
    <div id="stat-new-contacts" class="text-2xl font-semibold text-neutral-100 mt-1">-</div>
  </div>
</div>
```

**Step 2: Add stats loading JavaScript**

```javascript
async function loadStats() {
  try {
    const res = await fetch(`/api/stats?token=${TOKEN}`);
    if (!res.ok) return;
    const s = await res.json();
    document.getElementById('stat-contacts').textContent = s.totalContacts?.toLocaleString() || '-';
    document.getElementById('stat-messages').textContent = s.totalMessages?.toLocaleString() || '-';
    document.getElementById('stat-messages-24h').textContent = s.messages24h?.toLocaleString() || '-';
    document.getElementById('stat-new-contacts').textContent = s.newContacts24h?.toLocaleString() || '-';
  } catch {}
}
```

Call `loadStats()` when WhatsApp page loads (in `switchPage`).

**Step 3: Commit**

```bash
git add web/public/index.html
git commit -m "feat: add dashboard stats to WhatsApp page"
```

---

### Task 10: Testing & verification

**Step 1: Start the server and test**

```bash
cd /Users/firazfhansurie/Repo/firaz/adletic/aios-terminal/web
# Create .env with DATABASE_URL and COMPANY_ID
npm run dev
```

**Step 2: Verify all pages**

1. Open `http://localhost:3456?token=TOKEN`
2. Verify Terminal page works as before
3. Click "Contacts" tab — should load contacts from DB
4. Click "WhatsApp" tab — should show connection card
5. Click "Connect WhatsApp" — QR should appear
6. Scan QR — status should change to "Ready"
7. Click "Chat" tab — should show conversations
8. Select a chat — messages should load
9. Send a message — should appear in thread
10. Verify incoming messages appear in real-time

**Step 3: Test API endpoints independently**

```bash
TOKEN="your-token-here"
curl "http://localhost:3456/api/health"
curl "http://localhost:3456/api/whatsapp/status?token=$TOKEN"
curl "http://localhost:3456/api/contacts?token=$TOKEN&limit=5"
curl "http://localhost:3456/api/stats?token=$TOKEN"
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: AIOS Terminal CRM v1 — WhatsApp + Contacts + Chat"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Branch + deps | `package.json` |
| 2 | WhatsApp service | `services/whatsapp.ts` |
| 3 | Database service | `services/database.ts` |
| 4 | API routes | `server.ts` |
| 5 | Nav + WhatsApp UI | `public/index.html` |
| 6 | Contacts UI | `public/index.html` |
| 7 | Chat UI | `public/index.html` |
| 8 | Env config | `.env.example`, `server.ts` |
| 9 | Dashboard stats | `public/index.html` |
| 10 | Testing | Manual verification |

**New dependencies:** whatsapp-web.js, qrcode, pg, dotenv, @types/qrcode, @types/pg

**New files:** `services/whatsapp.ts`, `services/database.ts`, `.env.example`

**Modified files:** `server.ts` (add routes + service init), `public/index.html` (add 3 pages + navigation), `package.json` (deps)
