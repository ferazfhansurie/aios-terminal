#!/bin/zsh
# helpers/grid-overview.sh — open a new tmux window containing one pane
# per currently-running tmux session that has a Claude process inside it.
# Lets you see all your Claude work simultaneously.
#
# Caveat (v1): uses `join-pane` which MOVES panes out of their original
# sessions into the grid window. The user is effectively "borrowing"
# panes into the grid view — closing the grid window will close those
# panes too (unless they're moved back). v2 could use `tmux pipe-pane`
# to create read-only mirrors instead.

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

TMUX_SOCKET="adletic"

# List sessions that have a claude process running in at least one pane.
claude_sessions=()
while read -r session; do
  [[ -z "$session" ]] && continue
  if tmux -L "$TMUX_SOCKET" list-panes -s -t "$session" -F '#{pane_current_command}' 2>/dev/null | grep -qE '^claude|^[0-9]+\.[0-9]+'; then
    claude_sessions+=("$session")
  fi
done < <(tmux -L "$TMUX_SOCKET" list-sessions -F '#{session_name}' 2>/dev/null | grep -v '^_grid$')

count=${#claude_sessions[@]}

if (( count == 0 )); then
  tmux -L "$TMUX_SOCKET" display-message "no claude sessions running"
  exit 0
fi

if (( count == 1 )); then
  tmux -L "$TMUX_SOCKET" display-message "only 1 claude session — nothing to grid"
  exit 0
fi

# Create or attach to the _grid window in the current session, fresh panes.
CURRENT_SESSION=$(tmux -L "$TMUX_SOCKET" display-message -p '#S')

# Kill any existing _grid window first to start fresh.
tmux -L "$TMUX_SOCKET" kill-window -t "$CURRENT_SESSION:_grid" 2>/dev/null || true

# Create _grid window with a placeholder shell — we'll join real panes into it.
tmux -L "$TMUX_SOCKET" new-window -t "$CURRENT_SESSION:" -n "_grid" -d "echo 'aios grid — joining panes...'; sleep 1"

# Get the new window's index
WINDOW_TARGET="$CURRENT_SESSION:_grid"

# Join one pane per claude session into the _grid window.
# After all panes are in, run tiled layout.
first=1
for s in "${claude_sessions[@]}"; do
  # Pick the first pane of session :0 (top-left)
  if (( first )); then
    # Swap-pane the existing placeholder with the first claude session's pane
    tmux -L "$TMUX_SOCKET" join-pane -s "$s:0.0" -t "$WINDOW_TARGET" 2>/dev/null || true
    # Now kill the placeholder (it's pane index 0 in _grid)
    tmux -L "$TMUX_SOCKET" kill-pane -t "$WINDOW_TARGET.0" 2>/dev/null || true
    first=0
  else
    tmux -L "$TMUX_SOCKET" join-pane -s "$s:0.0" -t "$WINDOW_TARGET" 2>/dev/null || true
  fi
done

# Apply tiled layout (auto-arrange in a grid)
tmux -L "$TMUX_SOCKET" select-layout -t "$WINDOW_TARGET" tiled 2>/dev/null || true

# Focus the grid window
tmux -L "$TMUX_SOCKET" select-window -t "$WINDOW_TARGET"

tmux -L "$TMUX_SOCKET" display-message "grid: $count claude sessions joined. close window to restore."
