#!/bin/zsh
# modals/explorer.sh — Yazi file browser as a tmux popup.

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

START_DIR="${1:-$PWD}"
[[ -d "$START_DIR" ]] || START_DIR="$HOME"

LOG="${TMPDIR:-/tmp}/yazi-popup.log"
exec yazi "$START_DIR" 2>"$LOG"
