#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

live_root="${SIM_LIVE_ROOT:-/srv/canary/simulation.micutu.com/project}"
env_file="${SIM_ENV_FILE:-/etc/simulation/simulation.env}"
service="${BACKEND_SERVICE:-simulation-canary.service}"

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
if [[ -z "$(git status --porcelain --untracked-files=normal)" ]]; then
    pass "git worktree is clean, including untracked files"
else
    fail "git worktree has tracked or untracked changes"
fi

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
head_sha="$(git rev-parse HEAD)"

# A deploy ships exactly what CI verified: the pushed tip of the upstream
# branch, with a successful CI run for that very commit. Local-only or
# unverified commits never reach production.
ci_gate() {
    local workflow="${CI_WORKFLOW:-ci.yml}"
    local runs
    if ! runs="$(gh run list --commit "$head_sha" --workflow "$workflow" --event push \
                    --limit 20 --json databaseId,status,conclusion 2>&1)"; then
        fail "could not query GitHub Actions for ${head_sha:0:12}: ${runs}"
        return
    fi
    local green running
    green="$(jq -r '[.[] | select(.status == "completed" and .conclusion == "success")][0].databaseId // empty' <<<"$runs")"
    running="$(jq -r '[.[] | select(.status != "completed")] | length' <<<"$runs")"
    if [[ -n "$green" ]]; then
        pass "CI (${workflow}) is green for ${head_sha:0:12} (run ${green})"
    elif (( running > 0 )); then
        fail "CI (${workflow}) is still running for ${head_sha:0:12}; deploy after it turns green"
    elif [[ "$(jq 'length' <<<"$runs")" == "0" ]]; then
        fail "no CI (${workflow}) run exists for ${head_sha:0:12}; push it and wait for CI"
    else
        fail "CI (${workflow}) failed for ${head_sha:0:12}; fix it before deploying"
    fi
}

if [[ "${DEPLOY_MODE:-0}" == "1" ]]; then
    if ! git fetch --quiet origin 2>/dev/null; then
        fail "could not fetch origin to verify the commit being deployed"
    fi
    if [[ -z "$upstream" ]]; then
        fail "current branch has no upstream configured"
    elif [[ "$(git rev-parse "$upstream")" == "$head_sha" ]]; then
        pass "HEAD is exactly the pushed tip of ${upstream}"
    else
        fail "HEAD ${head_sha:0:12} is not the pushed tip of ${upstream}; push first, wait for CI, then deploy"
    fi
    ci_gate
elif [[ -n "$upstream" ]] && git merge-base --is-ancestor "$upstream" HEAD; then
    pass "HEAD contains upstream ${upstream}"
elif [[ -n "$upstream" ]]; then
    fail "HEAD is behind or diverged from upstream ${upstream}"
else
    fail "current branch has no upstream configured"
fi

if [[ "${DEPLOY_MODE:-0}" == "1" ]]; then
    if [[ "$(realpath "$repo_root")" == "$(realpath "$live_root")" ]]; then
        pass "deploy is running from the configured live checkout"
    else
        fail "deploy must run from ${live_root}; current checkout is ${repo_root}"
    fi
fi

section "Runtime secrets"
if ! sudo test -f "$env_file"; then
    fail "runtime environment file is missing: ${env_file}"
else
    mode="$(sudo stat -c '%a' "$env_file")"
    if (( (8#$mode & 8#077) == 0 )); then
        pass "runtime environment is not group/world readable (${mode})"
    else
        fail "runtime environment permissions are too broad (${mode})"
    fi

    if sudo awk -F= '
        $1 == "OPENWEATHER_API_KEY" && length($2) > 1 &&
        $2 != "YOUR_KEY_HERE" && $2 != "change-me" && $2 != "changeme" { found=1 }
        END { exit(found ? 0 : 1) }
    ' "$env_file"; then
        pass "OPENWEATHER_API_KEY is configured"
    else
        fail "OPENWEATHER_API_KEY is missing or still a placeholder"
    fi
fi

section "Deploy assets"
for path in \
    deploy/simulation-canary.service \
    deploy/nginx/simulation.micutu.com.conf \
    deploy/nginx/snippets/simulation-security-headers.conf \
    deploy/logrotate/weather-backend; do
    if [[ -f "$path" ]]; then
        pass "$path exists"
    else
        fail "$path is missing"
    fi
done

section "Host prerequisites"
for cmd in cmake cmp curl gh git jq mv npm realpath rg sudo systemctl; do
    if command -v "$cmd" >/dev/null 2>&1; then
        pass "command available: $cmd"
    else
        fail "missing command: $cmd"
    fi
done

if mv --help | rg -q -- '--exchange'; then
    pass "mv supports atomic directory exchange"
else
    fail "mv lacks --exchange support required for atomic frontend deploy"
fi

if [[ "${DEPLOY_MODE:-0}" == "1" ]]; then
    if systemctl show "$service" >/dev/null 2>&1; then
        pass "systemd service exists: ${service}"
        if systemctl is-active --quiet "$service"; then
            pass "systemd service is active: ${service}"
        else
            fail "systemd service is not active: ${service}"
        fi
    else
        fail "systemd service is missing: ${service}"
    fi
fi

section "Summary"
printf 'Failures: %d\n' "$failures"
if [[ "$failures" -gt 0 ]]; then
    exit 1
fi
