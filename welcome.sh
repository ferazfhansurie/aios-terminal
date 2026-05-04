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
print
print "  ${ORANGE}${BOLD}     █████╗ ██████╗ ██╗     ███████╗████████╗██╗ ██████╗${RESET}"
print "  ${ORANGE}${BOLD}    ██╔══██╗██╔══██╗██║     ██╔════╝╚══██╔══╝██║██╔════╝${RESET}"
print "  ${ORANGE}${BOLD}    ███████║██║  ██║██║     █████╗     ██║   ██║██║     ${RESET}"
print "  ${ORANGE}${BOLD}    ██╔══██║██║  ██║██║     ██╔══╝     ██║   ██║██║     ${RESET}"
print "  ${ORANGE}${BOLD}    ██║  ██║██████╔╝███████╗███████╗   ██║   ██║╚██████╗${RESET}"
print "  ${ORANGE}${BOLD}    ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝   ╚═╝   ╚═╝ ╚═════╝${RESET}"
print
print "  ${WHITE}AI Operating System${RESET}  ${DIM}·  type ${RESET}${ORANGE}aios${RESET}${DIM} to start Claude in workspace${RESET}"
print

# Active session count (for awareness, not auto-attach).
if [[ -x "$AIOS_BIN" ]]; then
  ACTIVE_COUNT=$("$AIOS_BIN" list 2>/dev/null | grep -E "active · " | sed -E 's/.*([0-9]+) active.*/\1/' | head -1)
  if [[ -n "$ACTIVE_COUNT" && "$ACTIVE_COUNT" -gt 0 ]]; then
    print "  ${DIM}${ACTIVE_COUNT} other session(s) active — ${RESET}${ORANGE}adletic list${RESET}${DIM} to view${RESET}"
    print
  fi
fi

# Brief settle on the banner.
sleep 0.5

# ─── Pick a session name (or attach to an existing one) ────────
# If $AIOS_SESSION_NAME is set externally (e.g. spawned via adletic
# msg create-window), honour it. Otherwise prompt — three outcomes:
#   • empty input         → auto-generate track-N
#   • new name            → create a fresh session with that name
#   • existing tmux name  → attach to that running session instead
#
# Override knob: ADLETIC_SKIP_NAME_PROMPT=1 skips the prompt entirely.
if [[ -z "$AIOS_SESSION_NAME" && "$ADLETIC_SKIP_NAME_PROMPT" != "1" ]]; then
  EXISTING_SESSIONS=$(tmux -L adletic list-sessions -F '#{session_name}' 2>/dev/null | sort | paste -sd ' ' -)
  if [[ -n "$EXISTING_SESSIONS" ]]; then
    print "  ${DIM}running: ${ORANGE}${EXISTING_SESSIONS}${RESET}"
  fi
  print -n "  ${ORANGE}❯${RESET} ${WHITE}name${RESET} ${DIM}(empty=auto, existing=attach)${RESET}: "
  read -r AIOS_SESSION_NAME_INPUT </dev/tty
  AIOS_SESSION_NAME_INPUT=${AIOS_SESSION_NAME_INPUT// /-}
  AIOS_SESSION_NAME_INPUT=${AIOS_SESSION_NAME_INPUT:l}
  if [[ -n "$AIOS_SESSION_NAME_INPUT" ]]; then
    if tmux -L adletic has-session -t "$AIOS_SESSION_NAME_INPUT" 2>/dev/null; then
      # Existing live session — attach instead of creating a new one. Bail
      # out of welcome.sh entirely and hand the pane to tmux.
      print "  ${ORANGE}↪${RESET} ${DIM}attaching to ${WHITE}${AIOS_SESSION_NAME_INPUT}${RESET}"
      sleep 0.3
      exec tmux -f "$TMUX_CONF" -L adletic attach-session -t "$AIOS_SESSION_NAME_INPUT"
    elif [[ -d "$HOME/.aios/sessions/$AIOS_SESSION_NAME_INPUT" ]]; then
      # Registry dir exists but no live tmux session — zombie. Reuse the
      # name so inbox / outbox history is preserved.
      print "  ${ORANGE}↻${RESET} ${DIM}reusing zombie name ${WHITE}${AIOS_SESSION_NAME_INPUT}${RESET}"
      AIOS_SESSION_NAME="$AIOS_SESSION_NAME_INPUT"
    else
      AIOS_SESSION_NAME="$AIOS_SESSION_NAME_INPUT"
    fi
  fi
  print
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
