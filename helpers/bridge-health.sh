#!/usr/bin/env bash
# bridge-health.sh — single-glyph status LED for the WhatsApp bridge.
#   🟢 listener + worker + at least one oracle alive
#   🟡 listener + worker up, no oracle yet (idle, fine)
#   🔴 listener or worker down
#   ⚪ tunnel down (can't reach Meta either way)
# Called from tmux status-right with a tight 10s refresh window.

set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
CACHE="$HOME/.cache/adletic/bridge-health.txt"
mkdir -p "${CACHE%/*}"

# 5s TTL — fast enough to feel live, cheap on tmux's status-interval.
if [[ -f "$CACHE" ]] && (( $(date +%s) - $(stat -f %m "$CACHE") < 5 )); then
  cat "$CACHE"; exit 0
fi

listener_up=$(launchctl list 2>/dev/null | awk '/com.firaz.aios-bridge-bsg/{print $1}')
worker_up=$(launchctl list 2>/dev/null | awk '/com.firaz.aios-inbox-worker/{print $1}')
tunnel_up=$(launchctl list 2>/dev/null | awk '/com.firaz.aios-tunnel/{print $1}')
oracle_count=$(pgrep -f 'claude.*--input-format' 2>/dev/null | wc -l | tr -d ' ')

led='🔴'
if [[ -z "$tunnel_up" || "$tunnel_up" == "-" ]]; then
  led='⚪'
elif [[ -z "$listener_up" || -z "$worker_up" || "$listener_up" == "-" || "$worker_up" == "-" ]]; then
  led='🔴'
elif [[ "${oracle_count:-0}" -ge 1 ]]; then
  led='🟢'
else
  led='🟡'
fi

printf '%s' "$led" >| "$CACHE"
printf '%s' "$led"
