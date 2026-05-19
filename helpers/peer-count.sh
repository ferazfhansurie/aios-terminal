#!/usr/bin/env bash
# peer-count.sh — number of live AIOS peer sessions excluding the current one.
# A peer is "live" if its JSON in ~/.aios/state/peers/ was touched within the
# last 5 minutes. Output is a tmux-format fragment ("2 peers" or "") with a
# pre-baked color, ready to slot into status-right.
# 5s cache.

set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CACHE="$HOME/.cache/adletic/peer-count.txt"
mkdir -p "${CACHE%/*}"

if [[ -f "$CACHE" ]] && (( $(date +%s) - $(stat -f %m "$CACHE") < 5 )); then
  cat "$CACHE"; exit 0
fi

PEERS_DIR="$HOME/.aios/state/peers"
out=""

if [[ -d "$PEERS_DIR" ]]; then
  now=$(date +%s)
  count=0
  for f in "$PEERS_DIR"/*.json; do
    [[ -f "$f" ]] || continue
    mtime=$(stat -f %m "$f" 2>/dev/null || echo 0)
    age=$(( now - mtime ))
    (( age < 300 )) && count=$(( count + 1 ))
  done
  # subtract self if my pid is in there (best-effort, optional)
  if (( count > 1 )); then
    out=" #[fg=#a0a0a0]${count} peers"
  elif (( count == 1 )); then
    out=" #[fg=#666666]solo"
  fi
fi

printf '%s' "$out" >| "$CACHE"
printf '%s' "$out"
