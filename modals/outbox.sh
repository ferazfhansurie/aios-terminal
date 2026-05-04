#!/bin/zsh
# modals/outbox.sh — single-shot scratchpad. Anything typed gets timestamped
# and appended to ~/.aios/notes.md.
#
# Dismiss: empty enter, or ctrl-c.

set -u
trap 'exit 0' INT TERM

NOTES="$HOME/.aios/notes.md"
mkdir -p "$(dirname "$NOTES")"

DIM=$'\e[38;2;160;160;160m'
RESET=$'\e[0m'

print "${DIM}enter to save · empty enter or ctrl-c to cancel${RESET}"
print -n "note > "

if ! read -r body; then
  exit 0
fi
[[ -z "$body" ]] && exit 0

ts=$(date '+%Y-%m-%d %H:%M')
print -- "- [$ts] $body" >> "$NOTES"
print "${DIM}saved.${RESET}"
sleep 0.4
