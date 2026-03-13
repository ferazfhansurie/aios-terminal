#!/bin/bash
# ─────────────────────────────────────────────
# Install AIOS as auto-start service (macOS launchd)
#
# This makes AIOS server + tunnel start automatically
# on boot — so it's always accessible from your phone.
#
# Usage:
#   ./install-autostart.sh          # install
#   ./install-autostart.sh remove   # uninstall
# ─────────────────────────────────────────────

set -e

PLIST_NAME="com.adletic.aios-server"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$HOME/Library/Logs/aios"

if [ "$1" = "remove" ]; then
  echo "  Removing AIOS auto-start..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "  ✓ Removed"
  exit 0
fi

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# Generate a persistent token if not already set
TOKEN_FILE="$SCRIPT_DIR/.aios-token"
if [ ! -f "$TOKEN_FILE" ]; then
  openssl rand -hex 32 > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi
AIOS_TOKEN=$(cat "$TOKEN_FILE")

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${SCRIPT_DIR}/start-remote.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${SCRIPT_DIR}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>AIOS_TOKEN</key>
    <string>${AIOS_TOKEN}</string>
    <key>AIOS_HOST</key>
    <string>0.0.0.0</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/server.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/server-error.log</string>

  <key>ThrottleInterval</key>
  <integer>30</integer>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "  AIOS Auto-Start Installed"
echo "  ─────────────────────────────────"
echo "  ✓ Server will start on boot"
echo "  ✓ Auto-restarts if it crashes"
echo ""
echo "  Token: ${AIOS_TOKEN:0:8}..."
echo "  Logs:  $LOG_DIR/"
echo ""
echo "  Commands:"
echo "    Stop:    launchctl unload $PLIST_PATH"
echo "    Start:   launchctl load $PLIST_PATH"
echo "    Remove:  ./install-autostart.sh remove"
echo ""
