#!/usr/bin/env bash
set -euo pipefail

PROJ="/var/www/splitsubs"
FE="$PROJ/frontend"
BE="$PROJ/backend"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

cd "$PROJ"

if [ -z "${DEPLOY_REEXEC:-}" ]; then
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

  # This script may have just overwritten itself (git reset --hard rewrites
  # deploy.sh along with everything else) while bash is still mid-execution.
  # Bash keeps interpreting the OLD buffered bytes in that case, which can
  # silently skip or corrupt every command after this point — that's what
  # happened on 2026-08-04, when a deploy.sh update landed in the same pull
  # as other changes and the new lint step + install command never ran.
  # Re-exec from the fresh file on disk, carrying the change list forward
  # via env var (recomputing it here would show "no diff" since HEAD now
  # equals origin/main), so everything below always runs the current script.
  export DEPLOY_REEXEC=1
  export DEPLOY_CHANGED="$CHANGED"
  exec bash "$PROJ/deploy.sh"
fi

CHANGED="$DEPLOY_CHANGED"

if echo "$CHANGED" | grep -q "^backend/package"; then
  yellow "► Installing backend deps..."
  cd "$BE" && npm install
fi

if echo "$CHANGED" | grep -q "^backend/prisma/schema.prisma"; then
  yellow "► Running migrations..."
  cd "$BE" && npx prisma migrate deploy
fi

yellow "► Linting backend..."
cd "$BE" && npm run lint
green "✓ Lint passed."

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
