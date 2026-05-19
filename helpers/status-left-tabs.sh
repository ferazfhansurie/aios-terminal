#!/usr/bin/env bash
# status-left-tabs.sh — produce a tmux format string listing all sessions
# as tabs, with the current session highlighted in orange (#f26522) and
# others dim grey. aios-oracle-* sessions get a leading 🤖 glyph.
# Output is consumed by status-left.

set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SOCKET="adletic"
CACHE="$HOME/.cache/adletic/status-tabs.txt"
mkdir -p "${CACHE%/*}"

# Refresh every 2s — same as tmux status-interval.
if [[ -f "$CACHE" ]] && (( $(date +%s) - $(stat -f %m "$CACHE") < 2 )); then
  cat "$CACHE"; exit 0
fi

CURRENT=$(tmux -L "$SOCKET" display-message -p '#{session_name}' 2>/dev/null || echo '')
SESSIONS=$(tmux -L "$SOCKET" list-sessions -F '#{session_name}' 2>/dev/null \
  | awk '{ if ($0 ~ /^aios-oracle-/) print "0\t" $0; else print "1\t" $0 }' \
  | sort \
  | cut -f2)

OUT=""
SEP=""
for sess in $SESSIONS; do
  glyph=""
  [[ "$sess" == aios-oracle-* ]] && glyph="🤖 "
  label="${sess#aios-oracle-}"
  # Wrap each tab in a tmux range so MouseDown1Status can detect which one
  # was clicked (#{mouse_status_range} returns "sess|<name>").
  if [[ "$sess" == "$CURRENT" ]]; then
    OUT="${OUT}${SEP}#[range=user|sess|${sess},fg=#000000,bg=#f26522,bold] ${glyph}${label} #[norange]#[default]"
  else
    OUT="${OUT}${SEP}#[range=user|sess|${sess},fg=#888888] ${glyph}${label} #[norange]#[fg=#444444]"
  fi
  SEP="#[fg=#333333]│"
done

printf '%s' "$OUT" >| "$CACHE"
printf '%s' "$OUT"
