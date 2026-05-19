#!/usr/bin/env bash
# bridge-activity.sh — compact live indicator for WhatsApp bridge state.
# Goes in the MIDDLE of the status bar.
#
# Renders ONE of (priority order):
#   1. 📨 N waiting     — inbox queue depth > 0 (something's pending)
#   2. 🤔 thinking ⋯Ns  — oracle is in-flight on a user message
#   3. ◀ last: "<60 chars>"  — most recent outbound reply, when idle
#
# Cached at 2s TTL so we don't thrash on every status-interval tick.

set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CACHE="$HOME/.cache/adletic/bridge-activity.txt"
mkdir -p "${CACHE%/*}"

if [[ -f "$CACHE" ]] && (( $(date +%s) - $(stat -f %m "$CACHE") < 2 )); then
  cat "$CACHE"; exit 0
fi

INBOX_DIR="$HOME/.aios/messages/inbox"
ORACLE_LOG_DIR="$HOME/.aios/messages/oracle-logs"
OUTBOUND_LOG="$HOME/.aios/state/outbound-log.jsonl"

# 1) inbox depth — fail-safe count (avoids `0\n0` from grep -c || echo 0)
depth=0
if [[ -d "$INBOX_DIR" ]]; then
  shopt -s nullglob
  files=("$INBOX_DIR"/*.json)
  depth=${#files[@]}
  shopt -u nullglob
fi

# 2) oracle in-flight? — most recent line in oracle log is "▶ user" but no "✓ done" yet
in_flight=0
if [[ -d "$ORACLE_LOG_DIR" ]]; then
  for f in "$ORACLE_LOG_DIR"/*.log; do
    [[ -e "$f" ]] || continue
    # Use awk to find last user vs last done timestamps
    last_evt=$(tail -50 "$f" 2>/dev/null | grep -E '▶ user:|✓ done' | tail -1)
    if [[ "$last_evt" == *"▶ user:"* ]]; then
      in_flight=$((in_flight + 1))
    fi
  done
fi

# 3) last outbound — last line of outbound-log.jsonl with body
last_reply=""
if [[ -f "$OUTBOUND_LOG" ]]; then
  last_reply=$(tail -50 "$OUTBOUND_LOG" 2>/dev/null \
    | python3 -c "
import sys, json
last = ''
for line in sys.stdin:
    try:
        d = json.loads(line)
        body = (d.get('text') or d.get('body') or '').strip()
        if body and not body.startswith('🔧'):
            last = body.replace('\n', ' ')
    except: pass
print(last[:55])
" 2>/dev/null || echo "")
fi

# Compose output. Use #[fg=...] inline so tmux styles correctly.
if (( depth > 0 )); then
  out="#[fg=#fbbf24,bold]📨 ${depth} waiting"
elif (( in_flight > 0 )); then
  out="#[fg=#22c55e]🤔 thinking…"
elif [[ -n "$last_reply" ]]; then
  out="#[fg=#888888]◀ ${last_reply}"
else
  out="#[fg=#444444]· idle ·"
fi

printf '%s' "$out" >| "$CACHE"
printf '%s' "$out"
