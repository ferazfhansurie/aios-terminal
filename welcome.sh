#!/bin/zsh
# Adletic terminal boot — banner → tmux → plain shell.
# No auto-Claude. Each window is a fresh, independent session.
# To start Claude: type `claude` (or `aios` to jump to AIOS workspace).
#
# Override knobs:
#   ADLETIC_SKIP_BOOT=1   drop into raw zsh (skip banner+tmux)
#   ADLETIC_NO_TMUX=1     skip tmux, raw shell with banner only
#   ADLETIC_AUTO_CLAUDE=1 (opt-in) auto-launch claude after banner
#   AIOS_SESSION_NAME=…   force a session name (else auto-named, never reused)

emulate -L zsh -o NO_NOMATCH

# Pull in PATH from the user's profile.
[[ -r /etc/zprofile ]] && source /etc/zprofile
[[ -r "$HOME/.zprofile" ]] && source "$HOME/.zprofile"
[[ -r "$HOME/.zshenv" ]] && source "$HOME/.zshenv"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"

if [[ "$ADLETIC_SKIP_BOOT" == "1" ]]; then
  exec /bin/zsh -l
fi

AIOS_BIN="$HOME/.local/bin/adletic"
TMUX_CONF="$HOME/.config/adletic/tmux.conf"
AIOS_HOME_DIR="$HOME"

# Brand colors
ORANGE=$'\e[38;2;242;101;34m'
DIM=$'\e[38;2;160;160;160m'
FAINT=$'\e[38;2;102;102;102m'
WHITE=$'\e[38;2;255;255;255m'
RESET=$'\e[0m'
BOLD=$'\e[1m'

# ─── Animation primitives ──────────────────────────────────────
# Skip animations if ADLETIC_NO_ANIM=1 (CI, fast loops).
# Timeless: pure ANSI cursor escapes + sleep, no external deps.

ANIM=1
[[ "$ADLETIC_NO_ANIM" == "1" ]] && ANIM=0

anim_sleep_ms() {
  (( ANIM == 0 )) && return 0
  local ms=$1
  # zsh has builtin sleep with sub-second precision (no external sleep needed)
  sleep "0.$(printf '%03d' "$ms")"
}

anim_println() {
  # Print a line, then sleep N ms. Args: <ms> <text>...
  local ms=$1; shift
  print -- "$@"
  anim_sleep_ms "$ms"
}

anim_typewriter() {
  # Print text char-by-char with N ms between chars.
  local ms=$1; shift
  local text="$*"
  if (( ANIM == 0 )); then
    print -- "$text"
    return
  fi
  local i
  for (( i = 1; i <= ${#text}; i++ )); do
    print -n -- "${text[$i]}"
    anim_sleep_ms "$ms"
  done
  print
}

anim_overwrite_line() {
  # Move cursor up N lines, clear that line, print replacement, move back down.
  # Args: <lines_up> <text>
  local up=$1; shift
  if (( ANIM == 0 )); then
    return 0
  fi
  print -n "\e[${up}A\e[2K\r"
  print -- "$*"
  print -n "\e[$((up - 1))B\r"
}

clear
# Banner — 6 lines, staggered 50ms apart, gradient orange.
ORANGE_DEEP=$'\e[38;2;204;82;28m'
ORANGE_MID=$'\e[38;2;242;101;34m'
ORANGE_HOT=$'\e[38;2;253;132;57m'
YELLOW_FLASH=$'\e[38;2;251;191;36m'

banner_lines=(
  "  ${ORANGE_DEEP}${BOLD}     █████╗ ██████╗ ██╗     ███████╗████████╗██╗ ██████╗${RESET}"
  "  ${ORANGE_DEEP}${BOLD}    ██╔══██╗██╔══██╗██║     ██╔════╝╚══██╔══╝██║██╔════╝${RESET}"
  "  ${ORANGE_MID}${BOLD}    ███████║██║  ██║██║     █████╗     ██║   ██║██║     ${RESET}"
  "  ${ORANGE_MID}${BOLD}    ██╔══██║██║  ██║██║     ██╔══╝     ██║   ██║██║     ${RESET}"
  "  ${ORANGE_HOT}${BOLD}    ██║  ██║██████╔╝███████╗███████╗   ██║   ██║╚██████╗${RESET}"
  "  ${ORANGE_HOT}${BOLD}    ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝   ╚═╝   ╚═╝ ╚═════╝${RESET}"
)
print
for line in "${banner_lines[@]}"; do
  anim_println 50 "$line"
done

# Flash: redraw banner in yellow, hold 60ms, redraw in orange.
if (( ANIM == 1 )); then
  print -n "\e[6A"            # cursor up 6 lines
  for line in "${banner_lines[@]}"; do
    yellow_line="${line//$ORANGE_DEEP/$YELLOW_FLASH}"
    yellow_line="${yellow_line//$ORANGE_MID/$YELLOW_FLASH}"
    yellow_line="${yellow_line//$ORANGE_HOT/$YELLOW_FLASH}"
    print -- "$yellow_line"
  done
  anim_sleep_ms 60
  print -n "\e[6A"
  for line in "${banner_lines[@]}"; do
    print -- "$line"
  done
fi

print
anim_typewriter 8 "  ${WHITE}AI Operating System${RESET}  ${DIM}·  type ${RESET}${ORANGE_MID}aios${RESET}${DIM} to start Claude in workspace${RESET}"
print

# Per-track scan — animates as it resolves each track's status.
print "  ${DIM}scanning tracks…${RESET}"
print

track_names=()
if [[ -d "$HOME/.aios/sessions" ]]; then
  for d in "$HOME"/.aios/sessions/*(/N); do
    track_names+=("${d:t}")
  done
fi

for name in "${track_names[@]}"; do
  [[ -z "$name" ]] && continue
  # Print hollow circle first
  print "  ${DIM}◌${RESET} ${name}"
  anim_sleep_ms 80

  # Resolve state
  state="${DIM}✓ idle${RESET}"
  if tmux -L adletic has-session -t "$name" 2>/dev/null; then
    if tmux -L adletic list-panes -s -t "$name" -F '#{pane_current_command}' 2>/dev/null | grep -q '^claude'; then
      state="${ORANGE_MID}● active claude${RESET}"
    fi
  fi
  unread=0
  inbox="$HOME/.aios/sessions/${name}/inbox.jsonl"
  read_marker="$HOME/.aios/sessions/${name}/inbox.read"
  if [[ -f "$inbox" ]]; then
    total=$(wc -l < "$inbox" 2>/dev/null || print 0)
    rc=0; [[ -f "$read_marker" ]] && rc=$(<"$read_marker")
    unread=$(( total - rc ))
  fi
  (( unread > 0 )) && state="${state} ${YELLOW_FLASH}· ${unread} unread${RESET}"

  # Overwrite the hollow row with the resolved one
  anim_overwrite_line 1 "  ${ORANGE_MID}●${RESET} ${name}  ${DIM}→${RESET}  ${state}"
done

print

# ─── Interactive session picker ────────────────────────────────
# fzf list of existing sessions + a "create new" affordance.
# Bindings: enter=attach, ctrl-n=new, ctrl-d=delete, esc=plain shell.
#
# Override knob: ADLETIC_SKIP_NAME_PROMPT=1 skips the picker entirely.
if [[ -z "$AIOS_SESSION_NAME" && "$ADLETIC_SKIP_NAME_PROMPT" != "1" ]] && command -v fzf >/dev/null 2>&1; then

  build_picker_lines() {
    print "+ create new track"
    if [[ -d "$HOME/.aios/sessions" ]]; then
      for d in "$HOME"/.aios/sessions/*(/N); do
        local nm="${d:t}"
        local marker="·"
        if tmux -L adletic has-session -t "$nm" 2>/dev/null; then
          if tmux -L adletic list-panes -s -t "$nm" -F '#{pane_current_command}' 2>/dev/null | grep -q '^claude'; then
            marker="●"
          else
            marker="○"
          fi
        fi
        print "  ${marker} ${nm}"
      done
    fi
  }

  picker_choice=$(build_picker_lines | fzf \
    --height=60% --reverse --no-info --prompt="❯ " \
    --pointer="❯" --color="pointer:#f26522,prompt:#f26522,fg+:#ffffff,bg+:#0d1117" \
    --header=$'\nenter: attach   ctrl-n: new   ctrl-d: delete   esc: plain shell\n' \
    --header-first \
    --expect=ctrl-n,ctrl-d,esc \
    --bind="esc:abort")

  if [[ -z "$picker_choice" ]]; then
    exec /bin/zsh -l   # esc or no selection → plain shell
  fi

  key="${picker_choice%%$'\n'*}"
  selection="${picker_choice##*$'\n'}"
  selection_name="${selection##*[[:space:]]}"   # strip leading whitespace and marker prefix

  case "$key" in
    ctrl-n)
      print -n "  new track name: "
      read -r new_name
      [[ -z "$new_name" ]] && exec /bin/zsh -l
      AIOS_SESSION_NAME="$new_name" exec "$AIOS_BIN" new "$new_name"
      ;;
    ctrl-d)
      [[ "$selection" == *"create new"* ]] && exec "$0"
      # Refuse delete on the affordance row; otherwise confirm.
      print -n "  delete track ${selection_name}? [y/N]: "
      read -r confirm
      if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
        "$AIOS_BIN" kill "$selection_name" 2>/dev/null \
          || tmux -L adletic kill-session -t "$selection_name" 2>/dev/null
        rm -rf "$HOME/.aios/sessions/$selection_name" 2>/dev/null
        print "  deleted ${selection_name}. press any key…"
        read -k1 -s
      fi
      exec "$0"   # restart welcome.sh to refresh the picker
      ;;
    *)
      if [[ "$selection" == *"create new"* ]]; then
        print -n "  new track name: "
        read -r new_name
        [[ -z "$new_name" ]] && exec /bin/zsh -l
        AIOS_SESSION_NAME="$new_name" exec "$AIOS_BIN" new "$new_name"
      else
        AIOS_SESSION_NAME="$selection_name" exec "$AIOS_BIN" switch "$selection_name"
      fi
      ;;
  esac
fi

# Fall back to track-N when no custom name was accepted above.
if [[ -z "$AIOS_SESSION_NAME" ]]; then
  i=1
  while tmux -L adletic has-session -t "track-$i" 2>/dev/null \
        || [[ -d "$HOME/.aios/sessions/track-$i" ]]; do
    i=$((i + 1))
  done
  AIOS_SESSION_NAME="track-$i"
fi
export AIOS_SESSION_NAME

# Register the session (creates ~/.aios/sessions/<name>/).
"$AIOS_BIN" register "$AIOS_SESSION_NAME" >/dev/null 2>&1 || true

# Resolve claude only for the opt-in path (ADLETIC_AUTO_CLAUDE=1).
CLAUDE_BIN=""
if [[ "$ADLETIC_AUTO_CLAUDE" == "1" ]]; then
  if command -v claude >/dev/null 2>&1; then
    CLAUDE_BIN="$(whence -p claude 2>/dev/null || command -v claude)"
  fi
  if [[ -z "$CLAUDE_BIN" || ! -x "$CLAUDE_BIN" ]]; then
    for cand in "$HOME/.local/bin/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
      [[ -x "$cand" ]] && CLAUDE_BIN="$cand" && break
    done
  fi
fi

# ─── Spawn ─────────────────────────────────────────────────────
# If we're already inside tmux (someone source-launched this), just hand
# the pane off — no recursive tmux.
if [[ -n "$TMUX" ]]; then
  cd "$AIOS_HOME_DIR"
  if [[ -n "$CLAUDE_BIN" ]]; then exec "$CLAUDE_BIN" --dangerously-skip-permissions; fi
  exec /bin/zsh -l
fi

# No tmux available, or NO_TMUX set → run in this terminal directly.
if [[ "$ADLETIC_NO_TMUX" == "1" ]] || ! command -v tmux >/dev/null 2>&1; then
  cd "$AIOS_HOME_DIR"
  if [[ -n "$CLAUDE_BIN" ]]; then exec "$CLAUDE_BIN" --dangerously-skip-permissions; fi
  exec /bin/zsh -l
fi

cd "$AIOS_HOME_DIR"

# Build the tmux command. Always a NEW session — never attach.
if [[ -n "$CLAUDE_BIN" ]]; then
  exec tmux -f "$TMUX_CONF" -L adletic new-session -s "$AIOS_SESSION_NAME" \
    -c "$AIOS_HOME_DIR" "$CLAUDE_BIN" --dangerously-skip-permissions
else
  exec tmux -f "$TMUX_CONF" -L adletic new-session -s "$AIOS_SESSION_NAME" \
    -c "$AIOS_HOME_DIR"
fi
