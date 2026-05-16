#!/bin/zsh
# helpers/aios-mode.sh — print current AIOS bridge mode for the owner phone.
# Output: tmux-colored short string like "aios" or "vendor" or "mb".
# Reads ~/Repo/firaz/aios-bridge/data/modes.json. Falls back to "aios" if
# the file is missing or unreadable (default mode).

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

MODES_FILE="$HOME/Repo/firaz/aios-bridge/data/modes.json"
OWNER_PHONE="${OWNER_PHONE:-601121677522}"

mode="aios"
if [[ -r "$MODES_FILE" ]]; then
  m=$(jq -r --arg phone "$OWNER_PHONE" '.[$phone] // "aios"' "$MODES_FILE" 2>/dev/null || print "aios")
  [[ -n "$m" && "$m" != "null" ]] && mode="$m"
fi

# Color the mode: orange for non-default (aios), green for vendor, blue for mb
case "$mode" in
  aios)   print -- "#[fg=#f26522,bold]aios#[default]" ;;
  vendor) print -- "#[fg=#3fb950,bold]vendor#[default]" ;;
  mb)     print -- "#[fg=#3b82f6,bold]mb#[default]" ;;
  *)      print -- "#[fg=#a0a0a0]$mode#[default]" ;;
esac
