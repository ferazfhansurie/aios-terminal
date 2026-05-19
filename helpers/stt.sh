#!/usr/bin/env bash
# stt.sh — speech-to-text.
# Records mic audio with ffmpeg, transcribes via local Whisper (voicemode
# service on port 2022), then `tmux send-keys` the result into the caller
# pane. Intended to run inside a tmux display-popup; the launcher captures
# the calling pane id into TMUX_CALLER_PANE before spawning the popup.
#
# Keys inside the popup:
#   ENTER  → stop recording, transcribe, send text
#   ctrl-c → cancel (no send)
#
# Env overrides:
#   ADLETIC_WHISPER_URL  (default: http://127.0.0.1:2022/v1/audio/transcriptions)
#   ADLETIC_MIC          (default: ":1" — MacBook Air Microphone)
#   ADLETIC_STT_LANG     (default: en)
#   ADLETIC_STT_MAX_SEC  (default: 120)

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CALLER="${TMUX_CALLER_PANE:-}"
WHISPER_URL="${ADLETIC_WHISPER_URL:-http://127.0.0.1:2022/v1/audio/transcriptions}"
DEVICE="${ADLETIC_MIC:-:1}"
LANG_CODE="${ADLETIC_STT_LANG:-en}"
MAX_SEC="${ADLETIC_STT_MAX_SEC:-120}"

TMPWAV="/tmp/aios-stt-$$-$(date +%s).wav"

cleanup() {
  [[ -n "${FFPID:-}" ]] && kill "$FFPID" 2>/dev/null || true
  rm -f "$TMPWAV"
}
trap cleanup EXIT

clear
printf '🎤  \033[1;38;2;242;101;34mrecording\033[0m — press ENTER to transcribe · ctrl-c to cancel\n\n'

# 16kHz mono is what whisper expects; ffmpeg resamples on the fly.
ffmpeg -y -hide_banner -loglevel error \
  -f avfoundation -i "$DEVICE" \
  -ac 1 -ar 16000 \
  -t "$MAX_SEC" \
  "$TMPWAV" &
FFPID=$!

# Block on ENTER.
read -r _ || true

# Stop ffmpeg cleanly so the wav header is finalized.
kill -INT "$FFPID" 2>/dev/null || true
wait "$FFPID" 2>/dev/null || true
FFPID=""

if [[ ! -s "$TMPWAV" ]]; then
  printf '\033[31mno audio captured\033[0m\n'
  sleep 1
  exit 0
fi

printf '\n\033[2mtranscribing…\033[0m\n'

# Whisper local API (OpenAI-compatible). voicemode runs it on :2022.
RESP=$(curl -sS --max-time 60 -X POST "$WHISPER_URL" \
  -H 'Content-Type: multipart/form-data' \
  -F "file=@$TMPWAV" \
  -F 'model=whisper-1' \
  -F "language=$LANG_CODE" 2>&1) || {
    printf '\033[31mwhisper request failed:\033[0m %s\n' "$RESP"
    sleep 3
    exit 1
  }

TEXT=$(printf '%s' "$RESP" | python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print((d.get("text") or "").strip())
except Exception as e:
    sys.exit(0)
')

if [[ -z "$TEXT" ]]; then
  printf '\033[31mno text returned\033[0m — raw: %s\n' "$RESP" | head -c 200
  sleep 2
  exit 0
fi

printf '\n\033[1;38;2;242;101;34m→\033[0m %s\n' "$TEXT"

# Always copy to clipboard as a safety net.
printf '%s' "$TEXT" | pbcopy 2>/dev/null || true

if [[ -n "$CALLER" ]]; then
  # -l (literal) avoids tmux interpreting key names inside the text.
  tmux -L adletic send-keys -t "$CALLER" -l -- "$TEXT"
  sleep 0.4
else
  printf '\033[2m(no caller pane — text on clipboard)\033[0m\n'
  sleep 1.5
fi
