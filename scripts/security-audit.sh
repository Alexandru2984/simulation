#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

domain="${DOMAIN:-simulation.micutu.com}"
service="${BACKEND_SERVICE:-simulation-canary.service}"
backend_port="${BACKEND_PORT:-8094}"
live_root="${SIM_LIVE_ROOT:-/srv/canary/simulation.micutu.com/project}"
env_file="${SIM_ENV_FILE:-/etc/simulation/simulation.env}"

failures=0
warnings=0

section() {
    printf '\n==> %s\n' "$1"
}

pass() {
    printf '[PASS] %s\n' "$1"
}

warn() {
    warnings=$((warnings + 1))
    printf '[WARN] %s\n' "$1"
}

fail() {
    failures=$((failures + 1))
    printf '[FAIL] %s\n' "$1"
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        fail "missing required command: $1"
        return 1
    fi
}

expect_equal() {
    local actual=$1
    local expected=$2
    local success=$3
    local failure=$4
    if [[ "$actual" == "$expected" ]]; then
        pass "$success"
    else
        fail "${failure}${actual}"
    fi
}

http_code() {
    curl -k -sS -o /dev/null -w '%{http_code}' --connect-timeout 8 "$@" || true
}

section "Tooling"
for cmd in awk curl git ip npm rg ss stat systemctl; do
    require_cmd "$cmd" || true
done

section "Tracked secrets"
sensitive_paths="$(git ls-files | rg -i '(^|/)(\.env(\.|$)|.*\.pem$|.*\.p12$|.*\.pfx$|.*\.key$|id_rsa$|id_ed25519$|credentials?(\.|/|$)|secrets?(\.|/|$))' || true)"
if [[ -n "$sensitive_paths" ]]; then
    fail "tracked sensitive-looking paths found:"
    printf '%s\n' "$sensitive_paths"
else
    pass "no tracked env/private-key/credential filenames"
fi

secret_matches="$(git grep -Il -E 'BEGIN (RSA |OPENSSH |EC |DSA |)PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk-[A-Za-z0-9]{20,}' -- . ':!frontend/package-lock.json' || true)"
if [[ -n "$secret_matches" ]]; then
    fail "tracked high-confidence secret patterns found in:"
    printf '%s\n' "$secret_matches"
else
    pass "no high-confidence secret values in tracked files"
fi

if sudo test -f "$env_file"; then
    env_mode="$(sudo stat -c '%a' "$env_file")"
    env_owner="$(sudo stat -c '%U:%G' "$env_file")"
    if [[ "$env_mode" == "600" || "$env_mode" == "400" ]]; then
        pass "runtime environment permissions are restrictive (${env_mode} ${env_owner})"
    else
        fail "runtime environment permissions are too broad (${env_mode} ${env_owner})"
    fi
else
    fail "runtime environment file is missing: ${env_file}"
fi

section "Backend exposure"
if ss -ltnp | rg -q "127\\.0\\.0\\.1:${backend_port}\\b"; then
    pass "backend listens on 127.0.0.1:${backend_port}"
else
    fail "backend is not listening on 127.0.0.1:${backend_port}"
fi

if ss -ltnp | rg -q "(0\\.0\\.0\\.0|\\*)\\:${backend_port}\\b"; then
    fail "backend port ${backend_port} is exposed on a wildcard address"
else
    pass "backend port ${backend_port} is not exposed on wildcard IPv4"
fi

section "systemd hardening"
if systemctl show "$service" >/dev/null 2>&1; then
    protect_system="$(systemctl show "$service" -P ProtectSystem)"
    protect_home="$(systemctl show "$service" -P ProtectHome)"
    no_new_privs="$(systemctl show "$service" -P NoNewPrivileges)"
    umask_value="$(systemctl show "$service" -P UMask)"
    read_write_paths="$(systemctl show "$service" -P ReadWritePaths)"
    bind_paths="$(systemctl show "$service" -P BindPaths)"

    expect_equal "$protect_system" strict "ProtectSystem=strict" "ProtectSystem="
    expect_equal "$protect_home" read-only "ProtectHome=read-only" "ProtectHome="
    expect_equal "$no_new_privs" yes "NoNewPrivileges=yes" "NoNewPrivileges="
    expect_equal "$umask_value" 0077 "UMask=0077" "UMask="
    if [[ "$read_write_paths" == *"${live_root}/logs"* ]]; then
        pass "ReadWritePaths includes ${live_root}/logs"
    else
        fail "ReadWritePaths=${read_write_paths}"
    fi
    if [[ "$read_write_paths" == *"${live_root}/state"* ]]; then
        pass "ReadWritePaths includes ${live_root}/state"
    else
        fail "ReadWritePaths is missing ${live_root}/state"
    fi
    if [[ -z "$bind_paths" ]]; then
        pass "no compatibility BindPaths remain"
    else
        fail "unexpected BindPaths remain: ${bind_paths}"
    fi

    service_type="$(systemctl show "$service" -P Type)"
    watchdog_usec="$(systemctl show "$service" -P WatchdogUSec)"
    expect_equal "$service_type" notify "Type=notify (watchdog-capable)" "Type should be notify; actual="
    if [[ -n "$watchdog_usec" && "$watchdog_usec" != "0" ]]; then
        pass "watchdog enabled (WatchdogUSec=${watchdog_usec})"
    else
        fail "watchdog disabled (WatchdogUSec=${watchdog_usec:-unset})"
    fi

    on_failure="$(systemctl show "$service" -P OnFailure)"
    if [[ "$on_failure" == *"weather-backend-alert.service"* ]]; then
        pass "OnFailure alert unit wired"
        if systemctl cat weather-backend-alert.service >/dev/null 2>&1; then
            pass "weather-backend-alert.service is installed"
        else
            fail "OnFailure references a missing weather-backend-alert.service"
        fi
        if ss -ltn | rg -q '(127\.0\.0\.1|\[::1\]):25\b'; then
            pass "local SMTP listener is available for failure alerts"
        else
            fail "OnFailure email is enabled but no loopback SMTP listener exists"
        fi
    else
        warn "optional OnFailure email alert is not enabled"
    fi
else
    fail "systemd service not found: ${service}"
fi

section "Nginx and Cloudflare origin guard"
if sudo nginx -t >/dev/null; then
    pass "nginx config validates"
else
    fail "nginx config validation failed"
fi

nginx_config="$(sudo nginx -T 2>/dev/null)"
if rg -q 'map[[:space:]]+\$realip_remote_addr[[:space:]]+\$from_cloudflare_origin' <<<"$nginx_config" &&
   rg -q 'set[[:space:]]+\$simulation_origin_allowed[[:space:]]+\$from_cloudflare_origin;' <<<"$nginx_config" &&
   rg -q 'if[[:space:]]*\(\$simulation_origin_allowed[[:space:]]*=[[:space:]]*0\)' <<<"$nginx_config"; then
    pass "live nginx config contains Cloudflare origin guard"
else
    fail "live nginx config is missing Cloudflare origin guard"
fi

headers="$(curl -fsS -D - -o /dev/null "https://${domain}/" || true)"
if printf '%s\n' "$headers" | rg -qi '^HTTP/2 200|^HTTP/1\\.[01] 200'; then
    pass "public site returns 200 through Cloudflare"
else
    fail "public site did not return 200 through Cloudflare"
fi

for header in strict-transport-security content-security-policy x-frame-options x-content-type-options referrer-policy permissions-policy cross-origin-opener-policy cross-origin-resource-policy; do
    if printf '%s\n' "$headers" | rg -qi "^${header}:"; then
        pass "header present: ${header}"
    else
        fail "missing security header: ${header}"
    fi
done

origin_ip="${ORIGIN_IP:-$(ip -4 route get 1.1.1.1 | awk '{print $7; exit}')}"
if [[ -n "$origin_ip" ]]; then
    origin_status="$(http_code --resolve "${domain}:443:${origin_ip}" "https://${domain}/")"
    if [[ "$origin_status" == "403" ]]; then
        pass "direct origin request to ${origin_ip} is rejected with 403"
    elif [[ "$origin_status" == "000" ]]; then
        pass "direct origin request to ${origin_ip} is blocked before HTTP"
    else
        fail "direct origin request to ${origin_ip} returned ${origin_status}"
    fi
else
    warn "could not determine origin IP for direct-origin test"
fi

section "Runtime API controls"
for endpoint in healthz readyz metrics version; do
    if curl -fsS "https://${domain}/api/${endpoint}" >/dev/null; then
        pass "/api/${endpoint} returns successfully"
    else
        fail "/api/${endpoint} failed"
    fi
done

no_origin_status="$(http_code -X POST -H 'Content-Type: application/json' --data '{"value":1}' "https://${domain}/api/weather/speed")"
expect_equal "$no_origin_status" 403 "mutation without Origin is rejected" "mutation without Origin returned "

bad_type_status="$(http_code -X POST -H "Origin: https://${domain}" --data '{"value":1}' "https://${domain}/api/weather/speed")"
expect_equal "$bad_type_status" 415 "mutation without JSON content type is rejected" "mutation without JSON content type returned "

range_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"value":0}' "https://${domain}/api/weather/speed")"
expect_equal "$range_status" 400 "out-of-range speed is rejected without changing simulation state" "out-of-range speed returned "

invalid_json_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"value":' "https://${domain}/api/weather/speed")"
expect_equal "$invalid_json_status" 400 "invalid mutation JSON is rejected" "invalid mutation JSON returned "

missing_field_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{}' "https://${domain}/api/weather/speed")"
expect_equal "$missing_field_status" 400 "mutation missing required field is rejected" "mutation missing required field returned "

forecast_no_origin_status="$(http_code -X POST -H 'Content-Type: application/json' --data '{"steps":10}' "https://${domain}/api/grid/forecast")"
expect_equal "$forecast_no_origin_status" 403 "forecast POST without Origin is rejected" "forecast POST without Origin returned "

forecast_bad_type_status="$(http_code -X POST -H "Origin: https://${domain}" --data '{"steps":10}' "https://${domain}/api/grid/forecast")"
expect_equal "$forecast_bad_type_status" 415 "forecast POST without JSON content type is rejected" "forecast POST without JSON content type returned "

if [[ "${ALLOW_EXPENSIVE_PROBES:-0}" == "1" ]]; then
    forecast_json_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"steps":1}' "https://${domain}/api/grid/forecast")"
    expect_equal "$forecast_json_status" 200 "same-origin JSON forecast succeeds" "same-origin JSON forecast returned "
else
    pass "valid forecast probe skipped (set ALLOW_EXPENSIVE_PROBES=1 to enable)"
fi

forecast_invalid_json_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"steps":' "https://${domain}/api/grid/forecast")"
expect_equal "$forecast_invalid_json_status" 400 "invalid forecast JSON is rejected" "invalid forecast JSON returned "

for method in TRACE PUT DELETE PATCH; do
    root_method_status="$(http_code -X "$method" "https://${domain}/")"
    api_method_status="$(http_code -X "$method" "https://${domain}/api/healthz")"
    expect_equal "$root_method_status" 405 "${method} / is rejected" "${method} / returned "
    expect_equal "$api_method_status" 405 "${method} /api/healthz is rejected" "${method} /api/healthz returned "
done

section "Metrics export"
if systemctl cat weather-metrics.timer >/dev/null 2>&1; then
    if systemctl is-active weather-metrics.timer >/dev/null 2>&1; then
        pass "weather-metrics.timer is active"
    else
        fail "weather-metrics.timer is installed but not active"
    fi

    prom_file="${WEATHER_PROM_FILE:-/var/lib/prometheus/node-exporter/weather_backend.prom}"
    if [[ -f "$prom_file" ]]; then
        prom_age=$(( $(date +%s) - $(stat -c %Y "$prom_file") ))
        if (( prom_age < 120 )); then
            pass "weather_backend.prom is fresh (${prom_age}s old)"
        else
            fail "weather_backend.prom is stale (${prom_age}s old)"
        fi
    else
        fail "weather_backend.prom is missing"
    fi

    exporter_url="${NODE_EXPORTER_URL:-http://127.0.0.1:9100/metrics}"
    if curl -fsS --max-time 3 "$exporter_url" 2>/dev/null | rg -q '^weather_backend_up 1'; then
        pass "node_exporter serves weather_backend_up 1"
    else
        fail "node_exporter does not expose weather_backend_up 1"
    fi
else
    warn "optional weather metrics timer is not installed"
fi

section "Dependency and host hygiene"
if (cd frontend && npm audit --audit-level=moderate >/dev/null); then
    pass "frontend npm audit passes at moderate threshold"
else
    fail "frontend npm audit found moderate-or-higher issues"
fi

tmp_inodes="$(df -Pi /tmp | awk 'NR==2 {gsub("%", "", $5); print $5}')"
if [[ -n "$tmp_inodes" && "$tmp_inodes" -lt 80 ]]; then
    pass "/tmp inode usage is below 80% (${tmp_inodes}%)"
else
    fail "/tmp inode usage is high (${tmp_inodes:-unknown}%)"
fi

section "Summary"
printf 'Failures: %d\n' "$failures"
printf 'Warnings: %d\n' "$warnings"

if [[ "$failures" -gt 0 ]]; then
    exit 1
fi
