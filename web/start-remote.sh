#!/bin/bash
# ─────────────────────────────────────────────
# AIOS Remote — Start server + Telegram the URL
#
# Usage:
#   ./start-remote.sh
#   TELEGRAM_CHAT_ID=123456 ./start-remote.sh
# ─────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

# Config
PORT="${PORT:-3456}"
TOKEN="${AIOS_TOKEN:-$(openssl rand -hex 32)}"
export AIOS_TOKEN="$TOKEN"
export AIOS_HOST="0.0.0.0"

# Telegram Bot
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

# Start the server (bound to 0.0.0.0 so LAN devices can reach it)
echo "  Starting server on 0.0.0.0:$PORT..."
npx tsx server.ts > /tmp/aios-server.log 2>&1 &
SERVER_PID=$!
sleep 3

if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "  Server failed to start:"
  cat /tmp/aios-server.log
  exit 1
fi

FULL_URL="http://${LOCAL_IP}:${PORT}?token=${TOKEN}"

echo "  ✓ Server running (PID $SERVER_PID)"
echo ""
echo "  URL: $FULL_URL"
echo ""

# Send via Telegram (inline button opens in default browser)
if [ -n "$TELEGRAM_CHAT_ID" ]; then
  echo "  Sending URL via Telegram..."
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "text=🖥 <b>AIOS Remote is live</b>

Tap to control your machine." \
    --data-urlencode "reply_markup={\"inline_keyboard\":[[{\"text\":\"Open Terminal\",\"url\":\"$FULL_URL\"}]]}" \
    > /dev/null 2>&1 && \
    echo "  ✓ Telegram sent" || \
    echo "  ⚠ Telegram failed"
else
  echo "  ⚠ No chat ID. Send a message to @adletic_bot, then re-run."
fi

echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo "  Shutting down..."
  kill $SERVER_PID 2>/dev/null
  wait $SERVER_PID 2>/dev/null
  echo "  Stopped."
}
trap cleanup EXIT INT TERM

wait $SERVER_PID
