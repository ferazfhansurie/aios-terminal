#!/usr/bin/env bash
# claude-usage.sh — print the cached usage fragment instantly, refresh in bg.
# Called from tmux status-right. Reads ~/.cache/adletic/claude-usage.txt.

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CACHE_DIR="$HOME/.cache/adletic"
OUT="$CACHE_DIR/claude-usage.txt"
LOCK="$CACHE_DIR/claude-usage.lock"
TTL=60   # seconds

mkdir -p "$CACHE_DIR"

# Always emit whatever's currently cached (instant return).
if [[ -f "$OUT" ]]; then
  cat "$OUT"
fi

# Decide whether to fire a background refresh.
needs=1
if [[ -f "$OUT" ]]; then
  age=$(( $(date +%s) - $(stat -f %m "$OUT") ))
  (( age < TTL )) && needs=0
fi
if [[ -f "$LOCK" ]]; then
  lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK") ))
  (( lock_age < 30 )) && needs=0
fi

if (( needs )); then
  (
    touch "$LOCK"
    python3 "$HOME/.config/adletic/helpers/claude-usage-fetch.py" \
      >/dev/null 2>>"$CACHE_DIR/claude-usage.err"
    rm -f "$LOCK"
  ) >/dev/null 2>&1 &
  disown 2>/dev/null || true
fi
