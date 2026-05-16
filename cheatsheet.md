# AIOS Terminal Cheatsheet

## Modals (Cmd-chord)

| Chord | Modal | What |
|---|---|---|
| ⌘E | Explorer | Yazi file tree + preview. `Enter` opens micro. `a` asks Claude. `g` greps. |
| ⌘P | Palette | Fuzzy launcher: sessions, recent files, common commands. |
| ⌘J | Just-ask | Quick claude question popup. |
| ⌘I | Inbox | Unread inter-session messages. `d` marks all read. |
| ⌘O | Outbox | Append-only scratchpad — pipes to `~/.aios/notes.md`. |
| ⌘/ | Cheatsheet | This file. |

## Shell

- `edit <file>` → micro popup
- `aios` → boot AIOS workspace
- `adletic list/send/broadcast/inbox/switch/new`

## Tmux (prefix Ctrl-A)

- `⌘T` new window · `⌘[/]` prev/next · `⌘1–9` jump
- `⌘D` split vertical · `⌘⇧D` split horizontal · `⌘W` close pane
- `⌘R` rename window · `⌘⇧R` rename session

## Split panes (see multiple Claude sessions at once)

| Keybinding | What it does |
|---|---|
| `prefix \|` | Split current pane horizontally (side-by-side) |
| `prefix -` | Split current pane vertically (top + bottom) |
| `prefix h/j/k/l` | Navigate left/down/up/right between panes |
| `prefix H/J/K/L` | Resize current pane (hold prefix, tap multiple times) |
| `prefix z` | Zoom current pane to fullscreen / toggle back |
| `prefix g` | **Grid view** — collect all running Claude sessions into one tiled window |
| `prefix S` | Sync input across all panes in window (toggle) |
