#!/usr/bin/env bash
# Free ports and restart AiCoach under PM2 (run from repo root on the Pi).
set -euo pipefail

INTERNAL_PORT="${INTERNAL_PORT:-3002}"
PUBLIC_PORT="${PUBLIC_PORT:-3001}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Step 1: Stop PM2 completely (stops crash loop) ==="
pm2 kill 2>/dev/null || true
sleep 2

echo "=== Step 2: Free ports ${INTERNAL_PORT} and ${PUBLIC_PORT} ==="
for P in "$INTERNAL_PORT" "$PUBLIC_PORT"; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${P}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -t -i:"${P}" 2>/dev/null || true)
    [ -n "$PIDS" ] && kill -9 $PIDS 2>/dev/null || true
  fi
done
sleep 1

echo "=== Step 3: What is still using the ports? ==="
ss -tlnp 2>/dev/null | grep -E ":${INTERNAL_PORT}|:${PUBLIC_PORT}" || echo "(ports look free for Node — ${PUBLIC_PORT} may be held by Tailscale, which is OK)"

echo "=== Step 4: Build ==="
npm run build

echo "=== Step 5: Start PM2 (Node on ${INTERNAL_PORT}) ==="
pm2 start ecosystem.config.cjs
pm2 save

sleep 2
echo "=== Step 6: Health check ==="
if curl -sf "http://127.0.0.1:${INTERNAL_PORT}/api/health" >/dev/null; then
  echo "OK — Node running on http://127.0.0.1:${INTERNAL_PORT}"
else
  echo "FAILED — run: pm2 logs aicoach --lines 30"
  exit 1
fi

echo ""
echo "If using Tailscale HTTPS, ensure:"
echo "  tailscale serve --bg --https=${PUBLIC_PORT} http://127.0.0.1:${INTERNAL_PORT}"
echo "  .env has PORT=${INTERNAL_PORT} and APP_URL=https://your-pi.ts.net:${PUBLIC_PORT}"
pm2 status aicoach
