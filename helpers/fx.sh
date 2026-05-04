#!/bin/zsh
# helpers/fx.sh — fetch USD→MYR rate from Frankfurter, cache daily.
# Output: a single number (e.g. "4.7350") to stdout.

set -eu

CACHE_DIR="${HOME}/.cache/adletic"
CACHE_FILE="${CACHE_DIR}/fx.json"
mkdir -p "$CACHE_DIR"

# Use cache if fresh (< 24h)
if [[ -f "$CACHE_FILE" ]]; then
  age=$(( $(date +%s) - $(stat -f %m "$CACHE_FILE") ))
  if (( age < 86400 )); then
    rate=$(grep -oE '"MYR"[[:space:]]*:[[:space:]]*[0-9]+(\.[0-9]+)?' "$CACHE_FILE" \
            | grep -oE '[0-9]+(\.[0-9]+)?' | tail -1)
    [[ -n "$rate" ]] && { print -- "$rate"; exit 0; }
  fi
fi

# Fetch (follow redirects — frankfurter.app 301s to frankfurter.dev)
if curl -sSfL --max-time 5 "https://api.frankfurter.app/latest?from=USD&to=MYR" \
   -o "$CACHE_FILE.tmp"; then
  mv "$CACHE_FILE.tmp" "$CACHE_FILE"
  rate=$(grep -oE '"MYR"[[:space:]]*:[[:space:]]*[0-9]+(\.[0-9]+)?' "$CACHE_FILE" \
          | grep -oE '[0-9]+(\.[0-9]+)?' | tail -1)
  [[ -n "$rate" ]] && { print -- "$rate"; exit 0; }
fi

# Fallback to config default
default=$(awk -F'=' '/default_usd_to_myr/{
  v=$2; sub(/#.*/, "", v); gsub(/[ \t]/, "", v); print v; exit
}' "$HOME/.config/adletic/config.toml")
print -- "${default:-4.70}"
