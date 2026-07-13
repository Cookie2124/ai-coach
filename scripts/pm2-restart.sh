#!/usr/bin/env bash
# Free port 3001 and restart AiCoach under PM2 (run from repo root on the Pi).
set -euo pipefail

PORT="${PORT:-3001}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Stopping PM2 aicoach..."
pm2 stop aicoach 2>/dev/null || true
sleep 2

echo "Checking port ${PORT}..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -t -i:"${PORT}" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Killing process(es) on port ${PORT}: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
  fi
else
  echo "Install fuser or lsof to auto-kill stale processes"
fi
sleep 1

echo "Building..."
npm run build

echo "Starting PM2..."
pm2 delete aicoach 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ""
pm2 status aicoach
echo ""
curl -sf "http://127.0.0.1:${PORT}/api/health" && echo " — health OK" || echo "Health check failed — run: pm2 logs aicoach"
