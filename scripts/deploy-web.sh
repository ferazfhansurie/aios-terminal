#!/bin/bash
# Deploy AIOS web to bisnesgpt server
# Usage: ./scripts/deploy-web.sh [--server] [--frontend] [--all]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER="bisnesgpt"
REMOTE_DIR="~/aios-web"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

deploy_frontend() {
  echo -e "${BLUE}[1/3] Building frontend...${NC}"
  cd "$ROOT_DIR"
  npm run build:web 2>&1 | tail -5

  echo -e "${BLUE}[2/3] Cleaning remote dist...${NC}"
  ssh "$SERVER" "rm -rf $REMOTE_DIR/dist/assets/* $REMOTE_DIR/dist/index.html $REMOTE_DIR/dist/favicon.png 2>/dev/null; true"

  echo -e "${BLUE}[3/3] Deploying dist...${NC}"
  scp -r "$ROOT_DIR/web/dist/"* "$SERVER:$REMOTE_DIR/dist/"

  echo -e "${GREEN}Frontend deployed!${NC}"
}

deploy_server() {
  echo -e "${BLUE}Deploying server files...${NC}"

  # Copy server TS files
  scp "$ROOT_DIR/web/server.ts" "$SERVER:$REMOTE_DIR/server.ts"
  scp "$ROOT_DIR/web/whatsapp.ts" "$SERVER:$REMOTE_DIR/whatsapp.ts"
  scp "$ROOT_DIR/web/package.json" "$SERVER:$REMOTE_DIR/package.json"

  # Install deps if package.json changed
  ssh "$SERVER" "cd $REMOTE_DIR && npm install --production 2>&1 | tail -3"

  # Restart
  ssh "$SERVER" "pm2 restart aios-web"

  echo -e "${GREEN}Server deployed and restarted!${NC}"
}

case "${1:---all}" in
  --frontend|-f)
    deploy_frontend
    ;;
  --server|-s)
    deploy_server
    ;;
  --all|-a|*)
    deploy_frontend
    deploy_server
    ;;
esac

echo -e "${GREEN}Done! Check https://aios.jutateknologi.com${NC}"
