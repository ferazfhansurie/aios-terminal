#!/bin/zsh
# modals/explorer.sh — Yazi file browser as a tmux popup.

set -eu

START_DIR="${1:-$PWD}"
exec yazi "$START_DIR"
