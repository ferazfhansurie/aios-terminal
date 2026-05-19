#!/bin/zsh
# inbox-inject.sh — Claude Code UserPromptSubmit hook.
# Reads unread Adletic inbox messages for the current session and prints them
# to stdout so Claude Code injects them as additional context for the turn.

set -eu

SESSIONS_DIR="$HOME/.aios/sessions"

# Resolve current session name. tmux is authoritative — same logic as
# adletic's current_session().
if [[ -n "${TMUX:-}" ]]; then
  me=$(tmux display-message -p '#S' 2>/dev/null || true)
elif [[ -n "${AIOS_SESSION_NAME:-}" ]]; then
  me="$AIOS_SESSION_NAME"
else
  exit 0
fi

[[ -z "$me" ]] && exit 0

inbox="$SESSIONS_DIR/$me/inbox.jsonl"
marker="$SESSIONS_DIR/$me/inbox.read"

[[ -s "$inbox" ]] || exit 0

prev=0
[[ -f "$marker" ]] && prev=$(<"$marker")
now=$(stat -f %z "$inbox" 2>/dev/null || echo 0)

(( now <= prev )) && exit 0

# Read the unread tail and parse each JSON line.
unread=$(tail -c "+$((prev+1))" "$inbox" 2>/dev/null || true)
print -- "$now" > "$marker"

[[ -z "$unread" ]] && exit 0

print -- "$unread" | python3 -c '
import json, sys
lines = []
for raw in sys.stdin:
    raw = raw.strip()
    if not raw:
        continue
    try:
        m = json.loads(raw)
        at = m.get("at", "?")
        sender = m.get("from", "?")
        body = m.get("body", "")
        lines.append("- [" + at + "] from " + sender + ": " + body)
    except Exception:
        continue
if lines:
    print("## Adletic inbox — new messages")
    print("\n".join(lines))
'
