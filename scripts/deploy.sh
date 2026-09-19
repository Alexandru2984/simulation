#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

domain="${DOMAIN:-simulation.micutu.com}"
service="${BACKEND_SERVICE:-simulation-canary.service}"
live_root="${SIM_LIVE_ROOT:-/srv/canary/simulation.micutu.com/project}"
backup_root="${SIM_BACKUP_ROOT:-/srv/backups/simulation}"
build_jobs="${BUILD_JOBS:-2}"
backend_port="${BACKEND_PORT:-8094}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/deploy-${stamp}"
backend_build="$(mktemp -d /tmp/simulation-deploy.XXXXXX)"
frontend_live="${live_root}/frontend/dist"
frontend_stage="${live_root}/frontend/.dist-next-${stamp}"
backend_live="${live_root}/backend/build/weather_backend"
backend_next="${live_root}/backend/build/weather_backend.next"
state_file="${live_root}/state/grid.snapshot"
history_file="${live_root}/state/history.snapshot"
rollback_required=0
backend_swapped=0
frontend_swapped=0

cleanup() {
    if [[ "$backend_build" == /tmp/simulation-deploy.* && -d "$backend_build" ]]; then
        rm -rf -- "$backend_build"
    fi
    if [[ "$frontend_stage" == "${live_root}/frontend/.dist-next-"* && -d "$frontend_stage" ]]; then
        rm -rf -- "$frontend_stage"
    fi
    rm -f -- "$backend_next"
}

rollback() {
    local rollback_failed=0

    printf '\n==> Deploy failed; restoring the previous release\n' >&2
    sudo systemctl stop "$service" || rollback_failed=1

    if (( frontend_swapped == 1 )) && [[ -d "$frontend_stage" && -d "$frontend_live" ]]; then
        mv --exchange --no-target-directory "$frontend_stage" "$frontend_live" || rollback_failed=1
    fi

    if (( backend_swapped == 1 )) && [[ -f "${backup_dir}/weather_backend" ]]; then
        sudo install -o micu -g micu -m 0755 "${backup_dir}/weather_backend" "${backend_live}.rollback" || rollback_failed=1
        sudo mv -f --no-target-directory "${backend_live}.rollback" "$backend_live" || rollback_failed=1
    fi

    if [[ -f "${backup_dir}/grid.snapshot" ]]; then
        sudo install -o micu -g micu -m 0600 "${backup_dir}/grid.snapshot" "$state_file" || rollback_failed=1
    elif [[ -f "${backup_dir}/grid.snapshot.absent" && -f "$state_file" ]]; then
        sudo unlink "$state_file" || rollback_failed=1
    fi
    if [[ -f "${backup_dir}/history.snapshot" ]]; then
        sudo install -o micu -g micu -m 0600 "${backup_dir}/history.snapshot" "$history_file" || rollback_failed=1
    elif [[ -f "${backup_dir}/history.snapshot.absent" && -f "$history_file" ]]; then
        sudo unlink "$history_file" || rollback_failed=1
    fi

    sudo systemctl start "$service" || rollback_failed=1
    if (( rollback_failed == 0 )); then
        printf 'Rollback completed. Backup retained at %s\n' "$backup_dir" >&2
    else
        printf 'ROLLBACK INCOMPLETE; inspect %s and %s immediately.\n' "$service" "$backup_dir" >&2
    fi
}

finish() {
    local result=$?
    trap - EXIT INT TERM
    if (( result != 0 && rollback_required == 1 )); then
        rollback
    fi
    cleanup
    exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_ready() {
    for _ in {1..30}; do
        if curl -fsS --max-time 2 "http://127.0.0.1:${backend_port}/api/readyz" >/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}

check_websocket() {
    local path=$1
    local status
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 --http1.1 \
        -H 'Connection: Upgrade' \
        -H 'Upgrade: websocket' \
        -H 'Sec-WebSocket-Version: 13' \
        -H 'Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==' \
        -H "Origin: https://${domain}" \
        "https://${domain}${path}" || true)"
    [[ "$status" == "101" ]]
}

echo "==> Preflight"
DEPLOY_MODE=1 SIM_LIVE_ROOT="$live_root" BACKEND_SERVICE="$service" scripts/preflight.sh

echo "==> Fresh backend build and tests"
cmake -S backend -B "$backend_build" -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build "$backend_build" -j"$build_jobs"
ctest --test-dir "$backend_build" --output-on-failure

echo "==> Frontend install, tests, audit, lint and staged build"
(cd frontend && npm ci --ignore-scripts)
(cd frontend && npm test)
(cd frontend && npm audit --audit-level=moderate)
(cd frontend && npm run lint)
(cd frontend && npm run build -- --outDir "$frontend_stage")
[[ -f "${frontend_stage}/index.html" ]]

echo "==> Backup current binary and schema-coupled state"
sudo install -d -o root -g root -m 0700 "$backup_dir"
sudo install -o root -g root -m 0755 "$backend_live" "${backup_dir}/weather_backend"
if [[ -f "$state_file" ]]; then
    sudo install -o root -g root -m 0600 "$state_file" "${backup_dir}/grid.snapshot"
else
    sudo touch "${backup_dir}/grid.snapshot.absent"
fi
if [[ -f "$history_file" ]]; then
    sudo install -o root -g root -m 0600 "$history_file" "${backup_dir}/history.snapshot"
else
    sudo touch "${backup_dir}/history.snapshot.absent"
fi

echo "==> Atomic release swap"
install -m 0755 "${backend_build}/weather_backend" "$backend_next"
mv -f --no-target-directory "$backend_next" "$backend_live"
backend_swapped=1
rollback_required=1
mv --exchange --no-target-directory "$frontend_stage" "$frontend_live"
frontend_swapped=1

echo "==> Restart only ${service}"
sudo systemctl reset-failed "$service" 2>/dev/null || true
sudo systemctl restart "$service"
wait_for_ready

echo "==> Local and public verification"
expected_sha="$(git rev-parse HEAD)"
version_json="$(curl -fsS --max-time 5 "http://127.0.0.1:${backend_port}/api/version")"
jq -e --arg sha "$expected_sha" '.gitSha == $sha and .dirty == false' <<<"$version_json" >/dev/null

curl -fsS --max-time 8 "https://${domain}/api/healthz" >/dev/null
curl -fsS --max-time 8 "https://${domain}/api/readyz" >/dev/null
curl -fsS --max-time 8 "https://${domain}/api/grid" >/dev/null

index_html="$(curl -fsS --max-time 8 "https://${domain}/")"
asset_path="$(rg -o 'src="/assets/[^"]+\.js"' <<<"$index_html" | sed -n '1{s/^src="//;s/"$//;p;}')"
[[ -n "$asset_path" ]]
curl -fsS --max-time 8 "https://${domain}${asset_path}" >/dev/null

headers="$(curl -fsS --max-time 8 -D - -o /dev/null "https://${domain}/")"
for header in strict-transport-security content-security-policy x-content-type-options referrer-policy permissions-policy; do
    rg -qi "^${header}:" <<<"$headers"
done

check_websocket /ws/weather
check_websocket /ws/grid

sleep 5
[[ "$(systemctl is-active "$service")" == "active" ]]
[[ "$(systemctl show "$service" -P NRestarts)" == "0" ]]

echo "==> Preserve previous frontend release in the backup"
sudo mv --no-target-directory "$frontend_stage" "${backup_dir}/frontend-dist"
frontend_swapped=0
rollback_required=0

echo "==> Deploy complete"
echo "Commit: ${expected_sha}"
echo "Backup: ${backup_dir}"
