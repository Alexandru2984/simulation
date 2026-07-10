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

## Monitoring and Alerting

The backend runs as `Type=notify` with `WatchdogSec=30`: it signals READY on
startup and pings the systemd watchdog from its event loop every 10 s. A hung
event loop therefore triggers an automatic restart even while the process is
still alive — `Restart=always` alone only covers crashes. Verify with:

```bash
systemctl show weather-backend.service -p Type -p WatchdogUSec
journalctl -u weather-backend.service | rg -i watchdog
```

Nothing on the VPS can alert about the VPS itself being down. Point an
external uptime monitor (healthchecks.io or UptimeRobot, both have free
tiers) at:

```
https://simulation.micutu.com/api/readyz
```

with a 1–5 minute interval and email alerts. `/api/readyz` returns 503 until
the simulation threads tick, so it catches "process up but sim wedged" cases
that `/api/healthz` would miss.

### Email on Failure

`weather-backend.service` carries `StartLimitIntervalSec=300` /
`StartLimitBurst=10` and `OnFailure=weather-backend-alert.service`. A
sustained crashloop (or repeated watchdog kills) exhausts the start limit,
systemd stops restarting, and the alert unit mails `ALERT_EMAIL` (from
`.env`) through the local mailcow on `localhost:25`. After fixing the cause:

```bash
sudo systemctl reset-failed weather-backend.service
sudo systemctl start weather-backend.service
```

Test the mail path any time with:

```bash
sudo systemctl start weather-backend-alert.service
```

### Prometheus

`weather-metrics.timer` runs `scripts/export-metrics.sh` every 30 s, writing
`/var/lib/prometheus/node-exporter/weather_backend.prom`
(`weather_backend_up`, `_tick`, `_sim_time_seconds`, `_sim_speed`,
`_ws_clients`, `_uptime_seconds`). The host's node_exporter serves the
textfile collector via the drop-in installed from
`deploy/node-exporter/textfile-collector.conf`, so the existing Prometheus
scraping :9100 picks these up with no extra configuration. Suggested alert
rule on the Prometheus side:

```yaml
- alert: WeatherBackendDown
  expr: weather_backend_up == 0 or absent(weather_backend_up)
  for: 3m
  annotations:
    summary: weather backend on simulation.micutu.com is down or unscraped
```

`weather_backend_tick` should increase monotonically; `rate() == 0` while
`weather_backend_up == 1` means the sim thread is wedged (the systemd
watchdog should catch that first).

## Grid State Persistence

The backend snapshots the grid to `state/grid.snapshot` every 60 s and on
clean shutdown, and restores it at startup, so deploys and restarts keep the
simulated world (override the path with `SIM_STATE_FILE`). Snapshots are
validated and clamped on load; a corrupt or truncated file is ignored and the
sim starts fresh. To reset the world deliberately:

```bash
sudo systemctl stop weather-backend.service
rm -f /home/micu/simulation/state/grid.snapshot
sudo systemctl start weather-backend.service
```

## Mutation Rate Limits

Mutating endpoints are limited twice: per-IP in nginx (`sim_inject` 10 r/m,
`sim_api` 30 r/m) and globally in the backend via token buckets (inject
60/min, seed 120/min, speed 20/min → HTTP 429). The global budgets bound
distributed abuse of the shared world; raise the constants in
`GridController.cc` / `SeedController.cc` if legitimate traffic ever hits
them.

## Rollback

Systemd and Nginx backups should be timestamped before live changes:

```bash
sudo cp /etc/systemd/system/weather-backend.service /etc/systemd/system/weather-backend.service.bak-$(date -u +%Y%m%dT%H%M%SZ)
sudo cp /etc/nginx/sites-enabled/simulation.micutu.com /etc/nginx/backups/simulation.micutu.com.bak-$(date -u +%Y%m%dT%H%M%SZ)
```

Restore by copying the backup over the live file, then running `sudo nginx -t && sudo systemctl reload nginx` or `sudo systemctl daemon-reload && sudo systemctl restart weather-backend`.
