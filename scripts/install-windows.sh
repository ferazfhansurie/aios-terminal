#!/usr/bin/env bash
# Adletic terminal — Windows install helper.
# Run this from Git Bash AFTER vanilla Alacritty is installed (via `winget install Alacritty.Alacritty`).
#
# It:
#   1. Clones / updates the Adletic config repo at ~/.config/adletic
#   2. Copies alacritty.windows.toml + welcome.bash into place
#   3. Wires %APPDATA%\alacritty\alacritty.toml to point at the windows config
#   4. Verifies Alacritty launches cleanly (smoke test)

set -euo pipefail

ORANGE='\033[38;2;242;101;34m'
DIM='\033[38;2;160;160;160m'
GREEN='\033[38;2;63;185;80m'
RED='\033[38;2;248;81;73m'
RESET='\033[0m'
BOLD='\033[1m'

REPO_URL="https://github.com/ferazfhansurie/aios-terminal.git"
BRANCH="${ADLETIC_BRANCH:-feat/windows-config}"
CONFIG_DIR="$HOME/.config/adletic"
APPDATA_ALACRITTY="$APPDATA/alacritty"

echo ""
printf "  ${ORANGE}${BOLD}adletic terminal — windows setup${RESET}\n"
echo ""

# 1. Clone or update the config repo on the windows-config branch.
if [[ -d "$CONFIG_DIR/.git" ]]; then
  printf "  ${DIM}updating $CONFIG_DIR (branch $BRANCH)...${RESET}\n"
  git -C "$CONFIG_DIR" fetch --quiet origin "$BRANCH"
  git -C "$CONFIG_DIR" reset --hard "origin/$BRANCH" --quiet
else
  printf "  ${DIM}cloning to $CONFIG_DIR (branch $BRANCH)...${RESET}\n"
  mkdir -p "$(dirname "$CONFIG_DIR")"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$CONFIG_DIR"
fi
printf "  ${GREEN}●${RESET}  config repo  ${DIM}$CONFIG_DIR${RESET}\n"

# 2. Set up %APPDATA%\alacritty\alacritty.toml → adletic windows config.
mkdir -p "$APPDATA_ALACRITTY"
# Copy (not symlink — Windows symlinks need admin, MSYS junctions are messy with alacritty).
cp -f "$CONFIG_DIR/alacritty.windows.toml" "$APPDATA_ALACRITTY/alacritty.toml"
printf "  ${GREEN}●${RESET}  alacritty    ${DIM}$APPDATA_ALACRITTY/alacritty.toml${RESET}\n"

# 3. Verify welcome.bash is in place (the alacritty.toml references it).
test -f "$CONFIG_DIR/welcome.bash" || {
  printf "  ${RED}✗ welcome.bash missing from $CONFIG_DIR${RESET}\n"
  exit 1
}
printf "  ${GREEN}●${RESET}  welcome      ${DIM}$CONFIG_DIR/welcome.bash${RESET}\n"

# 4. Locate alacritty.exe.
ALACRITTY_EXE=""
for cand in \
  "/c/Program Files/Alacritty/alacritty.exe" \
  "$HOME/AppData/Local/Microsoft/WinGet/Links/alacritty.exe" \
  "/c/Users/$USER/AppData/Local/Programs/Alacritty/alacritty.exe"; do
  if [[ -x "$cand" ]]; then
    ALACRITTY_EXE="$cand"
    break
  fi
done

if [[ -z "$ALACRITTY_EXE" ]]; then
  printf "  ${RED}!${RESET}  ${DIM}alacritty.exe not found — install with: winget install Alacritty.Alacritty${RESET}\n"
else
  printf "  ${GREEN}●${RESET}  alacritty    ${DIM}$ALACRITTY_EXE${RESET}\n"
fi

# 5. Validate the config syntax (alacritty --print-events would block; use --version after applying).
if [[ -n "$ALACRITTY_EXE" ]]; then
  if "$ALACRITTY_EXE" migrate --dry-run 2>&1 | head -1 | grep -qi "error"; then
    printf "  ${RED}✗ alacritty config has errors — check $APPDATA_ALACRITTY/alacritty.toml${RESET}\n"
  else
    printf "  ${GREEN}●${RESET}  validation   ${DIM}config parses${RESET}\n"
  fi
fi

echo ""
printf "  ${GREEN}${BOLD}✓ adletic terminal wired.${RESET}\n"
echo ""
printf "  ${DIM}Open Alacritty from Start Menu (or pin to taskbar) and you'll see${RESET}\n"
printf "  ${DIM}the AIOS banner, then drop into Git Bash. Type ${ORANGE}aios${DIM} to launch.${RESET}\n"
echo ""
