#!/bin/zsh
# modals/inbox.sh — list unread inbox entries across all AIOS sessions.

set -eu

SESSIONS_DIR="$HOME/.aios/sessions"
ORANGE=$'\e[38;2;242;101;34m'
DIM=$'\e[38;2;160;160;160m'
RESET=$'\e[0m'

print "${ORANGE}AIOS Inbox${RESET}"
print

found=0
for d in "$SESSIONS_DIR"/*(N/); do
  name="${d:t}"
  inbox="$d/inbox.jsonl"
  [[ -f "$inbox" ]] || continue
  read_count=0
  [[ -f "$d/inbox.read" ]] && read_count=$(<"$d/inbox.read")
  total=$(wc -l < "$inbox" 2>/dev/null || print 0)
  unread=$(( total - read_count ))
  (( unread <= 0 )) && continue
  found=$(( found + 1 ))
  print "${ORANGE}${name}${RESET}  (${unread} unread)"
  tail -n "$unread" "$inbox" | while IFS= read -r line; do
    body=$(print -- "$line" | python3 -c 'import sys,json;print(json.loads(sys.stdin.read()).get("body","[no body]"))' 2>/dev/null || print -- "$line")
    print "  ${DIM}·${RESET} $body"
  done
  print
done

if (( found == 0 )); then
  print "${DIM}(empty)${RESET}"
fi

print "${DIM}press d to mark all read, q to dismiss${RESET}"
read -k1 -s key
if [[ "$key" == "d" ]]; then
  for d in "$SESSIONS_DIR"/*(N/); do
    inbox="$d/inbox.jsonl"
    [[ -f "$inbox" ]] || continue
    wc -l < "$inbox" >| "$d/inbox.read"
  done
fi
