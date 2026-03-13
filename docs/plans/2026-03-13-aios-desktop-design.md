# AIOS Desktop — Product Design

**Date:** 2026-03-13
**Status:** Approved

## What

A branded Electron desktop app that gives users an AI that can control their computer. ChatGPT-style chat interface + AI-generated dashboards. White-label for Pro clients. Freemium with credit-based usage limits.

## Why

- Adletic's core product — "AI that controls your computer"
- Subscription revenue model (RM2-8K/mo for Pro)
- Free tier spreads adoption, credit wall drives upgrades
- Replaces the current terminal-first aios-terminal with a product-grade app

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron App                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  Renderer (React 19 + Tailwind v4)          │    │
│  │                                              │    │
│  │  ┌──────────┐  ┌──────────────────────────┐ │    │
│  │  │ Sidebar   │  │ Main Area               │ │    │
│  │  │           │  │                          │ │    │
│  │  │ • Chat    │  │  Chat View               │ │    │
│  │  │ • Dash    │  │  - or -                  │ │    │
│  │  │ • Settings│  │  Dashboard View          │ │    │
│  │  │           │  │  - or -                  │ │    │
│  │  │ History   │  │  Settings View           │ │    │
│  │  └──────────┘  └──────────────────────────┘ │    │
│  └─────────────────────────────────────────────┘    │
│                        │                             │
│                   IPC Bridge                         │
│                        │                             │
│  ┌─────────────────────────────────────────────┐    │
│  │  Main Process (Node.js)                      │    │
│  │                                              │    │
│  │  • Claude Code SDK (query + streaming)       │    │
│  │  • MCP server management                     │    │
│  │  • File system access                        │    │
│  │  • Shell command execution                   │    │
│  │  • Credit tracking                           │    │
│  │  • Keychain (API key storage)                │    │
│  │  • Auto-updater                              │    │
│  │  • Permission system                         │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Screens

### 1. Onboarding / Login

First launch:
- **Free:** "Enter your Anthropic API key" → validate → chat
- **Pro:** "Login with Adletic account" → fetch config (branding, MCP servers, workspace) → chat

### 2. Chat View (main screen)

- Clean ChatGPT-style — dark bg (#0a0a0c), message bubbles, input at bottom
- AI messages render markdown (code blocks, tables, lists)
- Thinking indicator (collapsible)
- Tool usage shown as subtle cards (file read, bash command, etc.)
- Credit meter in status bar: "7,241 / 10,000 credits"
- Conversation history in sidebar
- New chat button

### 3. Dashboard View

- The AI generates the dashboard by writing React components
- Files live in `dashboard/` inside the client's workspace
- Hot reload — when AI edits dashboard files, the view updates live
- Client says "show me my leads this week" → AI codes it
- No widget system, no config. The AI IS the builder.

### 4. Settings

- API key management (Free: paste key / Pro: managed)
- Workspace directory (where the AI operates)
- Theme (Pro: client branding, Free: Adletic default)
- Permission history (allowed/denied paths and commands)
- Credit usage history

## Tech Stack

| Layer | Tech |
|-------|------|
| Shell | Electron (latest) |
| Frontend | React 19 + Tailwind v4 + Framer Motion |
| AI Engine | Claude Code SDK (@anthropic-ai/claude-code) |
| State | Zustand |
| Markdown | react-markdown + rehype |
| Code highlight | Shiki |
| Storage | electron-store (config) + Keychain (API keys) + SQLite (history, credits) |
| Updates | electron-updater |
| Backend API | Vercel (client configs, auth, credit sync for Pro) |

## Credit System

**1 credit = 10 tokens.** SDK reports token usage per query, divide by 10.

| Tier | Daily Credits | Equivalent |
|------|--------------|------------|
| Free | 10,000 | ~100K tokens |
| Pro | Unlimited | — |

- Credit meter visible in UI at all times
- Deducted after each query completes (actual usage, not estimated)
- Resets at midnight (local time)
- When credits run out: "You've used your daily credits. Upgrade to Pro for unlimited."
- Stored locally (SQLite) for Free tier
- Synced to server for Pro tier (prevent abuse)

Typical costs:
- Simple chat: ~50-200 credits
- Chat + file read/search: ~200-500 credits
- Code generation: ~500-2,000 credits
- Heavy multi-step task: ~3,000-8,000 credits

## Freemium Model

| | **Free** | **Pro** |
|---|---|---|
| AI Chat | 10K credits/day | Unlimited |
| Local file access | Yes | Yes |
| System commands | Yes | Yes |
| Dashboard | AI-generated | AI-generated |
| Skills | All | All + custom |
| MCP servers | 1 | Unlimited |
| Branding | Adletic | White-label |
| Conversation history | 7 days | Unlimited |
| API key | Their own | Their own or managed |
| Support | Community | Dedicated |

## Permission System

- First time accessing a path: "AIOS wants to access ~/Documents. Allow once / Always / Deny"
- Shell commands: show command before executing, require approval
- Permissions stored per-directory
- Pro clients can pre-configure allowed paths in workspace config
- Dangerous commands (rm -rf, sudo, etc.) always require approval

## Multi-tenancy (Pro)

Single app binary. Client config fetched from Adletic API after login:

```json
{
  "client_id": "wadworks",
  "company_id": "0210",
  "branding": {
    "name": "Wad AI",
    "logo": "https://api.adletic.com/assets/wadworks/logo.png",
    "primaryColor": "#2563eb",
    "darkBg": "#0a0a0c"
  },
  "mcpServers": {},
  "workspace": {
    "claudeMd": "...",
    "skills": [],
    "allowedPaths": ["/Users/*/Documents/wadworks"]
  },
  "credits": {
    "plan": "pro",
    "daily_limit": null
  }
}
```

## MVP Scope (v0.1)

Build in this order:

1. Electron app shell with React frontend
2. Claude Code SDK integration (main process, IPC streaming)
3. Chat view (streaming, markdown rendering, tool cards)
4. Onboarding (API key input for Free tier)
5. Credit system (token tracking, daily limit, meter UI)
6. Conversation history (SQLite)
7. Permission system (file/command approval)
8. Settings page

### v0.2
- Dashboard view (hot-reload workspace dashboard)
- Pro login + client config fetching
- White-label theming
- Auto-updater

### v0.3
- MCP server management UI
- Code signing + notarization (macOS/Windows)
- Pro backend API (auth, configs, credit sync)
- Public release

## Distribution

- macOS: DMG (requires Apple Developer $99/yr for signing)
- Windows: NSIS installer (requires code signing cert)
- Auto-update via electron-updater + GitHub Releases or S3

## Branding (Default Theme)

- Background: #0a0a0c (near black)
- Surface: #141416
- Border: #1f1f23
- Text: #e4e4e7
- Accent: #f97316 (Adletic orange)
- Font: Inter (UI), JetBrains Mono (code)
