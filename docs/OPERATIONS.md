# Operations Runbook

This runbook describes the production layout currently used by
`simulation.micutu.com`. Application deploys and infrastructure changes are
separate procedures on purpose.

## Production Layout

| Item | Live value |
| --- | --- |
| Application checkout | `/srv/canary/simulation.micutu.com/project` |
| Backend service | `simulation-canary.service` |
| Backend listener | `127.0.0.1:8094` |
| Frontend document root | `/srv/canary/simulation.micutu.com/project/frontend/dist` |
| Runtime environment | `/etc/simulation/simulation.env` (root-owned, mode `0600`) |
| Grid/history state | `/srv/canary/simulation.micutu.com/project/state` |
| Backend logs | `/srv/canary/simulation.micutu.com/project/logs` |
| Deploy backups | `/srv/backups/simulation/deploy-<UTC timestamp>` |

Public traffic follows Cloudflare Tunnel/proxy → Nginx → the loopback-only
Drogon backend. Do not infer the live layout from a development checkout.

## Checks Before a Deploy

Run checks from a clean reviewed commit:

```bash
make preflight
make check
make security-audit
```

`make check` performs an isolated backend configure/build/test plus `npm ci`,
frontend tests, dependency audit, lint, and the production build. The security
audit checks tracked secret patterns, loopback exposure, systemd hardening,
Cloudflare origin protection, live headers and non-mutating API validation. A
valid forecast calculation is skipped by default because it consumes backend
capacity; enable it explicitly with `ALLOW_EXPENSIVE_PROBES=1`.

The deploy preflight permits commits ahead of `origin/main`, but rejects a
behind/diverged branch, all tracked changes, and all untracked files. It also
requires the deployment to run from the configured live checkout.

## Application Deploy

Make the reviewed commit available in the live checkout, then deploy there:

```bash
cd /srv/canary/simulation.micutu.com/project
git status --short --branch
scripts/deploy.sh
```

The script:

1. validates the live checkout, service, secret-file metadata and host tools;
2. creates a fresh backend build under `/tmp` and runs CTest;
3. runs frontend tests/audit/lint and builds into a sibling staging directory;
4. backs up the current backend binary plus grid/history snapshots;
5. atomically swaps the backend binary and frontend directory;
6. restarts only `simulation-canary.service`;
7. verifies local readiness, exact backend Git SHA, public APIs/assets/headers,
   both WebSocket handshakes, service state and restart count;
8. retains the previous frontend build in the timestamped backup.

If any post-swap step fails or the script receives `SIGINT`/`SIGTERM`, it stops
the backend, restores the binary, frontend and schema-coupled state, then starts
the previous release. The script never installs or reloads Nginx or systemd
configuration.

Optional overrides are `BUILD_JOBS`, `DOMAIN`, `BACKEND_PORT`,
`BACKEND_SERVICE`, `SIM_LIVE_ROOT`, and `SIM_BACKUP_ROOT`. Defaults match the
table above.

## Infrastructure Changes

Treat Nginx, systemd, logrotate and Cloudflare changes as separate maintenance.
Back up the live files first. Never reload Nginx until its complete live
configuration passes `nginx -t`.

### systemd backend unit

Validate the candidate units before installing them:

```bash
cd /srv/canary/simulation.micutu.com/project
systemd-analyze verify "$PWD/deploy/simulation-canary.service"
```

Create a timestamped backup, install, revalidate and reload:

```bash
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/srv/backups/simulation/infra-${stamp}"
sudo install -d -m 0700 "$backup"
sudo cp -a /etc/systemd/system/simulation-canary.service "$backup/"
sudo install -m 0644 deploy/simulation-canary.service /etc/systemd/system/simulation-canary.service
sudo systemd-analyze verify /etc/systemd/system/simulation-canary.service
sudo systemctl daemon-reload
sudo systemctl restart simulation-canary.service
```

Then verify:

```bash
systemctl is-active simulation-canary.service
systemctl show simulation-canary.service -p Type -p WatchdogUSec -p NRestarts \
  -p ProtectSystem -p ProtectHome -p ReadWritePaths -p NoNewPrivileges -p OnFailure
systemd-analyze security simulation-canary.service
curl -fsS https://simulation.micutu.com/api/readyz
```

### Nginx

The vhost depends on the global Cloudflare real-IP/origin map. Inspect the full
configuration before changing either file:

```bash
sudo nginx -T
```

After backing up the current vhost and security-header snippet, install the
candidate files, validate, and only then reload:

```bash
sudo install -m 0644 deploy/nginx/snippets/simulation-security-headers.conf \
  /etc/nginx/snippets/simulation-security-headers.conf
sudo install -m 0644 deploy/nginx/simulation.micutu.com.conf \
  /etc/nginx/sites-enabled/simulation.micutu.com
sudo nginx -t
sudo systemctl reload nginx.service
```

If `nginx -t` fails, restore the backups immediately and run `nginx -t` again;
do not reload the invalid configuration.

### Log rotation

```bash
sudo install -m 0644 deploy/logrotate/weather-backend /etc/logrotate.d/weather-backend
sudo logrotate -d /etc/logrotate.d/weather-backend
```

The source file may be group-writable in a collaborative checkout; the
installed file must be root-owned and mode `0644` or stricter.

## Cloudflare Origin Guard

After changing Nginx, tunnel routing, or trusted proxy ranges, verify both
paths:

```bash
curl -fsS -D - -o /dev/null https://simulation.micutu.com/
origin_ip="$(ip -4 route get 1.1.1.1 | awk '{print $7; exit}')"
curl -k -sS -o /dev/null -w '%{http_code}\n' \
  --resolve "simulation.micutu.com:443:${origin_ip}" \
  https://simulation.micutu.com/
```

The Cloudflare path should return `200`; a direct-origin request should return
`403` or fail before HTTP. Never trust `CF-Connecting-IP` from an origin path
that is not restricted to Cloudflare.

## Smoke Tests

```bash
curl -fsS https://simulation.micutu.com/api/healthz
curl -fsS https://simulation.micutu.com/api/readyz
curl -fsS https://simulation.micutu.com/api/version
curl -fsS https://simulation.micutu.com/api/metrics
curl -fsS -D - -o /dev/null https://simulation.micutu.com/
systemctl is-active simulation-canary.service
journalctl -u simulation-canary.service --since '-10 minutes' --no-pager
```

Use `scripts/security-audit.sh` for method, header, direct-origin and mutation
validation. Its default probes do not alter shared simulation state.

## Monitoring and Alerting

The backend uses `Type=notify` and `WatchdogSec=30`. It announces readiness and
pings the watchdog from the event loop; a hung loop is restarted even if the
process has not crashed.

A monitor on the same VPS cannot report total host/network failure, so an
external uptime monitor should check
`https://simulation.micutu.com/api/readyz` every 1–5 minutes.

After correcting a sustained failure:

```bash
sudo systemctl reset-failed simulation-canary.service
sudo systemctl start simulation-canary.service
```

### Optional failure email

The supplied alert unit sends to `ALERT_EMAIL` through SMTP on
`127.0.0.1:25`. Do not wire `OnFailure` until that transport is present and
verified. Once it is available, install the alert unit and the explicit
drop-in:

```bash
sudo install -m 0644 deploy/weather-backend-alert.service \
  /etc/systemd/system/weather-backend-alert.service
sudo install -d -m 0755 /etc/systemd/system/simulation-canary.service.d
sudo install -m 0644 deploy/simulation-canary-alert.conf \
  /etc/systemd/system/simulation-canary.service.d/alert.conf
sudo systemd-analyze verify \
  /etc/systemd/system/simulation-canary.service \
  /etc/systemd/system/weather-backend-alert.service
sudo systemctl daemon-reload
systemctl show simulation-canary.service -p OnFailure
```

Do not start the alert service as a routine test: with `ALERT_EMAIL` configured,
that sends an external message. If no local SMTP transport exists, leave the
drop-in uninstalled and rely on the external readiness monitor.

### Optional Prometheus textfile export

`weather-metrics.timer` can export backend availability, tick/time/speed,
WebSocket clients, uptime and OWM assimilation counters every 30 seconds. Do
not enable it merely because something listens on port 9100: first verify that
the intended node_exporter responds, has the textfile collector enabled, and
can see the same host directory used by `TEXTFILE_DIR`.

The supplied unit defaults to
`/var/lib/prometheus/node-exporter/weather_backend.prom`. Once that exact
directory is configured in the intended exporter:

```bash
sudo install -m 0644 deploy/weather-metrics.service /etc/systemd/system/weather-metrics.service
sudo install -m 0644 deploy/weather-metrics.timer /etc/systemd/system/weather-metrics.timer
sudo systemd-analyze verify \
  /etc/systemd/system/weather-metrics.service \
  /etc/systemd/system/weather-metrics.timer
sudo systemctl daemon-reload
sudo systemctl enable --now weather-metrics.timer
```

Verify the generated file and the actual scrape endpoint before considering the
pipeline operational. On a shared VPS, do not couple this project silently to
another application's Docker volume or Prometheus instance.

## Persistence

The backend writes `state/grid.snapshot` every 60 seconds and at clean shutdown.
History is persisted during clean shutdown. The loader validates the snapshot
format and bounds before accepting it. Files are mode `0600` and are included
with the binary in deployment rollback backups.

To reset the world deliberately, stop the service and move the snapshot to a
timestamped recovery name instead of deleting it:

```bash
sudo systemctl stop simulation-canary.service
mv /srv/canary/simulation.micutu.com/project/state/grid.snapshot \
  /srv/canary/simulation.micutu.com/project/state/grid.snapshot.reset-backup
sudo systemctl start simulation-canary.service
```

## Manual Application Rollback

The deploy script rolls back automatically on verification failure. For a
later manual rollback, select a known backup under `/srv/backups/simulation`,
stop the service, preserve the current release, restore the binary and state,
then atomically exchange a staged copy of `frontend-dist`. Verify health and
version before discarding either release. Do not restore state while the
backend is running.

Infrastructure rollback is separate: restore the exact timestamped config,
run `systemd-analyze verify` or `nginx -t`, then perform `daemon-reload`/service
restart or Nginx reload as appropriate.

## Known Security Boundary

Origin checks, content-type enforcement and rate limits constrain browser and
resource abuse, but an `Origin` header is not authentication. Global mutation
endpoints remain a shared-world capability until the product policy chooses
operator-only authentication or per-session simulation isolation. Do not put a
static operator token in the public frontend bundle.
