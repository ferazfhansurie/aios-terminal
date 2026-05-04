#!/bin/zsh
# modals/switch.sh — workspace switcher popup (⌘⇧S).
# Same picker UX as welcome.sh, but switches the active tmux client instead
# of exec'ing into a new session. Bindings:
#   enter   → switch-client to selected workspace
#   ctrl-n  → create new workspace and switch to it
#   ctrl-d  → remove selected workspace (confirm prompt)
#   esc     → dismiss popup, return to caller

emulate -L zsh -o NO_NOMATCH

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ORANGE_MID=$'\e[38;2;242;101;34m'
DIM=$'\e[38;2;160;160;160m'
WHITE=$'\e[38;2;255;255;255m'
YELLOW_FLASH=$'\e[38;2;251;191;36m'
RESET=$'\e[0m'

AIOS_BIN="$HOME/.local/bin/adletic"
SOCKET="adletic"

print "  ${WHITE}Switch workspace${RESET}"
print

build_lines() {
  local maxw=8
  if [[ -d "$HOME/.aios/sessions" ]]; then
    for d in "$HOME"/.aios/sessions/*(/N); do
      local nm="${d:t}"
      (( ${#nm} > maxw )) && maxw=${#nm}
    done
  fi
  local colw=$((maxw + 2))

  printf '%s+ new workspace%s\n' "${ORANGE_MID}" "${RESET}"

  if [[ -d "$HOME/.aios/sessions" ]]; then
    for d in "$HOME"/.aios/sessions/*(/N); do
      local nm="${d:t}"
      local busy=0
      if tmux -L "$SOCKET" has-session -t "$nm" 2>/dev/null; then
        if tmux -L "$SOCKET" list-panes -s -t "$nm" -F '#{pane_current_command}' 2>/dev/null \
             | grep -q '^claude'; then
          busy=1
        fi
      fi
      local unread=0 total=0 rc=0
      local inbox="$HOME/.aios/sessions/${nm}/inbox.jsonl"
      local read_marker="$HOME/.aios/sessions/${nm}/inbox.read"
      if [[ -f "$inbox" ]]; then
        total=$(wc -l < "$inbox" 2>/dev/null || print 0)
        [[ -f "$read_marker" ]] && rc=$(<"$read_marker")
        unread=$(( total - rc ))
      fi

      local dot_color="${DIM}" name_color="${DIM}" sep_color="${DIM}"
      local state_text="idle"
      if (( busy == 1 )); then
        dot_color="${ORANGE_MID}"
        name_color="${WHITE}"
        sep_color="${WHITE}"
        state_text="busy with claude"
      fi

      local padded_name=$(printf '%-*s' "$colw" "$nm")
      local row="${dot_color}●${RESET} ${name_color}${padded_name}${RESET}${sep_color}· ${state_text}${RESET}"
      if (( unread > 0 )); then
        row="${row} ${DIM}·${RESET} ${YELLOW_FLASH}${unread} messages${RESET}"
      fi
      print -- "$row"
    done
  fi
}

picker_choice=$(build_lines | fzf --ansi \
  --height=90% --reverse --no-info --prompt="❯ " \
  --pointer="❯" --color="pointer:#f26522,prompt:#f26522,fg+:#ffffff,bg+:#0d1117" \
  --header=$'\n↑↓ navigate   enter switch   ctrl-n new   ctrl-d remove   esc cancel\n' \
  --header-first \
  --expect=ctrl-n,ctrl-d,esc \
  --bind="esc:abort")

[[ -z "$picker_choice" ]] && exit 0

key="${picker_choice%%$'\n'*}"
selection="${picker_choice##*$'\n'}"
selection_plain=$(print -- "$selection" | sed -E $'s/\x1b\\[[0-9;]*[a-zA-Z]//g')

selection_name=""
if [[ "$selection_plain" != *"new workspace"* ]]; then
  typeset -a _fields
  _fields=(${=selection_plain})
  selection_name="${_fields[2]}"
fi

case "$key" in
  ctrl-n)
    print -n "  new workspace name: "
    read -r new_name
    [[ -z "$new_name" ]] && exit 0
    # Create the session detached if missing, then switch the calling client to it.
    if ! tmux -L "$SOCKET" has-session -t "$new_name" 2>/dev/null; then
      tmux -L "$SOCKET" new-session -d -s "$new_name" -c "$HOME"
      mkdir -p "$HOME/.aios/sessions/$new_name"
    fi
    tmux -L "$SOCKET" switch-client -t "$new_name"
    ;;
  ctrl-d)
    [[ "$selection_plain" == *"new workspace"* ]] && exec "$0"
    print -n "  remove workspace ${selection_name}? [y/N]: "
    read -r confirm
    if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
      tmux -L "$SOCKET" kill-session -t "$selection_name" 2>/dev/null
      rm -rf "$HOME/.aios/sessions/$selection_name" 2>/dev/null
    fi
    exec "$0"   # restart picker
    ;;
  *)
    if [[ "$selection_plain" == *"new workspace"* ]]; then
      print -n "  new workspace name: "
      read -r new_name
      [[ -z "$new_name" ]] && exit 0
      if ! tmux -L "$SOCKET" has-session -t "$new_name" 2>/dev/null; then
        tmux -L "$SOCKET" new-session -d -s "$new_name" -c "$HOME"
        mkdir -p "$HOME/.aios/sessions/$new_name"
      fi
      tmux -L "$SOCKET" switch-client -t "$new_name"
    else
      tmux -L "$SOCKET" switch-client -t "$selection_name"
    fi
    ;;
esac
