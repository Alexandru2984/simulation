# Operations Runbook

## Local Checks

```bash
make preflight
make check
make security-audit
```

`make preflight` verifies the repository is clean for deploy, required runtime
secrets are present without printing their values, deploy assets exist, and host
commands are available.
`make check` runs backend configure/build/tests and frontend audit/lint/build.
`make security-audit` checks tracked secret patterns, runtime exposure, systemd
hardening, live headers, Cloudflare origin guard, API mutation controls, frontend
dependency audit, and `/tmp` inode pressure.

## Deploy Backend

```bash
cd /home/micu/simulation
cmake --build backend/build --target weather_backend -j$(nproc)
sudo systemctl restart weather-backend.service
curl -fsS https://simulation.micutu.com/api/healthz
curl -fsS https://simulation.micutu.com/api/readyz
```

## Full Deploy

```bash
cd /home/micu/simulation
scripts/deploy.sh
```

The script runs preflight checks, `make check`, builds backend/frontend, backs up
live systemd and Nginx config, validates Nginx and logrotate, restarts the
backend, reloads Nginx, then runs smoke tests.

## Deploy Frontend

```bash
cd /home/micu/simulation/frontend
npm ci
npm run build
curl -fsS -D - -o /dev/null https://simulation.micutu.com/ | rg -i 'content-security-policy|strict-transport-security'
```

## Apply Nginx Config

```bash
cd /home/micu/simulation
sudo cp deploy/nginx/snippets/simulation-security-headers.conf /etc/nginx/snippets/simulation-security-headers.conf
sudo cp deploy/nginx/simulation.micutu.com.conf /etc/nginx/sites-enabled/simulation.micutu.com
sudo nginx -t
sudo systemctl reload nginx.service
```

## Cloudflare Origin Guard

The HTTPS vhost rejects requests that do not arrive from Cloudflare IP ranges.
After changing Nginx or Cloudflare real-IP config, verify both paths:

```bash
curl -fsS -D - -o /dev/null https://simulation.micutu.com/
origin_ip="$(ip -4 route get 1.1.1.1 | awk '{print $7; exit}')"
curl -k -sS -o /dev/null -w '%{http_code}\n' \
  --resolve "simulation.micutu.com:443:${origin_ip}" \
  https://simulation.micutu.com/
```

The normal Cloudflare path should return `200`; the direct-origin request should
return `403`.

## Apply systemd Unit

```bash
cd /home/micu/simulation
sudo cp deploy/weather-backend.service /etc/systemd/system/weather-backend.service
sudo systemctl daemon-reload
sudo systemctl restart weather-backend.service
sudo systemctl show weather-backend.service -p ProtectSystem -p ProtectHome -p ReadWritePaths -p NoNewPrivileges
```

## Log Rotation

```bash
sudo cp deploy/logrotate/weather-backend /etc/logrotate.d/weather-backend
sudo logrotate -d /etc/logrotate.d/weather-backend
```

## Smoke Tests

```bash
curl -fsS https://simulation.micutu.com/api/metrics
curl -fsS https://simulation.micutu.com/api/healthz
curl -fsS https://simulation.micutu.com/api/readyz
curl -fsS https://simulation.micutu.com/api/version
curl -sS -D - -o - -X POST \
  -H 'Origin: https://simulation.micutu.com' \
  -H 'Content-Type: application/json' \
  --data '{"value":1}' \
  https://simulation.micutu.com/api/weather/speed
```

## Rollback

Systemd and Nginx backups should be timestamped before live changes:

```bash
sudo cp /etc/systemd/system/weather-backend.service /etc/systemd/system/weather-backend.service.bak-$(date -u +%Y%m%dT%H%M%SZ)
sudo cp /etc/nginx/sites-enabled/simulation.micutu.com /etc/nginx/backups/simulation.micutu.com.bak-$(date -u +%Y%m%dT%H%M%SZ)
```

Restore by copying the backup over the live file, then running `sudo nginx -t && sudo systemctl reload nginx` or `sudo systemctl daemon-reload && sudo systemctl restart weather-backend`.
