#!/bin/zsh
# Render cheatsheet inside the tmux popup. -p keeps glow in pager mode so the
# popup stays open until the user dismisses it (q / esc); without -p glow
# prints + exits and the popup vanishes the instant ⌘/ fires.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec glow -p ~/.config/adletic/cheatsheet.md
