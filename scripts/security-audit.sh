#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

domain="${DOMAIN:-simulation.micutu.com}"
service="${BACKEND_SERVICE:-weather-backend.service}"
backend_port="${BACKEND_PORT:-8094}"

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

if [[ -f .env ]]; then
    env_mode="$(stat -c '%a' .env)"
    env_owner="$(stat -c '%U:%G' .env)"
    if [[ "$env_mode" == "600" || "$env_mode" == "400" ]]; then
        pass ".env permissions are restrictive (${env_mode} ${env_owner})"
    else
        fail ".env permissions are too broad (${env_mode} ${env_owner})"
    fi
else
    warn ".env not present; runtime secret checks skipped"
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

    [[ "$protect_system" == "strict" ]] && pass "ProtectSystem=strict" || fail "ProtectSystem=${protect_system}"
    [[ "$protect_home" == "read-only" ]] && pass "ProtectHome=read-only" || fail "ProtectHome=${protect_home}"
    [[ "$no_new_privs" == "yes" ]] && pass "NoNewPrivileges=yes" || fail "NoNewPrivileges=${no_new_privs}"
    [[ "$umask_value" == "0077" ]] && pass "UMask=0077" || fail "UMask=${umask_value}"
    [[ "$read_write_paths" == *"${repo_root}/logs"* ]] && pass "ReadWritePaths includes ${repo_root}/logs" || fail "ReadWritePaths=${read_write_paths}"
else
    fail "systemd service not found: ${service}"
fi

section "Nginx and Cloudflare origin guard"
if sudo nginx -t >/dev/null; then
    pass "nginx config validates"
else
    fail "nginx config validation failed"
fi

if sudo nginx -T 2>/dev/null | rg -q '\$from_cloudflare_origin = 0'; then
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

for header in strict-transport-security content-security-policy x-frame-options x-content-type-options referrer-policy permissions-policy; do
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
[[ "$no_origin_status" == "403" ]] && pass "mutation without Origin is rejected" || fail "mutation without Origin returned ${no_origin_status}"

bad_type_status="$(http_code -X POST -H "Origin: https://${domain}" --data '{"value":1}' "https://${domain}/api/weather/speed")"
[[ "$bad_type_status" == "415" ]] && pass "mutation without JSON content type is rejected" || fail "mutation without JSON content type returned ${bad_type_status}"

json_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"value":1}' "https://${domain}/api/weather/speed")"
[[ "$json_status" == "200" ]] && pass "same-origin JSON mutation succeeds" || fail "same-origin JSON mutation returned ${json_status}"

invalid_json_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"value":' "https://${domain}/api/weather/speed")"
[[ "$invalid_json_status" == "400" ]] && pass "invalid mutation JSON is rejected" || fail "invalid mutation JSON returned ${invalid_json_status}"

missing_field_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{}' "https://${domain}/api/weather/speed")"
[[ "$missing_field_status" == "400" ]] && pass "mutation missing required field is rejected" || fail "mutation missing required field returned ${missing_field_status}"

forecast_no_origin_status="$(http_code -X POST -H 'Content-Type: application/json' --data '{"steps":10}' "https://${domain}/api/grid/forecast")"
[[ "$forecast_no_origin_status" == "403" ]] && pass "forecast POST without Origin is rejected" || fail "forecast POST without Origin returned ${forecast_no_origin_status}"

forecast_bad_type_status="$(http_code -X POST -H "Origin: https://${domain}" --data '{"steps":10}' "https://${domain}/api/grid/forecast")"
[[ "$forecast_bad_type_status" == "415" ]] && pass "forecast POST without JSON content type is rejected" || fail "forecast POST without JSON content type returned ${forecast_bad_type_status}"

forecast_json_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"steps":10}' "https://${domain}/api/grid/forecast")"
[[ "$forecast_json_status" == "200" ]] && pass "same-origin JSON forecast succeeds" || fail "same-origin JSON forecast returned ${forecast_json_status}"

forecast_invalid_json_status="$(http_code -X POST -H "Origin: https://${domain}" -H 'Content-Type: application/json' --data '{"steps":' "https://${domain}/api/grid/forecast")"
[[ "$forecast_invalid_json_status" == "400" ]] && pass "invalid forecast JSON is rejected" || fail "invalid forecast JSON returned ${forecast_invalid_json_status}"

for method in TRACE PUT DELETE PATCH; do
    root_method_status="$(http_code -X "$method" "https://${domain}/")"
    api_method_status="$(http_code -X "$method" "https://${domain}/api/healthz")"
    [[ "$root_method_status" == "405" ]] && pass "${method} / is rejected" || fail "${method} / returned ${root_method_status}"
    [[ "$api_method_status" == "405" ]] && pass "${method} /api/healthz is rejected" || fail "${method} /api/healthz returned ${api_method_status}"
done

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
