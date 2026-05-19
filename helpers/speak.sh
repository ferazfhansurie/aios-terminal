#!/usr/bin/env bash
# speak.sh — text-to-speech via macOS `say`.
# Input priority: argv → stdin → pbpaste (clipboard).
# Voice + rate configurable via env: ADLETIC_TTS_VOICE, ADLETIC_TTS_RATE.
# Runs in the background so the calling tmux popup / chord returns instantly.
# To stop: speak-stop.sh (or pkill say).

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

VOICE="${ADLETIC_TTS_VOICE:-Samantha}"
RATE="${ADLETIC_TTS_RATE:-200}"

# Gather text.
if [[ $# -gt 0 ]]; then
  TEXT="$*"
elif [[ ! -t 0 ]]; then
  TEXT="$(cat)"
else
  TEXT="$(pbpaste 2>/dev/null || true)"
fi

# Strip ANSI escapes + collapse runs of whitespace so transcripts aren't garbled.
TEXT=$(printf '%s' "$TEXT" \
  | sed $'s/\x1b\\[[0-9;?]*[a-zA-Z]//g' \
  | tr -s '[:space:]' ' ' \
  | sed 's/^ //; s/ $//')

if [[ -z "$TEXT" ]]; then
  exit 0
fi

# Cap absurdly long text (>4000 chars) so a fat-fingered ⌘A doesn't read an
# entire transcript. Trim to last sentence boundary inside the cap.
if (( ${#TEXT} > 4000 )); then
  TEXT="${TEXT:0:4000}"
  TEXT="${TEXT%[.!?]*}."
fi

# Kill any in-flight `say` so a new request takes over cleanly.
pkill -x say 2>/dev/null || true

# Background so the popup/chord returns immediately.
nohup /usr/bin/say -v "$VOICE" -r "$RATE" -- "$TEXT" >/dev/null 2>&1 &
disown
