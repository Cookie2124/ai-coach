/** PM2 config — use: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [{
    name: 'aicoach',
    cwd: './server',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 15,
    min_uptime: '5s',
    listen_timeout: 8000,
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'production',
      // Use 3002 when Tailscale HTTPS serves public port 3001 (see scripts/setup-tailscale-https.sh)
      PORT: '3002',
      LISTEN_HOST: '127.0.0.1',
    },
  }],
};
