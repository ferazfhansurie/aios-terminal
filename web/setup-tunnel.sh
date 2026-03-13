#!/bin/bash
# ─────────────────────────────────────────────
# AIOS Tunnel Setup — One-time Cloudflare Tunnel setup
#
# This creates a persistent tunnel so your AIOS
# server is accessible from anywhere (phone, etc)
#
# Usage:
#   ./setup-tunnel.sh
#   ./setup-tunnel.sh aios.jutateknologi.com
# ─────────────────────────────────────────────

set -e

TUNNEL_NAME="aios-terminal"
HOSTNAME="${1:-}"  # Optional: custom domain like aios.jutateknologi.com

echo ""
echo "  AIOS Tunnel Setup"
echo "  ─────────────────────────────────"

# 1. Install cloudflared
if ! command -v cloudflared &>/dev/null; then
  echo "  Installing cloudflared..."
  brew install cloudflared
  echo "  ✓ cloudflared installed"
else
  echo "  ✓ cloudflared already installed"
fi

# 2. Login to Cloudflare
echo ""
echo "  Step 1: Login to Cloudflare"
echo "  This will open a browser — pick the domain you want to use."
echo ""
cloudflared tunnel login

# 3. Create tunnel
echo ""
echo "  Step 2: Creating tunnel '$TUNNEL_NAME'..."

# Check if tunnel already exists
EXISTING=$(cloudflared tunnel list -o json 2>/dev/null | grep -o "\"$TUNNEL_NAME\"" || true)
if [ -n "$EXISTING" ]; then
  echo "  ✓ Tunnel '$TUNNEL_NAME' already exists"
else
  cloudflared tunnel create "$TUNNEL_NAME"
  echo "  ✓ Tunnel created"
fi

# Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list -o json | python3 -c "
import json,sys
tunnels = json.load(sys.stdin)
for t in tunnels:
    if t['name'] == '$TUNNEL_NAME':
        print(t['id'])
        break
")

echo "  Tunnel ID: $TUNNEL_ID"

# 4. Create config
CLOUDFLARED_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CLOUDFLARED_DIR/config-aios.yml"

cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CLOUDFLARED_DIR/$TUNNEL_ID.json

ingress:
  - service: http://localhost:3456
EOF

echo "  ✓ Config saved to $CONFIG_FILE"

# 5. Set up DNS (if hostname provided)
if [ -n "$HOSTNAME" ]; then
  echo ""
  echo "  Step 3: Setting up DNS for $HOSTNAME..."
  cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>/dev/null && \
    echo "  ✓ DNS route created: $HOSTNAME" || \
    echo "  ⚠ DNS route may already exist for $HOSTNAME"

  FINAL_URL="https://$HOSTNAME"
else
  echo ""
  echo "  ⚠ No custom domain specified."
  echo "  You can add one later:"
  echo "    cloudflared tunnel route dns $TUNNEL_NAME your.domain.com"
  FINAL_URL="(use quick tunnel or add a domain)"
fi

# 6. Save tunnel info for start-remote.sh
TUNNEL_INFO_FILE="$(cd "$(dirname "$0")" && pwd)/.tunnel-config"
cat > "$TUNNEL_INFO_FILE" << EOF
TUNNEL_NAME=$TUNNEL_NAME
TUNNEL_ID=$TUNNEL_ID
CONFIG_FILE=$CONFIG_FILE
HOSTNAME=$HOSTNAME
EOF

echo ""
echo "  ─────────────────────────────────"
echo "  ✓ Setup complete!"
echo ""
echo "  URL: $FINAL_URL"
echo ""
echo "  Next steps:"
echo "    1. Run: npm run remote"
echo "    2. Or auto-start: ./install-autostart.sh"
echo ""
