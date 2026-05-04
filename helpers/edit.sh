#!/bin/zsh
# helpers/edit.sh — `edit <file>` opens micro in a fullscreen tmux popup.
# Sourced into shell as a function so it works inside the current tmux pane.

edit() {
  if [[ -z "$1" ]]; then
    echo "usage: edit <file>" >&2; return 1
  fi
  local target; target="$(realpath -q "$1" 2>/dev/null || echo "$1")"
  if [[ -n "$TMUX" ]]; then
    tmux display-popup -E -w 95% -h 95% "micro '$target'"
  else
    micro "$target"
  fi
}
