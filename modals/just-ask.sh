#!/bin/zsh
# modals/just-ask.sh — quick claude question popup.
# Argv: optional initial prompt.

set -eu

INITIAL="${1:-}"

if [[ -n "$INITIAL" ]]; then
  print -- "$INITIAL" | claude -p
else
  print -n "ask claude > "
  read -r prompt
  [[ -z "$prompt" ]] && exit 0
  print -- "$prompt" | claude -p
fi

print
print "press any key to dismiss"
read -k1 -s
