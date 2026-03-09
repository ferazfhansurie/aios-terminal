import { query } from "@anthropic-ai/claude-code";
import path from "path";
import os from "os";

// ── Config ──
const BOT_TOKEN = "8700460995:AAHNpUqcxxxBSBAFF27zrUq2dbX_loImMlw";
const ALLOWED_CHAT_ID = 6768889134;
const CWD = process.env.AIOS_CWD || path.join(os.homedir(), "Repo/firaz/adletic/aios-firaz");
const MAX_TURNS = 200;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let lastUpdateId = 0;
let activeQuery = false;
const sessions = new Map<number, string>();

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// ── Telegram API ──
async function tg(method: string, body: Record<string, any> = {}) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

async function sendMessage(chatId: number, text: string, replyTo?: number) {
  const chunks = splitMessage(text, 4000);
  for (let i = 0; i < chunks.length; i++) {
    // Try HTML first, fall back to plain text if parsing fails
    let result = await tg("sendMessage", {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(i === 0 && replyTo ? { reply_to_message_id: replyTo } : {}),
    });
    if (!result.ok && result.description?.includes("parse")) {
      // HTML parse error — send as plain text
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunks[i],
        ...(i === 0 && replyTo ? { reply_to_message_id: replyTo } : {}),
      });
    }
  }
}

async function sendTyping(chatId: number) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).replace(/^\n/, "");
  }
  return chunks;
}

// ── Markdown → Telegram HTML ──
function mdToTelegram(text: string): string {
  let result = text;

  // Code blocks: ```lang\ncode\n``` → <pre><code>code</code></pre>
  result = result.replace(/```[\w]*\n([\s\S]*?)```/g, (_m, code) => {
    return `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Inline code: `code` → <code>code</code>
  result = result.replace(/`([^`]+)`/g, (_m, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  result = result.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* or _text_ (not inside words)
  result = result.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, "<i>$1</i>");
  result = result.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, "<i>$1</i>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Headers: # text → bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Bullet points: clean up
  result = result.replace(/^[-*]\s+/gm, "• ");

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Process message with Claude ──
async function handleMessage(chatId: number, text: string, messageId: number) {
  if (chatId !== ALLOWED_CHAT_ID) {
    await sendMessage(chatId, "Unauthorized.");
    return;
  }

  // Commands
  if (text === "/start") {
    await sendMessage(chatId, "🖥 <b>AIOS is live.</b>\n\nSend me anything — I have full access to your machine.\n\n/new — fresh session\n/status — check status");
    return;
  }
  if (text === "/new") {
    sessions.delete(chatId);
    await sendMessage(chatId, "Session cleared.");
    return;
  }
  if (text === "/status") {
    await sendMessage(chatId, `Active: ${activeQuery ? "working..." : "idle"}\nSession: ${sessions.has(chatId) ? "active" : "none"}`);
    return;
  }

  if (activeQuery) {
    await sendMessage(chatId, "Still working on your last message. Hold on or /new to reset.");
    return;
  }

  activeQuery = true;
  await sendTyping(chatId);
  const typingInterval = setInterval(() => sendTyping(chatId), 4000);

  try {
    const opts: Record<string, any> = {
      allowedTools: [
        "Read", "Edit", "Write", "Bash", "Glob", "Grep",
        "WebSearch", "WebFetch", "Agent", "TodoWrite",
      ],
      permissionMode: "bypassPermissions",
      cwd: CWD,
      maxTurns: MAX_TURNS,
    };

    const sessionId = sessions.get(chatId);
    if (sessionId) {
      opts.resume = { id: sessionId, command: text };
    }

    log(`→ "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);

    const textBlocks: string[] = [];
    let newSessionId: string | undefined;

    for await (const message of query({ prompt: text, options: opts })) {
      if (message.sessionId) {
        newSessionId = message.sessionId;
      }

      // Capture final assistant text (the actual response)
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text?.trim()) {
            textBlocks.push(block.text.trim());
          }
        }
      }

      // Capture result text
      if (message.type === "result" && message.result?.trim()) {
        // Only add if it's not already covered by assistant blocks
        const resultText = message.result.trim();
        const isDuplicate = textBlocks.some(t =>
          t.includes(resultText.substring(0, Math.min(100, resultText.length)))
        );
        if (!isDuplicate) {
          textBlocks.push(resultText);
        }
      }
    }

    if (newSessionId) {
      sessions.set(chatId, newSessionId);
    }

    // Build final response — take the last meaningful text blocks
    // Claude often repeats context; the final blocks are the actual answer
    let response: string;
    if (textBlocks.length === 0) {
      response = "Done. (no text output)";
    } else {
      // Use the result block if available (it's the final summary),
      // otherwise use the last assistant text block
      response = textBlocks[textBlocks.length - 1];

      // If there are multiple blocks and the last one is short,
      // include more context
      if (textBlocks.length > 1 && response.length < 200) {
        response = textBlocks.slice(-3).join("\n\n");
      }
    }

    clearInterval(typingInterval);

    // Convert markdown to Telegram HTML
    const formatted = mdToTelegram(response);
    await sendMessage(chatId, formatted, messageId);
    log(`← replied (${formatted.length} chars)`);
  } catch (err: any) {
    clearInterval(typingInterval);
    log(`✗ error: ${err.message}`);
    await sendMessage(chatId, `⚠️ ${escapeHtml(err.message || "Query failed")}`);
  }

  activeQuery = false;
}

// ── Polling ──
async function poll() {
  try {
    const data = await tg("getUpdates", {
      offset: lastUpdateId + 1,
      timeout: 30,
      allowed_updates: ["message"],
    });

    if (data.ok && data.result?.length > 0) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        const msg = update.message;
        if (msg?.text) {
          // Don't await — let it process while we continue polling
          handleMessage(msg.chat.id, msg.text, msg.message_id);
        }
      }
    }
  } catch (err: any) {
    log(`poll error: ${err.message}`);
    await new Promise(r => setTimeout(r, 3000));
  }

  poll();
}

// ── Start ──
console.log("");
console.log("  AIOS Telegram Bot");
console.log("  ─────────────────────────────────");
console.log(`  Bot:  @adletic_bot`);
console.log(`  CWD:  ${CWD}`);
console.log(`  Chat: ${ALLOWED_CHAT_ID}`);
console.log("");
console.log("  Listening for messages...");
console.log("");

poll();
