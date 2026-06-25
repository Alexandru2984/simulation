#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

domain="${DOMAIN:-simulation.micutu.com}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

echo "==> Running checks"
make check

echo "==> Building backend"
cmake --build backend/build --target weather_backend -j"$(nproc)"

echo "==> Building frontend"
(cd frontend && npm ci && npm run build)

echo "==> Backing up live config (${stamp})"
sudo mkdir -p /etc/nginx/backups
sudo cp /etc/systemd/system/weather-backend.service "/etc/systemd/system/weather-backend.service.bak-${stamp}"
sudo cp /etc/nginx/sites-enabled/simulation.micutu.com "/etc/nginx/backups/simulation.micutu.com.bak-${stamp}"

echo "==> Installing service and web server config"
sudo cp deploy/weather-backend.service /etc/systemd/system/weather-backend.service
sudo cp deploy/nginx/snippets/simulation-security-headers.conf /etc/nginx/snippets/simulation-security-headers.conf
sudo cp deploy/nginx/simulation.micutu.com.conf /etc/nginx/sites-enabled/simulation.micutu.com
sudo install -m 0644 deploy/logrotate/weather-backend /etc/logrotate.d/weather-backend

echo "==> Validating config"
sudo systemctl daemon-reload
sudo nginx -t
sudo logrotate -d /etc/logrotate.d/weather-backend >/dev/null

echo "==> Restarting backend and reloading nginx"
sudo systemctl restart weather-backend.service
sudo systemctl reload nginx.service

echo "==> Smoke tests"
curl -fsS "https://${domain}/api/healthz"
echo
curl -fsS "https://${domain}/api/readyz"
echo
curl -fsS "https://${domain}/api/metrics"
echo
curl -fsS "https://${domain}/api/version" | rg '"gitSha":'
echo
curl -fsS -D - -o /dev/null "https://${domain}/" | rg -i '^(strict-transport-security|content-security-policy|x-frame-options):'

echo "==> Deploy complete"
echo "Backups:"
echo "  /etc/systemd/system/weather-backend.service.bak-${stamp}"
echo "  /etc/nginx/backups/simulation.micutu.com.bak-${stamp}"
