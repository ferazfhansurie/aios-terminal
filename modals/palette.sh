#!/bin/zsh
# modals/palette.sh — fzf launcher over sessions, recent files, commands.

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

SESSIONS_DIR="$HOME/.aios/sessions"

build_items() {
  for d in "$SESSIONS_DIR"/*(N/); do
    name="${d:t}"
    print -- "🪟 session: $name\tswitch:$name"
  done

  if command -v fd >/dev/null 2>&1; then
    fd -t f -E '*.lock' -E 'node_modules' . "$PWD" 2>/dev/null | head -20 | \
      while read -r f; do print -- "📄 file: $f\tedit:$f"; done
  fi

  for cmd in /morning /sprint /repos /standup /deploy /review /ticket /ops; do
    print -- "⚡ command: $cmd\tcmd:$cmd"
  done
}

selection=$(build_items | fzf --delimiter=$'\t' --with-nth=1 --prompt='⌘P > ')
[[ -z "$selection" ]] && exit 0

action="${selection##*$'\t'}"
case "$action" in
  switch:*) adletic switch "${action#switch:}" ;;
  edit:*)   tmux display-popup -E -w 95% -h 95% "micro '${action#edit:}'" ;;
  cmd:*)
    tmux send-keys -t "$(tmux display-message -p '#{pane_id}')" "${action#cmd:}" Enter
    ;;
esac
