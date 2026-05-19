#!/usr/bin/env bash
# Dispatch tmux status-left click.
#   user|sessions  → session picker (legacy: also sess|<name> for tabs)
#   user|drop      → drop-doc file picker
#   sess|<name>    → switch session
#   *              → session picker fallback
set -euo pipefail
RANGE="${1:-}"
mkdir -p "$HOME/.aios/state"
{ printf '[%s] range=%q\n' "$(date '+%H:%M:%S')" "$RANGE"; } \
  >> "$HOME/.aios/state/status-click.log" 2>/dev/null || true

case "$RANGE" in
  user\|sessions|sessions)
    tmux display-popup -E -w 80% -h 60% "$HOME/.config/adletic/helpers/session-picker.sh" \
      >> "$HOME/.aios/state/status-click.log" 2>&1 || \
      printf '[%s] sessions popup FAILED exit=%s\n' "$(date '+%H:%M:%S')" "$?" \
        >> "$HOME/.aios/state/status-click.log"
    ;;
  user\|drop|drop)
    exec "$HOME/.config/adletic/helpers/drop-doc.sh"
    ;;
  user\|open|open)
    exec "$HOME/.config/adletic/helpers/open-doc.sh"
    ;;
  user\|snap|snap)
    exec "$HOME/.config/adletic/helpers/snap.sh"
    ;;
  user\|voice|voice)
    exec "$HOME/.config/adletic/helpers/stt-toggle.sh"
    ;;
  user\|inbox|inbox)
    exec tmux display-popup -E -w 80% -h 70% "$HOME/.config/adletic/modals/inbox.sh"
    ;;
  user\|link|link)
    exec tmux display-popup -E -w 80% -h 70% \
      -e "TMUX_CALLER_PANE=$(tmux display-message -p '#{pane_id}')" \
      "$HOME/.config/adletic/link-picker.sh"
    ;;
  user\|palette|palette)
    exec tmux display-popup -E -w 60% -h 50% "$HOME/.config/adletic/modals/palette.sh"
    ;;
  user\|browser|browser)
    exec tmux display-popup -E -w 70% -h 60% "$HOME/.config/adletic/helpers/browser-bookmarks.sh"
    ;;
  user\|convos|convos)
    exec tmux display-popup -E -w 80% -h 70% "$HOME/.config/adletic/helpers/convos-picker.sh"
    ;;
  user\|peers|peers)
    exec tmux display-popup -E -w 80% -h 60% "$HOME/.config/adletic/helpers/session-picker.sh"
    ;;
  user\|hud|hud)
    exec "$HOME/Repo/firaz/terminal/scripts/aios-hud-toggle.sh"
    ;;
  sess\|*)
    NAME="${RANGE#sess|}"
    exec tmux -L adletic switch-client -t "$NAME"
    ;;
  *)
    exec tmux display-popup -E -w 80% -h 60% "$HOME/.config/adletic/helpers/session-picker.sh"
    ;;
esac
