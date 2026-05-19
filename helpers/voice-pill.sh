#!/usr/bin/env bash
# voice-pill.sh — render the [voice] pill, recording-aware.
# Normal: dim grey "🎤 voice".
# Recording: amber background, bold "🔴 rec".
# Emits tmux format codes so it owns its own styling.

LOCK="/tmp/aios-stt.lock"

if [[ -f "$LOCK" ]]; then
  printf '#[fg=#08131f,bg=#fbbf24,bold]  🔴  #[default]'
else
  printf '#[fg=#a0a0a0,bg=#161b22]  🎤  #[default]'
fi
