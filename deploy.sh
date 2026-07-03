#!/usr/bin/env bash
set -euo pipefail

PROJ="/var/www/splitsubs"
FE="$PROJ/frontend"
BE="$PROJ/backend"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

cd "$PROJ"

yellow "► Pulling latest from GitHub..."
git fetch origin main
CHANGED=$(git diff --name-only HEAD origin/main)

if [ -z "$CHANGED" ]; then
  green "✓ Already up to date."
  exit 0
fi

echo "$CHANGED"

# Preserve .env then reset to latest
git checkout -- backend/.env 2>/dev/null || true
git reset --hard origin/main
git checkout -- backend/.env 2>/dev/null || true

green "✓ Pull complete."

if echo "$CHANGED" | grep -q "^backend/package"; then
  yellow "► Installing backend deps..."
  cd "$BE" && npm install --omit=dev
fi

if echo "$CHANGED" | grep -q "^backend/prisma/schema.prisma"; then
  yellow "► Running migrations..."
  cd "$BE" && npx prisma migrate deploy
fi

if echo "$CHANGED" | grep -q "^frontend/package"; then
  yellow "► Installing frontend deps..."
  cd "$FE" && npm install
fi

if echo "$CHANGED" | grep -qE "^frontend/src/|^frontend/public/|^frontend/package"; then
  yellow "► Building frontend..."
  cd "$FE" && npm run build
fi

yellow "► Restarting backend..."
pm2 restart splitsubs-api

echo ""
green "🚀 Deploy complete!"
pm2 status
