#!/bin/bash
# ─────────────────────────────────────────────
# AIOS Remote — Start server + Cloudflare tunnel
#
# Usage:
#   ./start-remote.sh              # with tunnel (if configured)
#   NO_TUNNEL=1 ./start-remote.sh  # LAN only
# ─────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

# Config
PORT="${PORT:-3456}"
export AIOS_PASSWORD="${AIOS_PASSWORD:-aios2024}"
export AIOS_HOST="0.0.0.0"

# Telegram Bot (for sending URL notification)
TELEGRAM_BOT_TOKEN="8700460995:AAHNpUqcxxxBSBAFF27zrUq2dbX_loImMlw"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-6768889134}"

# Get local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo "  AIOS Remote"
echo "  ─────────────────────────────────"

# Kill any existing processes on port
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# Start the server
echo "  Starting server on 0.0.0.0:$PORT..."
npx tsx server.ts > /tmp/aios-server.log 2>&1 &
SERVER_PID=$!
sleep 3

if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "  Server failed to start:"
  cat /tmp/aios-server.log
  exit 1
fi

echo "  ✓ Server running (PID $SERVER_PID)"

# Start Cloudflare Tunnel
TUNNEL_PID=""
TUNNEL_URL=""
TUNNEL_CONFIG="$SCRIPT_DIR/.tunnel-config"

if [ "$NO_TUNNEL" != "1" ] && command -v cloudflared &>/dev/null; then
  if [ -f "$TUNNEL_CONFIG" ]; then
    # Named tunnel (permanent URL)
    source "$TUNNEL_CONFIG"
    echo "  Starting tunnel ($HOSTNAME)..."
    cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" > /tmp/aios-tunnel.log 2>&1 &
    TUNNEL_PID=$!
    sleep 3
    TUNNEL_URL="https://$HOSTNAME"
    echo "  ✓ Tunnel running (PID $TUNNEL_PID)"
  else
    # Quick tunnel (temporary URL)
    echo "  Starting quick tunnel..."
    cloudflared tunnel --url "http://localhost:$PORT" > /tmp/aios-tunnel.log 2>&1 &
    TUNNEL_PID=$!
    sleep 5
    TUNNEL_URL=$(grep -o 'https://[a-z0-9\-]*\.trycloudflare\.com' /tmp/aios-tunnel.log 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then
      echo "  ✓ Quick tunnel: $TUNNEL_URL"
    else
      echo "  ⚠ Tunnel started but URL not detected yet"
    fi
  fi
else
  echo "  ⚠ No tunnel (LAN only)"
fi

# Build the best URL
if [ -n "$TUNNEL_URL" ]; then
  DISPLAY_URL="$TUNNEL_URL"
else
  DISPLAY_URL="http://${LOCAL_IP}:${PORT}"
fi

echo ""
echo "  ─────────────────────────────────"
echo "  URL:  $DISPLAY_URL"
echo "  LAN:  http://${LOCAL_IP}:${PORT}"
echo "  Auth: password login"
echo "  ─────────────────────────────────"

# Send via Telegram
if [ -n "$TELEGRAM_CHAT_ID" ]; then
  echo ""
  echo "  Sending URL via Telegram..."
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "text=🖥 <b>AIOS Remote is live</b>

<code>$DISPLAY_URL</code>

Tap below to open." \
    --data-urlencode "reply_markup={\"inline_keyboard\":[[{\"text\":\"Open AIOS\",\"url\":\"$DISPLAY_URL\"}]]}" \
    > /dev/null 2>&1 && \
    echo "  ✓ Telegram sent" || \
    echo "  ⚠ Telegram failed"
fi

echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo "  Shutting down..."
  [ -n "$TUNNEL_PID" ] && kill $TUNNEL_PID 2>/dev/null
  kill $SERVER_PID 2>/dev/null
  wait $SERVER_PID 2>/dev/null
  echo "  Stopped."
}
trap cleanup EXIT INT TERM

wait $SERVER_PID
