# Operations Runbook

## Local Checks

```bash
make check
```

Runs backend configure/build/tests and frontend audit/lint/build.

## Deploy Backend

```bash
cd /home/micu/simulation
cmake --build backend/build --target weather_backend -j$(nproc)
sudo systemctl restart weather-backend.service
curl -fsS https://simulation.micutu.com/api/healthz
curl -fsS https://simulation.micutu.com/api/readyz
```

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
