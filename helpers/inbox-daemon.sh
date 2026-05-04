#!/bin/zsh
# helpers/inbox-daemon.sh — fswatch on ~/.aios/sessions/, fire macOS notification
# on each new line in any inbox.jsonl. Single-instance via PID file.

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PID_FILE="$HOME/.cache/adletic/inbox-daemon.pid"
SESSIONS_DIR="$HOME/.aios/sessions"
mkdir -p "$(dirname "$PID_FILE")" "$SESSIONS_DIR"

if [[ -f "$PID_FILE" ]] && kill -0 "$(<"$PID_FILE")" 2>/dev/null; then
  exit 0
fi
print -- "$$" >| "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

typeset -A offsets

emit_for_file() {
  local file="$1"
  [[ "$file" == */inbox.jsonl ]] || return 0
  [[ -f "$file" ]] || return 0
  local prev="${offsets[$file]:-0}"
  local now; now=$(stat -f %z "$file" 2>/dev/null || print 0)
  (( now <= prev )) && { offsets[$file]=$now; return 0; }
  local from_session; from_session=$(basename "$(dirname "$file")")
  tail -c "+$((prev+1))" "$file" 2>/dev/null | while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local body; body=$(print -- "$line" \
      | python3 -c 'import sys,json;print(json.loads(sys.stdin.read()).get("body","[no body]"))' \
      2>/dev/null || print -- "$line")
    terminal-notifier -title "AIOS · ${from_session}" -message "$body" \
      2>/dev/null || true
  done
  offsets[$file]=$now
}

for f in "$SESSIONS_DIR"/*/inbox.jsonl(N); do
  offsets[$f]=$(stat -f %z "$f" 2>/dev/null || print 0)
done

fswatch -r "$SESSIONS_DIR" | while read -r changed; do
  emit_for_file "$changed"
done
