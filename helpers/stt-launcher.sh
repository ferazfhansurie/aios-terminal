#!/usr/bin/env bash
# stt-launcher.sh — capture the active pane id, then open the STT popup.
# Bound to ⌥⌘V in alacritty.toml and to the [ voice ] status-bar pill.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CALLER=$(/opt/homebrew/bin/tmux -L adletic display-message -p '#{pane_id}' 2>/dev/null || echo '')

exec /opt/homebrew/bin/tmux -L adletic display-popup -E -w 60% -h 30% \
  -e "TMUX_CALLER_PANE=$CALLER" \
  "$HOME/.config/adletic/helpers/stt.sh"
