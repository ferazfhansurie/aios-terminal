#!/bin/zsh
# helpers/tracks.sh — print track list with activity indicators.
# Format: each session is "<name>" or "●<name>" or "<name>²" or "●<name>²".
# Output uses tmux color tags (#[fg=...]) — intended for tmux status-format.

set -eu

# Ensure helper sees a usable PATH when tmux strips env.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SESSIONS="$HOME/.aios/sessions"
[[ -d "$SESSIONS" ]] || { print -- ""; exit 0; }

CURRENT="${1:-}"

# tmux-native color tags (NOT raw ANSI — tmux status formats use #[fg=...])
ORANGE_TAG='#[fg=#f26522,bold]'
DIM_TAG='#[fg=#666666]'
RESET_TAG='#[default]'

# tmux uses a custom socket — keep helpers consistent with the rest of adletic.
TMUX_SOCKET="adletic"

parts=()
# zsh glob: */(N) → only existing dirs, null-glob if none
for d in "$SESSIONS"/*(/N); do
  name="${d:t}"

  active=""
  if tmux -L "$TMUX_SOCKET" has-session -t "$name" 2>/dev/null; then
    if tmux -L "$TMUX_SOCKET" list-panes -s -t "$name" \
         -F '#{pane_current_command}' 2>/dev/null \
       | grep -q '^claude'; then
      active="●"
    fi
  fi

  unread=""
  if [[ -f "$d/inbox.jsonl" ]]; then
    total=$(wc -l < "$d/inbox.jsonl" 2>/dev/null || print 0)
    read_count=0
    [[ -f "$d/inbox.read" ]] && read_count=$(<"$d/inbox.read")
    diff=$(( total - read_count ))
    if (( diff >= 1 && diff <= 9 )); then
      sup=("¹" "²" "³" "⁴" "⁵" "⁶" "⁷" "⁸" "⁹")
      unread="${sup[$diff]}"
    elif (( diff > 9 )); then
      unread="ⁿ"
    fi
  fi

  if [[ "$name" == "$CURRENT" ]]; then
    parts+=("${ORANGE_TAG}${active}${name}${unread}${RESET_TAG}")
  else
    parts+=("${DIM_TAG}${active}${name}${unread}${RESET_TAG}")
  fi
done

print -- "${(j: · :)parts}"
