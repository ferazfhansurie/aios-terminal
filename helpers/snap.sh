#!/usr/bin/env bash
# snap.sh — one-click region screenshot → `@/abs/path.png` into active tmux pane.
# Uses macOS native screencapture interactive mode. If you cancel the
# selection (ESC), no file is written and nothing gets typed.
# Triggered by clicking the [📸 snap] status-bar pill.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CAPTURE_DIR="$HOME/Pictures/aios-snaps"
mkdir -p "$CAPTURE_DIR"

TS=$(date +%Y%m%d-%H%M%S)
OUT="$CAPTURE_DIR/snap-$TS.png"

# -i interactive (drag a region), -t png, -x silent (no shutter sound).
# screencapture writes only if a region was selected; on ESC the file is
# never created.
/usr/sbin/screencapture -i -t png -x "$OUT" 2>/dev/null

if [[ ! -s "$OUT" ]]; then
  /opt/homebrew/bin/tmux -L adletic display-message "📸 cancelled" 2>/dev/null || true
  exit 0
fi

# Also copy the path to clipboard as a safety net.
printf '@%s ' "$OUT" | /usr/bin/pbcopy 2>/dev/null || true

# Send into the currently active pane.
PANE=$(/opt/homebrew/bin/tmux -L adletic display-message -p '#{pane_id}' 2>/dev/null || echo '')
if [[ -n "$PANE" ]]; then
  /opt/homebrew/bin/tmux -L adletic send-keys -t "$PANE" -l -- "@$OUT "
fi
/opt/homebrew/bin/tmux -L adletic display-message "📸 ${OUT##*/}" 2>/dev/null || true
