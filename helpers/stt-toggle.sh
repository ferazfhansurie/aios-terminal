#!/usr/bin/env bash
# stt-toggle.sh — one-button voice-to-text.
# First call:  start recording in the background, write lockfile.
# Second call: stop ffmpeg, transcribe via local Whisper, send text into
#              the pane that was active when recording started.
# Bound to ⌥⌘V (alacritty) and the [voice] pill (status bar).

set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LOCK="/tmp/aios-stt.lock"
LOG="/tmp/aios-stt.log"
WHISPER_URL="${ADLETIC_WHISPER_URL:-http://127.0.0.1:2022/v1/audio/transcriptions}"
LANG_CODE="${ADLETIC_STT_LANG:-en}"
MAX_SEC="${ADLETIC_STT_MAX_SEC:-120}"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >> "$LOG"; }

# Resolve the avfoundation audio device index DYNAMICALLY at each call.
# avfoundation reassigns indices when devices come and go (iPhone Continuity
# Mic etc.), so a hardcoded ":1" breaks the moment you (un)pair. Strategy:
#   1. honor $ADLETIC_MIC if the user set it (literal pass-through)
#   2. find by preferred name (env $ADLETIC_MIC_NAME, default "MacBook Air")
#   3. fall back to first device matching "Microphone"
#   4. last resort: ":0"
resolve_mic() {
  if [[ -n "${ADLETIC_MIC:-}" ]]; then
    printf '%s' "$ADLETIC_MIC"
    return
  fi
  local pref="${ADLETIC_MIC_NAME:-MacBook Air}"
  local list
  list=$(/opt/homebrew/bin/ffmpeg -f avfoundation -list_devices true -i "" 2>&1 \
    | awk '/AVFoundation audio devices/{flag=1; next} flag && /\[[0-9]+\]/{print}')
  local idx
  idx=$(printf '%s\n' "$list" | grep -i "$pref" | sed -E 's/.*\[([0-9]+)\].*/\1/' | head -1)
  if [[ -z "$idx" ]]; then
    idx=$(printf '%s\n' "$list" | grep -i "Microphone" | sed -E 's/.*\[([0-9]+)\].*/\1/' | head -1)
  fi
  [[ -z "$idx" ]] && idx=0
  printf ':%s' "$idx"
}
ding() { /usr/bin/afplay -v 0.4 "$1" >/dev/null 2>&1 & disown 2>/dev/null || true; }
toast() { /opt/homebrew/bin/tmux -L adletic display-message "$1" 2>/dev/null || true; }

log "----- invoked (argv: $*) -----"

# Stale-lock guard: if the lockfile claims a recording is in progress but the
# ffmpeg process is gone (crash, manual kill, mic permission denied), wipe it
# and fall through to START.
if [[ -f "$LOCK" ]]; then
  # shellcheck disable=SC1090
  source "$LOCK"
  if [[ -z "${FFPID:-}" ]] || ! kill -0 "$FFPID" 2>/dev/null; then
    log "stale lock (ffpid=${FFPID:-?} not alive) — wiping + falling to START"
    rm -f "$LOCK"
    [[ -n "${WAV:-}" ]] && rm -f "$WAV"
    unset FFPID WAV CALLER
  fi
fi

if [[ -f "$LOCK" ]]; then
  # ===== STOP path =====
  log "STOP: ffpid=$FFPID wav=$WAV caller=$CALLER"
  rm -f "$LOCK"
  kill -INT "$FFPID" 2>/dev/null || true
  # Give ffmpeg ~600ms to finalize the wav header.
  for _ in 1 2 3 4 5 6; do
    kill -0 "$FFPID" 2>/dev/null || break
    sleep 0.1
  done
  kill -KILL "$FFPID" 2>/dev/null || true
  ding /System/Library/Sounds/Pop.aiff
  toast "🎤 transcribing…"
  /opt/homebrew/bin/tmux -L adletic refresh-client -S 2>/dev/null || true

  if [[ ! -s "${WAV:-/nope}" ]]; then
    log "STOP: no audio at $WAV"
    toast "🎤 no audio — check mic permission (System Settings → Privacy → Microphone → Adletic)"
    rm -f "${WAV:-}"
    exit 0
  fi

  log "STOP: posting $WAV ($(stat -f %z "$WAV") bytes) to $WHISPER_URL"
  RESP=$(curl -sS --max-time 60 -X POST "$WHISPER_URL" \
    -F "file=@$WAV" \
    -F 'model=whisper-1' \
    -F "language=$LANG_CODE" 2>&1)
  CURL_EXIT=$?
  log "STOP: curl exit=$CURL_EXIT resp head=${RESP:0:200}"

  TEXT=$(printf '%s' "$RESP" | /usr/bin/python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print((d.get("text") or "").strip())
except Exception:
    pass
' 2>/dev/null)
  rm -f "$WAV"

  if [[ -z "$TEXT" ]]; then
    log "STOP: empty transcription"
    toast "🎤 nothing heard"
    exit 0
  fi

  log "STOP: transcribed → $TEXT"
  printf '%s' "$TEXT" | /usr/bin/pbcopy 2>/dev/null || true

  if [[ -n "${CALLER:-}" ]]; then
    /opt/homebrew/bin/tmux -L adletic send-keys -t "$CALLER" -l -- "$TEXT" 2>/dev/null \
      && log "STOP: send-keys → $CALLER ok" \
      || log "STOP: send-keys → $CALLER FAILED"
  else
    log "STOP: no caller pane id"
  fi
  ding /System/Library/Sounds/Glass.aiff
  toast "🎤 ${TEXT:0:80}"
else
  # ===== START path =====
  CALLER=$(/opt/homebrew/bin/tmux -L adletic display-message -p '#{pane_id}' 2>/dev/null || echo '')
  WAV="/tmp/aios-stt-$$-$(date +%s).wav"
  FFLOG="/tmp/aios-stt-ff-$$.log"
  DEVICE=$(resolve_mic)
  log "START: caller=$CALLER wav=$WAV device=$DEVICE (resolved dynamically)"

  # nohup + fully detached stdio so tmux's run-shell exit doesn't take ffmpeg
  # with it.  Errors land in FFLOG so we can diagnose mic-permission failures.
  /usr/bin/nohup /opt/homebrew/bin/ffmpeg -y -hide_banner -loglevel error \
    -f avfoundation -i "$DEVICE" \
    -ac 1 -ar 16000 \
    -t "$MAX_SEC" \
    "$WAV" </dev/null > "$FFLOG" 2>&1 &
  FFPID=$!
  disown 2>/dev/null || true

  # Give ffmpeg 200ms to either start or die from a permission error.
  sleep 0.2
  if ! kill -0 "$FFPID" 2>/dev/null; then
    log "START: ffmpeg died immediately — ff log:"
    log "$(head -c 400 "$FFLOG" 2>/dev/null)"
    toast "🎤 mic open failed — see /tmp/aios-stt-ff-$$.log"
    rm -f "$WAV"
    exit 1
  fi

  umask 077
  cat > "$LOCK" <<EOF
FFPID=$FFPID
WAV='$WAV'
CALLER='$CALLER'
FFLOG='$FFLOG'
EOF

  ding /System/Library/Sounds/Tink.aiff
  toast "🎤 recording — click voice / ⌥⌘V again to stop"
  /opt/homebrew/bin/tmux -L adletic refresh-client -S 2>/dev/null || true
  log "START: ffpid=$FFPID live"
fi
