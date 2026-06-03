#!/usr/bin/env bash
# deploy.sh — pull latest from GitHub, rebuild frontend if needed, restart backend
set -euo pipefail

PROJ="/home/dodl/splitpass"
FE="$PROJ/frontend"
BE="$PROJ/backend"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

cd "$PROJ"

# ── 1. Pull from GitHub ────────────────────────────────────────────────────
yellow "► Pulling latest from GitHub..."
git fetch origin main

# Check which files changed between current HEAD and origin/main
CHANGED=$(git diff --name-only HEAD origin/main)

if [ -z "$CHANGED" ]; then
  green "✓ Already up to date. Nothing to deploy."
  exit 0
fi

echo "$CHANGED"
git pull origin main
green "✓ Pull complete."

# ── 2. Backend — install deps if package.json changed ─────────────────────
if echo "$CHANGED" | grep -q "^backend/package"; then
  yellow "► Backend dependencies changed — running npm install..."
  cd "$BE" && npm install --omit=dev
  green "✓ Backend deps installed."
fi

# ── 3. Backend — run prisma migrate if schema changed ─────────────────────
if echo "$CHANGED" | grep -q "^backend/prisma/schema.prisma"; then
  yellow "► Prisma schema changed — running migrations..."
  cd "$BE" && npx prisma migrate deploy
  green "✓ Prisma migrations applied."
fi

# ── 4. Frontend — install deps if package.json changed ────────────────────
if echo "$CHANGED" | grep -q "^frontend/package"; then
  yellow "► Frontend dependencies changed — running npm install..."
  cd "$FE" && npm install
  green "✓ Frontend deps installed."
fi

# ── 5. Frontend — rebuild if any src files changed ────────────────────────
if echo "$CHANGED" | grep -qE "^frontend/src/|^frontend/public/|^frontend/package"; then
  yellow "► Frontend source changed — building..."
  cd "$FE" && npm run build
  green "✓ Frontend built."
fi

# ── 6. Restart backend via PM2 ────────────────────────────────────────────
yellow "► Restarting backend..."
cd "$BE"
if pm2 list | grep -q "splitpass\|server"; then
  pm2 restart all
else
  pm2 start src/server.js --name splitpass
fi
green "✓ Backend restarted."

# ── 7. Done ───────────────────────────────────────────────────────────────
echo ""
green "🚀 Deploy complete!"
pm2 status
