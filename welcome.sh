#!/bin/zsh
# Adletic terminal boot — banner → tmux → plain shell.
# No auto-Claude. Each window is a fresh, independent session.
# To start Claude: type `claude` (or `aios` to jump to AIOS workspace).
# Set ADLETIC_SHIMMER=1 for animated boot (default is instant).
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
# Animations are OFF by default (instant render). Opt in with
# ADLETIC_SHIMMER=1. ADLETIC_NO_ANIM=1 still forces off (back-compat).
# Timeless: pure ANSI cursor escapes + sleep, no external deps.

ANIM=0
[[ "$ADLETIC_SHIMMER" == "1" ]] && ANIM=1
[[ "$ADLETIC_NO_ANIM" == "1" ]] && ANIM=0

# Use zsh/zselect for builtin (fork-free) sub-second sleeps. Without this,
# every animation step forks /bin/sleep — ~30ms overhead each on macOS,
# blowing the animation budget by 5×.
if zmodload zsh/zselect 2>/dev/null; then
  # zselect available — use the fast path. Args in centiseconds (10ms).
  anim_sleep_ms() {
    (( ANIM == 0 )) && return 0
    zselect -t "$(( ($1 + 9) / 10 ))"
  }
else
  # Fallback: external sleep. Slower but functional.
  anim_sleep_ms() {
    (( ANIM == 0 )) && return 0
    sleep "0.$(printf '%03d' "$1")"
  }
fi

anim_println() {
  # Print a line, then sleep N ms. Args: <ms> <text>...
  local ms=$1; shift
  print -- "$@"
  anim_sleep_ms "$ms"
}

anim_typewriter() {
  # Print text in small chunks with N ms between flushes. ANSI escape
  # sequences (\e[…m) are emitted instantly so coloured text doesn't make
  # the typewriter feel laggy. Batches `chunk` visible chars per tick to
  # keep total budget bounded under the zselect 10ms floor.
  local ms=$1; shift
  local text="$*"
  if (( ANIM == 0 )); then
    print -- "$text"
    return
  fi
  local i ch in_esc=0 visible=0 chunk=8
  for (( i = 1; i <= ${#text}; i++ )); do
    ch="${text[$i]}"
    if (( in_esc )); then
      print -n -- "$ch"
      [[ "$ch" == [a-zA-Z] ]] && in_esc=0
      continue
    fi
    if [[ "$ch" == $'\e' ]]; then
      print -n -- "$ch"
      in_esc=1
      continue
    fi
    print -n -- "$ch"
    visible=$(( visible + 1 ))
    if (( visible % chunk == 0 )); then
      anim_sleep_ms "$ms"
    fi
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

# Banner: AIOS in ANSI Shadow figlet, gradient orange.
# Each row's plain (uncolored) glyph block is exactly 28 cols wide.
banner_lines=(
  "  ${ORANGE_DEEP}${BOLD} █████╗ ██╗  ██████╗ ███████╗${RESET}"
  "  ${ORANGE_DEEP}${BOLD}██╔══██╗██║ ██╔═══██╗██╔════╝${RESET}"
  "  ${ORANGE_MID}${BOLD}███████║██║ ██║   ██║███████╗${RESET}"
  "  ${ORANGE_MID}${BOLD}██╔══██║██║ ██║   ██║╚════██║${RESET}"
  "  ${ORANGE_HOT}${BOLD}██║  ██║██║ ╚██████╔╝███████║${RESET}"
  "  ${ORANGE_HOT}${BOLD}╚═╝  ╚═╝╚═╝  ╚═════╝ ╚══════╝${RESET}"
)

# Mascot: 6 rows tall, sits to the right of the AIOS wordmark.
#
# Primary path: render assets/mascot.png via chafa (truecolor block art),
# cached to ~/.cache/adletic/mascot.ansi and regenerated when the PNG is
# newer than the cache. Cached render = instant subsequent boots.
#
# Fallback: hand-drawn ANSI mascot used when chafa is missing or the PNG
# can't be read. Same shape (6 rows) so banner alignment is preserved.
PAD="    "
ASSET_PATH="$HOME/.config/adletic/assets/mascot.png"
CACHE_DIR="$HOME/.cache/adletic"
CACHE_PATH="$CACHE_DIR/mascot.ansi"
mkdir -p "$CACHE_DIR" 2>/dev/null

mascot_lines=()
if command -v chafa >/dev/null 2>&1 && [[ -f "$ASSET_PATH" ]]; then
  # Two-stage cache:
  #   1. mascot-trimmed.png — source PNG with dark cosmic bg fuzzy-trimmed
  #      to a tight bounding box (via ImageMagick when available).
  #      Without trimming, chafa averages the starry background into every
  #      cell and the mascot collapses into a blob at small sizes.
  #   2. mascot.ansi — chafa's truecolor block render of the trimmed PNG.
  TRIMMED_PATH="$CACHE_DIR/mascot-trimmed.png"
  CHAFA_INPUT="$ASSET_PATH"
  if command -v magick >/dev/null 2>&1; then
    if [[ ! -s "$TRIMMED_PATH" ]] || [[ "$ASSET_PATH" -nt "$TRIMMED_PATH" ]]; then
      magick "$ASSET_PATH" -fuzz 25% -transparent '#08131f' -trim +repage \
        "$TRIMMED_PATH" 2>/dev/null
    fi
    [[ -s "$TRIMMED_PATH" ]] && CHAFA_INPUT="$TRIMMED_PATH"
  fi

  if [[ ! -s "$CACHE_PATH" ]] || [[ "$CHAFA_INPUT" -nt "$CACHE_PATH" ]]; then
    # Strip cursor-hide/show sequences chafa emits — they conflict with
    # welcome.sh's own cursor positioning during the flash animation.
    chafa --size=16x6 --symbols=vhalf+block --colors=truecolor \
          --bg='#08131f' "$CHAFA_INPUT" 2>/dev/null \
      | sed -E $'s/\x1b\\[\\?25[lh]//g' > "$CACHE_PATH"
  fi
  if [[ -s "$CACHE_PATH" ]]; then
    while IFS= read -r _line; do
      mascot_lines+=("$_line")
    done < "$CACHE_PATH"
  fi
fi

if (( ${#mascot_lines[@]} == 0 )); then
  # Fallback ANSI mascot — box outline orange, eyes/smile white,
  # lightning yellow, legs hot orange.
  mascot_lines=(
    ""
    "${ORANGE_MID}┌───────┐${RESET}"
    "${ORANGE_MID}│${RESET} ${WHITE}◣${RESET}   ${WHITE}◢${RESET} ${ORANGE_MID}│${RESET}  ${YELLOW_FLASH}⚡${RESET}"
    "${ORANGE_MID}│${RESET}   ${WHITE}◡${RESET}   ${ORANGE_MID}│${RESET}"
    "${ORANGE_MID}└───────┘${RESET}"
    "  ${ORANGE_HOT}▌${RESET}   ${ORANGE_HOT}▐${RESET}"
  )
fi

# Banner stagger delay: 15ms when ANIM=1 (rounds to 20ms via zselect), 0ms otherwise.
banner_delay=0
(( ANIM == 1 )) && banner_delay=15

print
for (( bi = 1; bi <= ${#banner_lines[@]}; bi++ )); do
  anim_println "$banner_delay" "${banner_lines[$bi]}${PAD}${mascot_lines[$bi]}"
done

# Flash: redraw banner in yellow, hold 40ms, redraw in orange.
# Only the banner cells flash — mascot stays put.
if (( ANIM == 1 )); then
  print -n "\e[6A"            # cursor up 6 lines
  for (( bi = 1; bi <= ${#banner_lines[@]}; bi++ )); do
    line="${banner_lines[$bi]}"
    yellow_line="${line//$ORANGE_DEEP/$YELLOW_FLASH}"
    yellow_line="${yellow_line//$ORANGE_MID/$YELLOW_FLASH}"
    yellow_line="${yellow_line//$ORANGE_HOT/$YELLOW_FLASH}"
    print -- "${yellow_line}${PAD}${mascot_lines[$bi]}"
  done
  anim_sleep_ms 40
  print -n "\e[6A"
  for (( bi = 1; bi <= ${#banner_lines[@]}; bi++ )); do
    print -- "${banner_lines[$bi]}${PAD}${mascot_lines[$bi]}"
  done
fi

print
# Subtitle: white text with "Claude Code" in orange.
subtitle_text="  ${WHITE}AI workspace for ${ORANGE_MID}Claude Code${WHITE} · multi-session ops${RESET}"
if (( ANIM == 1 )); then
  anim_typewriter 1 "$subtitle_text"
else
  print -- "$subtitle_text"
fi

# Dim-orange horizontal separator (~64 chars wide, 2-space left padding).
print "  ${ORANGE_DEEP}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
print


# ─── Interactive session picker ────────────────────────────────
# fzf list of existing sessions + a "create new" affordance.
# Bindings: enter=attach, ctrl-n=new, ctrl-r=retarget folder,
# ctrl-d=delete, esc=plain shell.
#
# Override knob: ADLETIC_SKIP_NAME_PROMPT=1 skips the picker entirely.
[[ -r "$HOME/.config/adletic/helpers/instances.sh" ]] && \
  source "$HOME/.config/adletic/helpers/instances.sh"

if [[ -z "$AIOS_SESSION_NAME" && "$ADLETIC_SKIP_NAME_PROMPT" != "1" ]] && command -v fzf >/dev/null 2>&1; then

  # One-line invitation above the picker.
  print "  ${WHITE}Pick a workspace to open, or create a new one.${RESET}"
  print

  # Compute padded width: longest name + 2 spaces, min 8.
  build_picker_lines() {
    local maxw=8
    if [[ -d "$HOME/.aios/sessions" ]]; then
      for d in "$HOME"/.aios/sessions/*(/N); do
        local nm="${d:t}"
        (( ${#nm} > maxw )) && maxw=${#nm}
      done
    fi
    local colw=$((maxw + 2))

    # First row: + new workspace (orange).
    printf '%s+ new workspace%s\n' "${ORANGE_MID}" "${RESET}"

    if [[ -d "$HOME/.aios/sessions" ]]; then
      for d in "$HOME"/.aios/sessions/*(/N); do
        local nm="${d:t}"
        local busy=0
        if tmux -L adletic has-session -t "$nm" 2>/dev/null; then
          if tmux -L adletic list-panes -s -t "$nm" -F '#{pane_current_command}' 2>/dev/null | grep -q '^claude'; then
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

        local dot_color="${DIM}"
        local name_color="${DIM}"
        local sep_color="${DIM}"
        local state_text="idle"
        if (( busy == 1 )); then
          dot_color="${ORANGE_MID}"
          name_color="${WHITE}"
          sep_color="${WHITE}"
          state_text="busy with claude"
        fi

        # Pad the name to colw visible characters.
        local padded_name=$(printf '%-*s' "$colw" "$nm")

        local row="${dot_color}●${RESET} ${name_color}${padded_name}${RESET}${sep_color}· ${state_text}${RESET}"
        if (( unread > 0 )); then
          row="${row} ${DIM}·${RESET} ${YELLOW_FLASH}${unread} messages${RESET}"
        fi
        # Append the workspace folder, dim. Show ~/ prefix when under $HOME.
        # IMPORTANT: combine `local` with assignment. A bare `local cwd;` on
        # the second-and-later loop iterations triggers zsh typeset's
        # declare-or-print dual behavior, echoing `cwd=<previous value>` to
        # stdout — which fzf then renders as a phantom selectable row.
        if typeset -f aios_get_path >/dev/null 2>&1; then
          local cwd=$(aios_get_path "$nm")
          local display="${cwd/#$HOME/~}"
          row="${row}   ${DIM}${display}${RESET}"
        fi
        print -- "$row"
      done
    fi
  }

  picker_choice=$(build_picker_lines | fzf --ansi \
    --height=60% --reverse --no-info --prompt="❯ " \
    --pointer="❯" --color="pointer:#f26522,prompt:#f26522,fg+:#ffffff,bg+:#0d1117" \
    --header=$'\n↑↓ navigate   enter open   ctrl-n new   ctrl-r retarget   ctrl-d remove   esc skip\n' \
    --header-first \
    --expect=ctrl-n,ctrl-r,ctrl-d,esc \
    --bind="esc:abort")

  if [[ -z "$picker_choice" ]]; then
    exec /bin/zsh -l   # esc or no selection → plain shell
  fi

  key="${picker_choice%%$'\n'*}"
  selection="${picker_choice##*$'\n'}"
  # Strip ANSI escape sequences (sed handles this reliably across zsh setopts).
  selection_plain=$(print -- "$selection" | sed -E $'s/\x1b\\[[0-9;]*[a-zA-Z]//g')
  # Extract the workspace name: it's the second whitespace-separated field
  # (skipping the ● marker). For the "+ new workspace" affordance row, the
  # name is unused — we match on selection_plain directly below.
  selection_name=""
  if [[ "$selection_plain" != *"new workspace"* ]]; then
    typeset -a _fields
    _fields=(${=selection_plain})   # zsh word-split on IFS
    selection_name="${_fields[2]}"  # 1=marker (●/○), 2=name, rest=· idle/...
  fi

  case "$key" in
    ctrl-n)
      print -n "  new workspace name: "
      read -r new_name
      [[ -z "$new_name" ]] && exec /bin/zsh -l
      AIOS_SESSION_NAME="$new_name" exec "$AIOS_BIN" new "$new_name"
      ;;
    ctrl-r)
      # Retarget the highlighted workspace's folder via picker.
      [[ "$selection_plain" == *"new workspace"* ]] && exec "$0"
      [[ -z "$selection_name" ]] && exec "$0"
      "$AIOS_BIN" cd "$selection_name"
      print "  press any key…"
      read -k1 -s
      exec "$0"   # refresh
      ;;
    ctrl-d)
      [[ "$selection_plain" == *"new workspace"* ]] && exec "$0"
      # Refuse delete on the affordance row; otherwise confirm.
      print -n "  remove workspace ${selection_name}? [y/N]: "
      read -r confirm
      if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
        "$AIOS_BIN" kill "$selection_name" 2>/dev/null \
          || tmux -L adletic kill-session -t "$selection_name" 2>/dev/null
        rm -rf "$HOME/.aios/sessions/$selection_name" 2>/dev/null
        print "  removed ${selection_name}. press any key…"
        read -k1 -s
      fi
      exec "$0"   # restart welcome.sh to refresh the picker
      ;;
    *)
      if [[ "$selection_plain" == *"new workspace"* ]]; then
        print -n "  new workspace name: "
        read -r new_name
        [[ -z "$new_name" ]] && exec /bin/zsh -l
        AIOS_SESSION_NAME="$new_name" exec "$AIOS_BIN" new "$new_name"
      else
        AIOS_SESSION_NAME="$selection_name" exec "$AIOS_BIN" switch "$selection_name"
      fi
      ;;
  esac
fi

# Fall back to workspace-N when no custom name was accepted above.
if [[ -z "$AIOS_SESSION_NAME" ]]; then
  i=1
  while tmux -L adletic has-session -t "workspace-$i" 2>/dev/null \
        || [[ -d "$HOME/.aios/sessions/workspace-$i" ]]; do
    i=$((i + 1))
  done
  AIOS_SESSION_NAME="workspace-$i"
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

# Start inbox notification daemon if not running.
INBOX_DAEMON="$HOME/.config/adletic/helpers/inbox-daemon.sh"
INBOX_PID_FILE="$HOME/.cache/adletic/inbox-daemon.pid"
if [[ -x "$INBOX_DAEMON" ]] && \
   { [[ ! -f "$INBOX_PID_FILE" ]] || ! kill -0 "$(<"$INBOX_PID_FILE")" 2>/dev/null; }; then
  nohup "$INBOX_DAEMON" >/dev/null 2>&1 &
  disown
fi

# Build the tmux command. Always a NEW session — never attach.
if [[ -n "$CLAUDE_BIN" ]]; then
  exec tmux -f "$TMUX_CONF" -L adletic new-session -s "$AIOS_SESSION_NAME" \
    -c "$AIOS_HOME_DIR" "$CLAUDE_BIN" --dangerously-skip-permissions
else
  exec tmux -f "$TMUX_CONF" -L adletic new-session -s "$AIOS_SESSION_NAME" \
    -c "$AIOS_HOME_DIR"
fi
