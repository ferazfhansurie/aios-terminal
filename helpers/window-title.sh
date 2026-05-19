#!/usr/bin/env bash
# window-title.sh — produce the macOS/Alacritty window title.
# Shows: [CURRENT-SESSION] · other1 · other2 · oracle:firaz | git-branch
# Plain text only (OS title bars don't render styling).
# Called via set-titles-string with the current session passed in $1.

set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SOCKET="adletic"
CURRENT="${1:-}"
CACHE="$HOME/.cache/adletic/window-title.txt"
mkdir -p "${CACHE%/*}"

# 3s TTL — title-bar updates feel snappy without thrashing.
KEY="$CURRENT"
if [[ -f "$CACHE" ]] && (( $(date +%s) - $(stat -f %m "$CACHE") < 3 )); then
  cat "$CACHE"; exit 0
fi

# Phone → short name for oracles.
phone_name() {
  case "$1" in
    601121677522) echo "firaz" ;;
    60102883131)  echo "papa" ;;
    60162089049)  echo "putri" ;;
    *)            echo "$1" ;;
  esac
}

# List sessions, current first, oracle sessions abbreviated.
out=""
sep=""
current_part=""
others=()
while IFS= read -r sess; do
  [[ -z "$sess" ]] && continue
  label="$sess"
  if [[ "$sess" == aios-oracle-* ]]; then
    phone="${sess#aios-oracle-}"
    label="🤖$(phone_name "$phone")"
  fi
  if [[ "$sess" == "$CURRENT" ]]; then
    current_part="[$label]"
  else
    others+=("$label")
  fi
done < <(tmux -L "$SOCKET" list-sessions -F '#{session_name}' 2>/dev/null | sort)

out="$current_part"
for o in "${others[@]}"; do
  out="${out} · ${o}"
done

printf '%s' "$out" >| "$CACHE"
printf '%s' "$out"
