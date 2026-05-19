#!/usr/bin/env bash
# Drop-Doc — opens a native macOS file picker and types the picked path
# into the currently-active tmux pane as `@/abs/path` so Claude Code reads
# it as an attachment.
#
# Triggered by clicking the [📎 Drop Doc] button in the tmux status bar.
set -euo pipefail

# osascript returns a POSIX path or empty on cancel.
PICKED=$(/usr/bin/osascript <<'OSA' 2>/dev/null || true
try
  set theFile to choose file with prompt "Drop a file for Claude:" with multiple selections allowed
  set out to ""
  repeat with f in theFile
    set out to out & POSIX path of f & " "
  end repeat
  return out
on error
  return ""
end try
OSA
)

PICKED="${PICKED%% }"   # trim trailing space
if [[ -z "$PICKED" ]]; then
  exit 0
fi

# Convert space-separated paths to @-prefixed tokens.
TOKENS=""
for p in $PICKED; do
  TOKENS+="@${p} "
done

# Send to active pane.
tmux send-keys -t "${TMUX_PANE:-}" "$TOKENS"
