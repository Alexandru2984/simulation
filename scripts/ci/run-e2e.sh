#!/usr/bin/env bash
# End-to-end check of the production topology, minus TLS and Cloudflare:
#
#   browser ──► nginx (deploy/nginx vhost, TLS stripped) ──► backend binary
#                    └─ serves the built frontend            └─► fake OpenWeather
#
# Usage: scripts/ci/run-e2e.sh <backend-binary> <frontend-dist> [playwright args...]
#
# Runs unprivileged on high ports and never touches the system nginx. The
# vhost is used as-is apart from the substitutions in render_vhost(); if the
# vhost gains a directive this script cannot rewrite safely, it fails loudly.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ $# -ge 2 ]] || { echo "usage: $0 <backend-binary> <frontend-dist> [playwright args...]" >&2; exit 2; }
backend_bin="$(realpath "$1")"
dist="$(realpath "$2")"
shift 2

web_port="${E2E_WEB_PORT:-18443}"
backend_port="${E2E_BACKEND_PORT:-18094}"
owm_port="${E2E_OWM_PORT:-18095}"
nginx_bin="${NGINX_BIN:-$(command -v nginx || echo /usr/sbin/nginx)}"
artifacts="${E2E_ARTIFACTS:-${repo_root}/e2e/stack-logs}"
work="$(mktemp -d "${TMPDIR:-/tmp}/sim-e2e.XXXXXX")"
pids=()

[[ -x "$backend_bin" ]] || { echo "backend binary not executable: $backend_bin" >&2; exit 2; }
[[ -f "$dist/index.html" ]] || { echo "no index.html in $dist" >&2; exit 2; }

cleanup() {
    local status=$?
    if [[ -f "$work/nginx/nginx.pid" ]]; then
        "$nginx_bin" -p "$work/nginx" -c "$work/nginx/nginx.conf" -s quit 2>/dev/null || true
    fi
    for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
    wait 2>/dev/null || true
    mkdir -p "$artifacts"
    cp -f "$work"/*.log "$work"/nginx/logs/*.log "$work/nginx/vhost.conf" "$artifacts/" 2>/dev/null || true
    rm -rf -- "$work"
    exit "$status"
}
trap cleanup EXIT

render_vhost() {
    # Drop the :80 redirect server, strip TLS, use high ports, the built dist,
    # repo snippets and private logs. Rate limits are raised because every
    # request comes from 127.0.0.1; the limits themselves are not under test.
    awk 'BEGIN { skip = 0 }
         /^server \{/ && !seen++ { skip = 1 }
         skip && /^\}/ { skip = 0; next }
         !skip' "$repo_root/deploy/nginx/simulation.micutu.com.conf" |
    sed -e "s#listen 443 ssl;#listen 127.0.0.1:${web_port};#" \
        -e '/listen \[::\]:443 ssl;/d' \
        -e '/http2 on;/d' \
        -e '/^[[:space:]]*ssl_/d' \
        -e "s#root /srv/canary/simulation.micutu.com/project/frontend/dist;#root ${dist};#" \
        -e "s#/etc/nginx/snippets/#${repo_root}/deploy/nginx/snippets/#g" \
        -e "s#/var/log/nginx/simulation-canary#${work}/nginx/logs/sim#g" \
        -e "s#127.0.0.1:8094#127.0.0.1:${backend_port}#g" \
        -e 's#rate=[0-9]*r/m#rate=6000r/m#g'
}

wait_for() {
    local url=$1 deadline=$((SECONDS + 45))
    until curl -fsS -o /dev/null "$url"; do
        if (( SECONDS > deadline )); then echo "timed out waiting for $url" >&2; return 1; fi
        sleep 0.5
    done
}

echo "==> fake OpenWeather on :${owm_port}"
python3 "$repo_root/e2e/fake-openweather.py" "$owm_port" >"$work/fake-openweather.log" 2>&1 &
pids+=($!)

echo "==> backend on :${backend_port}"
env PORT_BACKEND="$backend_port" \
    OPENWEATHER_API_KEY=e2e-test-key \
    OPENWEATHER_BASE_URL="http://127.0.0.1:${owm_port}" \
    SIM_ALLOWED_ORIGIN="http://127.0.0.1:${web_port}" \
    SIM_STATE_FILE="$work/grid.snapshot" \
    SIM_HISTORY_FILE="$work/history.snapshot" \
    "$backend_bin" >"$work/backend.log" 2>&1 &
pids+=($!)

echo "==> nginx on :${web_port} with deploy/nginx/simulation.micutu.com.conf"
mkdir -p "$work/nginx/logs" "$work/nginx/tmp"
render_vhost >"$work/nginx/vhost.conf"
if grep -nE '/etc/|/var/|ssl|:443|:8094' "$work/nginx/vhost.conf"; then
    echo "the vhost has directives run-e2e.sh cannot rewrite; update render_vhost()" >&2
    exit 1
fi
user_line=""
[[ "$(id -u)" == "0" ]] && user_line="user root root;"
cat >"$work/nginx/nginx.conf" <<EOF
${user_line}
worker_processes 1;
pid ${work}/nginx/nginx.pid;
error_log ${work}/nginx/logs/error.log warn;
events { worker_connections 256; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    access_log off;
    client_body_temp_path ${work}/nginx/tmp/body;
    proxy_temp_path ${work}/nginx/tmp/proxy;
    fastcgi_temp_path ${work}/nginx/tmp/fastcgi;
    uwsgi_temp_path ${work}/nginx/tmp/uwsgi;
    scgi_temp_path ${work}/nginx/tmp/scgi;
    # Production defines this map from Cloudflare's ranges
    # (/etc/nginx/conf.d/cloudflare-origin-guard.conf); here only loopback is "Cloudflare".
    geo \$remote_addr \$from_cloudflare_origin { default 0; 127.0.0.1 1; }
    include ${work}/nginx/vhost.conf;
}
EOF
"$nginx_bin" -t -q -p "$work/nginx" -c "$work/nginx/nginx.conf"
"$nginx_bin" -p "$work/nginx" -c "$work/nginx/nginx.conf"

wait_for "http://127.0.0.1:${web_port}/api/readyz"
echo "==> stack ready; running Playwright"

cd "$repo_root/e2e"
E2E_BASE_URL="http://127.0.0.1:${web_port}" npx playwright test "$@"
