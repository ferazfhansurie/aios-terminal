#!/bin/zsh
# modals/outbox.sh — single-shot scratchpad. Anything typed gets timestamped
# and appended to ~/.aios/notes.md.

set -eu

NOTES="$HOME/.aios/notes.md"
mkdir -p "$(dirname "$NOTES")"

print -n "note > "
read -r body
[[ -z "$body" ]] && exit 0

ts=$(date '+%Y-%m-%d %H:%M')
print -- "- [$ts] $body" >> "$NOTES"
print "saved."
sleep 0.5
