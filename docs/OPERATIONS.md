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

The gate is GitHub Actions (`.github/workflows/ci.yml`). Every push to `main`
runs these jobs:

| Job | What it proves |
| --- | --- |
| Backend | Builds and tests on `ubuntu:26.04` with Drogon 1.9.11, the production OS and framework release |
| Backend tests under ASan + UBSan | No memory errors, leaks or undefined behaviour in the test suite |
| Frontend | `npm audit`, unit tests, lint and the production build |
| End-to-end | The repo's nginx vhost (TLS stripped) in front of the CI-built backend and frontend, driven by Playwright on desktop and phone viewports. It covers real 404s, cache headers, security headers, hidden operator endpoints, mutation guards, binary streaming, injection, search and the mobile sheet |

**Release order:** commit → the maintainer pushes → CI is green for that exact
commit → `scripts/deploy.sh`. The deploy preflight enforces this. It refuses
when HEAD is not exactly the pushed tip of `origin/main`, or when the `CI`
workflow has no successful run for that SHA (still running, failed, cancelled
or never run). It also refuses any tracked or untracked change in the checkout
and requires running from the configured live checkout. The host needs an
authenticated `gh` CLI for the CI lookup.

The same checks run locally, without touching the live site:

```bash
make preflight
make check            # backend build/test, npm ci/audit/test/lint, build into .tmp/frontend-dist
make e2e              # nginx + backend + browser (needs nginx, python3, Playwright Chromium)
make security-audit
```

The Makefile never writes `frontend/dist`. nginx serves that directory live
from this checkout, so a plain `npm run build` in `frontend/` would publish
instantly and non-atomically. Only `scripts/deploy.sh` replaces it, via a
staging directory and `mv --exchange`.

`make check` performs an isolated backend configure/build/test plus `npm ci`,
frontend tests, dependency audit, lint, and the production build. The security
audit checks tracked secret patterns, loopback exposure, systemd hardening,
Cloudflare origin protection, live headers and non-mutating API validation. A
valid forecast calculation is skipped by default because it consumes backend
capacity; enable it explicitly with `ALLOW_EXPENSIVE_PROBES=1`.


## Application Deploy

Once CI is green for the pushed commit, bring the live checkout to it and
deploy there:

```bash
cd /srv/canary/simulation.micutu.com/project
git pull --ff-only
gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)"   # must show success
scripts/deploy.sh
```

The script:

1. checks that HEAD is the pushed tip with a green CI run, then validates the
   live checkout, service, secret-file metadata and host tools;
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

`sites-enabled/simulation.micutu.com` is a symlink to
`sites-available/simulation.micutu.com`. Install over the target, not the link:
`install` would replace the symlink with a regular file and leave the two copies
out of sync.

After backing up the current vhost and security-header snippet, install the
candidate files, validate, and only then reload:

```bash
ts="$(date -u +%Y%m%dT%H%M%SZ)"
sudo cp -a /etc/nginx/sites-available/simulation.micutu.com "/root/simulation.micutu.com.nginx.${ts}"
sudo cp -a /etc/nginx/snippets/simulation-security-headers.conf "/root/simulation-security-headers.${ts}"
sudo install -m 0644 deploy/nginx/snippets/simulation-security-headers.conf \
  /etc/nginx/snippets/simulation-security-headers.conf
sudo install -m 0644 deploy/nginx/simulation.micutu.com.conf \
  /etc/nginx/sites-available/simulation.micutu.com
sudo nginx -t && sudo systemctl reload nginx.service
```

Keep backups outside `sites-available/`. A `*.bak*` file there is harmless
only as long as nothing includes `sites-available/*`.

What the vhost enforces:

- `/` is the only HTML page (app state lives in the URL hash). Unknown paths
  get a real `404` with `404.html`, so crawlers never see soft-404s.
- Caching: `/assets/` (content-hashed) for a year, immutable. Textures, icons,
  favicon and `og-image.jpg` for a week with `stale-while-revalidate`. The
  manifest for a day, `robots.txt` and `sitemap.xml` for an hour. `index.html`
  and `404.html` are `no-cache`.
- `gzip` for CSS/JS/JSON/SVG/XML/manifest. The global config only covers
  `text/html`.
- `/api/metrics` and `/api/version` return `404` publicly, because they
  reveal the build SHA, build time and uptime. `scripts/deploy.sh` and
  `scripts/export-metrics.sh` read them on `127.0.0.1:8094`.
- Rate-limited requests get `429` rather than `503`. Dotfiles are never served.
- Every location that sets its own header re-includes the security-header
  snippet, because nginx drops server-level `add_header` in such locations.

To test a candidate vhost without touching the system nginx, run a private
instance as an unprivileged user. Strip the TLS lines, listen on a high port,
point it at a local backend, then probe with `curl` and a browser.

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
curl -fsS http://127.0.0.1:8094/api/version   # operator-only, 404 publicly
curl -fsS http://127.0.0.1:8094/api/metrics   # operator-only, 404 publicly
curl -fsS -D - -o /dev/null https://simulation.micutu.com/
systemctl is-active simulation-canary.service
journalctl -u simulation-canary.service --since '-10 minutes' --no-pager
```

Use `scripts/security-audit.sh` for method, header, direct-origin and mutation
validation. Its default probes do not alter shared simulation state.

## Capacity

Measured on this VPS on 2026-11-01. The test backend had production limits
(`LimitNOFILE=4096`, 4 I/O threads) and was driven by
`scripts/load/ws-load.mjs` for 20 s per step:

| Viewers | Format | Frames delivered | Egress | Backend CPU | RSS |
|---|---|---|---|---|---|
| 1000 | GSB1 | 100 % | 37 MB/s | 0.12 cores | 35 MB |
| 2000 | GSB1 | 100 % | 73 MB/s | 0.21 cores | 46 MB |
| 1000 | **GSB2** | 100 % | **7.9 MB/s** | 0.07 cores | 34 MB |
| 2000 | **GSB2** | 100 % | 17 MB/s | 0.14 cores | 57 MB |
| 3500 | **GSB2** | 100 % | 28 MB/s | 0.23 cores | 81 MB |

The backend is not the bottleneck. In order, the real limits are:

1. **Egress bandwidth:** ~8 KB/s per viewer, about 64 Mbit/s at the default
   cap of 1000.
2. **nginx `worker_connections`:** currently 768 × 10 workers, shared by every
   vhost. Each viewer holds 2 connections there (client + upstream). Raising
   it to 4096 in `/etc/nginx/nginx.conf` is a host-wide change; schedule it
   with the other sites in mind.
3. **`SIM_WS_MAX_CLIENTS`:** default 1000, with `LimitNOFILE` above it.

Clients that stop reading are closed within `SIM_WS_IDLE_SECONDS` (30 s). A
test with 300 such clients saw every one evicted and RSS stay flat. The
legacy formats get a tenth of the slots, because a deliberately slow client
on JSON would buffer 10× more per second than on GSB2.

Re-run the measurement against a **test** backend, never production:

```bash
SIM_WS_MAX_CLIENTS=5000 SIM_ALLOWED_ORIGIN=http://127.0.0.1:18443 PORT_BACKEND=18094 \
  OPENWEATHER_API_KEY=x OPENWEATHER_BASE_URL=http://127.0.0.1:18095 \
  prlimit --nofile=4096:4096 .tmp/backend-build/weather_backend &
node scripts/load/ws-load.mjs --url 'ws://127.0.0.1:18094/ws/grid?format=bin2' \
  --origin http://127.0.0.1:18443 --clients 1000 --ramp 250 --duration 20 --pid $!
```

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
