#!/usr/bin/env bash
# quick-launcher.sh — fzf launcher over bookmarked actions for things hard
# to do in terminal: open URLs, tail logs, restart services, etc.
# Bookmarks live in ~/.config/adletic/quick-launcher.conf — edit freely,
# picker re-reads on every invocation.
# Triggered by clicking the right side of the tmux status bar, or `prefix L`.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CONF="$HOME/.config/adletic/quick-launcher.conf"
SOCKET="adletic"

if [[ ! -f "$CONF" ]]; then
  tmux -L "$SOCKET" display-message "no quick-launcher.conf — see ~/.config/adletic/quick-launcher.conf.example"
  exit 0
fi

# Parse: each non-comment line is "label | command". Tab-delimit for fzf.
# Hidden column 2 = command; visible column 1 = label.
ROWS=$(awk -F'\\|' '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  NF < 2 { next }
  {
    label = $1
    # rebuild command from $2..$NF in case it contains | chars
    cmd = $2
    for (i = 3; i <= NF; i++) cmd = cmd "|" $i
    sub(/[[:space:]]+$/, "", label)
    sub(/^[[:space:]]+/, "", cmd)
    sub(/[[:space:]]+$/, "", cmd)
    print label "\t" cmd
  }
' "$CONF")

if [[ -z "$ROWS" ]]; then
  tmux -L "$SOCKET" display-message "no bookmarks defined"
  exit 0
fi

PICK_CMD=$(printf '%s\n' "$ROWS" \
  | fzf --prompt 'launch> ' \
        --header "enter=run · esc=cancel · edit ~/.config/adletic/quick-launcher.conf to add" \
        --no-mouse --reverse \
        --delimiter=$'\t' --with-nth=1 --accept-nth=2) || exit 0

[[ -z "$PICK_CMD" ]] && exit 0

# Run the command. We don't capture output — if the user wants to see logs,
# the bookmark itself should use `tmux split-window`.
# Run in a subshell so $PWD inheritance works.
( eval "$PICK_CMD" ) 2>&1 | head -20 | (cat >/dev/null) || true
exit 0
