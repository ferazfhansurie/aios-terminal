#!/usr/bin/env bash
# speak-popup.sh — tmux popup that prompts for text, then speaks via speak.sh.
# Keys: enter=speak · esc=cancel · ctrl-c=stop in-flight TTS
# Quick pickers via fzf:
#   1) type a message → speak it
#   2) speak clipboard
#   3) speak last claude response (from current pane's scrollback)
#   4) stop in-flight TTS

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

HELPERS="$HOME/.config/adletic/helpers"

ACTION=$(printf '%s\n' \
  "type a message" \
  "speak clipboard" \
  "speak last claude turn (current pane)" \
  "stop speaking" \
  | fzf --prompt 'speak> ' \
        --header 'enter=run · esc=cancel' \
        --no-mouse --reverse) || exit 0

case "$ACTION" in
  "type a message")
    printf 'text (empty cancels): ' >&2
    read -r MSG
    [[ -z "${MSG:-}" ]] && exit 0
    "$HELPERS/speak.sh" "$MSG"
    ;;
  "speak clipboard")
    "$HELPERS/speak.sh"
    ;;
  "speak last claude turn (current pane)")
    # Capture the active pane's scrollback, strip ANSI, find the last block
    # that looks like assistant output (heuristic: trailing chunk after the
    # last `>` prompt or last 60 non-empty lines, whichever is shorter).
    if [[ -z "${TMUX_CALLER_PANE:-}" ]]; then
      CALLER=$(tmux -L adletic display-message -p '#{pane_id}' 2>/dev/null || echo '')
    else
      CALLER="$TMUX_CALLER_PANE"
    fi
    if [[ -z "$CALLER" ]]; then
      tmux display-message "speak: no pane id" 2>/dev/null || true
      exit 1
    fi
    TXT=$(tmux -L adletic capture-pane -t "$CALLER" -p -S -200 \
      | sed $'s/\x1b\\[[0-9;?]*[a-zA-Z]//g' \
      | awk 'NF{print}' \
      | tail -60)
    printf '%s' "$TXT" | "$HELPERS/speak.sh"
    ;;
  "stop speaking")
    "$HELPERS/speak-stop.sh"
    ;;
esac
