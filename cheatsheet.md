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
