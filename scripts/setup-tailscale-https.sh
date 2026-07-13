#!/usr/bin/env bash
# Expose AiCoach on https://<machine>.<tailnet>.ts.net:3001 via Tailscale HTTPS.
#
# IMPORTANT: Tailscale binds the PUBLIC port (3001). Node must use a different INTERNAL port (3002).
#   Public:  https://pi.tailfa75f0.ts.net:3001  (Tailscale HTTPS)
#   Node:    http://127.0.0.1:3002             (PM2 / npm start)
#
# Prerequisites: MagicDNS + HTTPS certificates enabled in Tailscale admin console.

set -euo pipefail

PUBLIC_PORT="${PUBLIC_PORT:-3001}"
INTERNAL_PORT="${INTERNAL_PORT:-3002}"

echo "Tailscale HTTPS :${PUBLIC_PORT} -> Node http://127.0.0.1:${INTERNAL_PORT}"
tailscale serve --bg --https="${PUBLIC_PORT}" "http://127.0.0.1:${INTERNAL_PORT}"
echo ""
tailscale serve status
echo ""
echo "Add to .env:"
echo "  PORT=${INTERNAL_PORT}"
echo "  APP_URL=https://YOUR-MACHINE.your-tailnet.ts.net:${PUBLIC_PORT}"
echo "  CLIENT_URL=https://YOUR-MACHINE.your-tailnet.ts.net:${PUBLIC_PORT}"
echo ""
echo "Then: npm run build && pm2 restart aicoach"
