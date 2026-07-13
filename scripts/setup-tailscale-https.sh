#!/usr/bin/env bash
# Expose AiCoach on https://<machine>.<tailnet>.ts.net:3001 via Tailscale HTTPS.
# Prerequisites: MagicDNS + HTTPS certificates enabled in Tailscale admin console.
#
# Usage on the Pi:
#   chmod +x scripts/setup-tailscale-https.sh
#   ./scripts/setup-tailscale-https.sh
#
# Then set in .env:
#   APP_URL=https://pi.tailfa75f0.ts.net:3001
#   CLIENT_URL=https://pi.tailfa75f0.ts.net:3001

set -euo pipefail

PORT="${PORT:-3001}"
LOCAL="http://127.0.0.1:${PORT}"

echo "Configuring Tailscale HTTPS serve on port ${PORT} -> ${LOCAL}"
tailscale serve --bg --https="${PORT}" "${LOCAL}"
echo ""
tailscale serve status
echo ""
echo "Open: https://$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\.$//'):${PORT}"
echo "Register OAuth redirect URI:"
echo "  https://YOUR-MACHINE.${TAILNET_NAME:-your-tailnet}.ts.net:${PORT}/api/integrations/oauth/callback"
