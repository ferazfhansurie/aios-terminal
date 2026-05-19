#!/usr/bin/env bash
# inbox-count.sh — total unread inbox entries across all AIOS sessions.
# Outputs a tmux-format-ready fragment:
#   non-zero count → "(3)" with a highlighted style
#   zero          → "" (the inbox pill stays dim)
# Cached for 5s — cheap enough for status-interval=2.

set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CACHE="$HOME/.cache/adletic/inbox-count.txt"
mkdir -p "${CACHE%/*}"

if [[ -f "$CACHE" ]] && (( $(date +%s) - $(stat -f %m "$CACHE") < 5 )); then
  cat "$CACHE"; exit 0
fi

SESSIONS_DIR="$HOME/.aios/sessions"
total_unread=0
if [[ -d "$SESSIONS_DIR" ]]; then
  for d in "$SESSIONS_DIR"/*/; do
    inbox="$d/inbox.jsonl"
    [[ -f "$inbox" ]] || continue
    read_count=0
    [[ -f "$d/inbox.read" ]] && read_count=$(<"$d/inbox.read" 2>/dev/null) || true
    total=$(wc -l < "$inbox" 2>/dev/null || echo 0)
    unread=$(( total - read_count ))
    (( unread > 0 )) && total_unread=$(( total_unread + unread ))
  done
fi

if (( total_unread > 0 )); then
  out=" (${total_unread})"
else
  out=""
fi

printf '%s' "$out" >| "$CACHE"
printf '%s' "$out"
