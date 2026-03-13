/**
 * WhatsApp Connection Manager for AIOS Web Server
 * Manages multiple wwebjs clients, broadcasts QR/status via callback.
 * Session auth stored in DEFAULT_CWD/.wwebjs_auth/ (carries over from wa-connect.js).
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Dynamic require for CommonJS modules
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");

// ── Types ──

export interface ConnectionState {
  id: string;
  name: string;
  instancePath: string;
  status: "offline" | "disconnected" | "qr" | "connecting" | "ready" | "error";
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
  connectedAt: number | null;
  sessionExists: boolean;
  uptime?: number;
}

interface InternalConnection extends ConnectionState {
  client: any | null;
}

type BroadcastFn = (data: any) => void;

// ── State ──

const connections = new Map<string, InternalConnection>();
let authBasePath: string;
let configPath: string;
let broadcast: BroadcastFn = () => {};

// ── Chrome detection ──

const CHROME_CANDIDATES: Record<string, string[]> = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ],
};

function findChrome(): string | undefined {
  const platform = process.platform;
  const paths = CHROME_CANDIDATES[platform] || CHROME_CANDIDATES.linux;
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const which = execSync(
      "which google-chrome || which chromium-browser || which chromium",
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (which) return which;
  } catch {}
  return undefined;
}

// ── Helpers ──

function getPublicState(conn: InternalConnection): ConnectionState {
  const sessionPath = path.join(authBasePath, `session-${conn.id}`, "Default");
  return {
    id: conn.id,
    name: conn.name,
    instancePath: authBasePath,
    status: conn.status,
    qrDataUrl: conn.status === "qr" ? conn.qrDataUrl : null,
    phoneNumber: conn.phoneNumber,
    lastError: conn.lastError,
    connectedAt: conn.connectedAt,
    sessionExists: fs.existsSync(sessionPath),
    uptime: conn.connectedAt
      ? Math.floor((Date.now() - conn.connectedAt) / 1000)
      : undefined,
  };
}

function getAllStatuses(): ConnectionState[] {
  return Array.from(connections.values()).map(getPublicState);
}

function notify(connectionId?: string) {
  broadcast({
    type: "whatsapp:status",
    connectionId,
    connections: getAllStatuses(),
  });
}

function loadConfig(): Array<{ id: string; name: string }> {
  let saved: Array<{ id: string; name: string }> = [];
  if (fs.existsSync(configPath)) {
    try {
      saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {}
  }

  // Auto-detect existing sessions in .wwebjs_auth/
  if (fs.existsSync(authBasePath)) {
    try {
      const entries = fs.readdirSync(authBasePath);
      for (const entry of entries) {
        if (!entry.startsWith("session-")) continue;
        const clientId = entry.replace("session-", "");
        const sessionDefault = path.join(authBasePath, entry, "Default");
        if (!fs.existsSync(sessionDefault)) continue;
        if (saved.some((s) => s.id === clientId)) continue;
        const name = clientId
          .replace(/^aios-/, "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        saved.push({ id: clientId, name });
      }
    } catch {}
  }

  return saved;
}

function saveConfig() {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = Array.from(connections.values()).map((c) => ({
    id: c.id,
    name: c.name,
  }));
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

// ── Client lifecycle ──

export async function connectClient(
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  const conn = connections.get(connectionId);
  if (!conn) return { success: false, error: "Connection not found" };
  if (conn.client) return { success: true };

  const chrome = findChrome();
  if (!chrome) {
    return {
      success: false,
      error: "Chrome/Chromium not found. Install Chrome to use WhatsApp.",
    };
  }

  conn.status = "connecting";
  conn.qrDataUrl = null;
  notify(connectionId);

  try {
    conn.client = new Client({
      authStrategy: new LocalAuth({
        clientId: conn.id,
        dataPath: authBasePath,
      }),
      puppeteer: {
        headless: true,
        executablePath: chrome,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-extensions",
          "--disable-gpu",
          "--disable-dev-shm-usage",
        ],
      },
    });

    conn.client.on("qr", async (qr: string) => {
      try {
        conn.qrDataUrl = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
        });
      } catch {
        conn.qrDataUrl = null;
      }
      conn.status = "qr";
      notify(connectionId);
    });

    conn.client.on("authenticated", () => {
      conn.status = "connecting";
      conn.qrDataUrl = null;
      notify(connectionId);
    });

    conn.client.on("ready", () => {
      conn.status = "ready";
      conn.qrDataUrl = null;
      conn.phoneNumber = conn.client?.info?.wid?.user
        ? `+${conn.client.info.wid.user}`
        : null;
      conn.connectedAt = Date.now();
      conn.lastError = null;
      notify(connectionId);
    });

    conn.client.on("disconnected", (reason: string) => {
      conn.status = "disconnected";
      conn.phoneNumber = null;
      conn.connectedAt = null;
      conn.lastError = reason;
      conn.client = null;
      notify(connectionId);
    });

    conn.client.on("auth_failure", (msg: string) => {
      conn.status = "error";
      conn.lastError = `Auth failed: ${msg}`;
      conn.client = null;
      notify(connectionId);
    });

    await conn.client.initialize();
    return { success: true };
  } catch (err: any) {
    conn.status = "error";
    conn.lastError = err.message;
    conn.client = null;
    notify(connectionId);
    return { success: false, error: err.message };
  }
}

export async function disconnectClient(connectionId: string): Promise<void> {
  const conn = connections.get(connectionId);
  if (!conn) return;
  if (conn.client) {
    try {
      await conn.client.destroy();
    } catch {}
    conn.client = null;
  }
  conn.status = "offline";
  conn.qrDataUrl = null;
  conn.phoneNumber = null;
  conn.connectedAt = null;
  notify(connectionId);
}

// ── Public API ──

export function initWhatsApp(opts: {
  defaultCwd: string;
  broadcastFn: BroadcastFn;
}) {
  authBasePath = path.join(opts.defaultCwd, ".wwebjs_auth");
  configPath = path.join(opts.defaultCwd, ".claude", "whatsapp-connections.json");
  broadcast = opts.broadcastFn;

  // Load saved + auto-detected connections
  const saved = loadConfig();
  for (const s of saved) {
    if (!connections.has(s.id)) {
      connections.set(s.id, {
        id: s.id,
        name: s.name,
        client: null,
        status: "offline",
        qrDataUrl: null,
        phoneNumber: null,
        lastError: null,
        connectedAt: null,
      });
    }
  }
}

export function listConnections(): ConnectionState[] {
  return getAllStatuses();
}

export function addConnection(
  id: string,
  name: string
): { success: boolean; error?: string } {
  if (connections.has(id)) {
    return { success: false, error: "Connection ID already exists" };
  }
  connections.set(id, {
    id,
    name,
    client: null,
    status: "offline",
    qrDataUrl: null,
    phoneNumber: null,
    lastError: null,
    connectedAt: null,
  });
  saveConfig();
  notify(id);
  return { success: true };
}

export function removeConnection(id: string): Promise<{ success: boolean }> {
  return disconnectClient(id).then(() => {
    connections.delete(id);
    saveConfig();
    notify();
    return { success: true };
  });
}

export async function destroyAll(): Promise<void> {
  const ids = Array.from(connections.keys());
  await Promise.all(ids.map((id) => disconnectClient(id).catch(() => {})));
}
