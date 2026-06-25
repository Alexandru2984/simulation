#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

failures=0

fail() {
    failures=$((failures + 1))
    printf '[FAIL] %s\n' "$1"
}

pass() {
    printf '[PASS] %s\n' "$1"
}

section() {
    printf '\n==> %s\n' "$1"
}

section "Repository state"
if [[ "${ALLOW_DIRTY_DEPLOY:-0}" == "1" ]]; then
    pass "dirty deploy override enabled"
else
    if git diff --quiet --ignore-submodules HEAD -- && git diff --cached --quiet --ignore-submodules; then
        pass "git worktree is clean"
    else
        fail "git worktree has uncommitted changes; commit them or set ALLOW_DIRTY_DEPLOY=1"
    fi
fi

section "Runtime secrets"
if [[ ! -f .env ]]; then
    fail ".env is missing"
else
    mode="$(stat -c '%a' .env)"
    if (( (8#$mode & 8#077) == 0 )); then
        pass ".env is not group/world readable (${mode})"
    else
        fail ".env permissions are too broad (${mode})"
    fi

    if rg -q '^OPENWEATHER_API_KEY=[^[:space:]#][^[:space:]]+' .env &&
       ! rg -q '^OPENWEATHER_API_KEY=(YOUR_KEY_HERE|change-me|changeme)$' .env; then
        pass "OPENWEATHER_API_KEY is configured"
    else
        fail "OPENWEATHER_API_KEY is missing or still a placeholder"
    fi
fi

section "Deploy assets"
for path in \
    deploy/weather-backend.service \
    deploy/nginx/simulation.micutu.com.conf \
    deploy/nginx/snippets/simulation-security-headers.conf \
    deploy/logrotate/weather-backend; do
    [[ -f "$path" ]] && pass "$path exists" || fail "$path is missing"
done

section "Host prerequisites"
for cmd in cmake curl git npm rg sudo systemctl; do
    if command -v "$cmd" >/dev/null 2>&1; then
        pass "command available: $cmd"
    else
        fail "missing command: $cmd"
    fi
done

section "Summary"
printf 'Failures: %d\n' "$failures"
if [[ "$failures" -gt 0 ]]; then
    exit 1
fi
