#!/usr/bin/env bash
# Export weather backend metrics as a node_exporter textfile (.prom).
# Runs from weather-metrics.timer; writes atomically (tmp + rename).
set -euo pipefail

out_dir="${TEXTFILE_DIR:-/var/lib/prometheus/node-exporter}"
out_file="${out_dir}/weather_backend.prom"
backend="http://127.0.0.1:${BACKEND_PORT:-8094}"

tmp="$(mktemp "${out_dir}/.weather_backend.prom.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

emit_help() {
    cat <<'EOF'
# HELP weather_backend_up Whether the backend answered /api/metrics.
# TYPE weather_backend_up gauge
# HELP weather_backend_tick Physics steps executed since start.
# TYPE weather_backend_tick counter
# HELP weather_backend_sim_time_seconds Simulated time elapsed.
# TYPE weather_backend_sim_time_seconds gauge
# HELP weather_backend_sim_speed Current simulation speed multiplier.
# TYPE weather_backend_sim_speed gauge
# HELP weather_backend_ws_clients Connected grid WebSocket clients.
# TYPE weather_backend_ws_clients gauge
# HELP weather_backend_uptime_seconds Backend process uptime.
# TYPE weather_backend_uptime_seconds gauge
# HELP weather_backend_assimilation_last_success_unixtime Last accepted OWM observation time.
# TYPE weather_backend_assimilation_last_success_unixtime gauge
# HELP weather_backend_assimilation_accepted_total Accepted OWM observations since process start.
# TYPE weather_backend_assimilation_accepted_total counter
# HELP weather_backend_assimilation_upstream_failures_total Failed OWM requests since process start.
# TYPE weather_backend_assimilation_upstream_failures_total counter
# HELP weather_backend_assimilation_validation_failures_total Rejected OWM payloads since process start.
# TYPE weather_backend_assimilation_validation_failures_total counter
# HELP weather_backend_client_errors_total Browser error reports accepted since process start.
# TYPE weather_backend_client_errors_total counter
# HELP weather_backend_client_errors_rejected_total Malformed or foreign error reports refused.
# TYPE weather_backend_client_errors_rejected_total counter
# HELP weather_backend_client_errors_rate_limited_total Error reports dropped by the global budget.
# TYPE weather_backend_client_errors_rate_limited_total counter
# HELP weather_backend_client_errors_distinct Distinct browser errors currently tracked.
# TYPE weather_backend_client_errors_distinct gauge
EOF
}

if json="$(curl -fsS --max-time 5 "${backend}/api/metrics" 2>/dev/null)"; then
    {
        emit_help
        echo "weather_backend_up 1"
        jq -r '
            "weather_backend_tick \(.tick)",
            "weather_backend_sim_time_seconds \(.simTime)",
            "weather_backend_sim_speed \(.simSpeed)",
            "weather_backend_ws_clients \(.wsClients)",
            "weather_backend_uptime_seconds \(.uptimeSeconds)",
            "weather_backend_assimilation_last_success_unixtime \(.assimilationLastSuccessUnix)",
            "weather_backend_assimilation_accepted_total \(.assimilationAccepted)",
            "weather_backend_assimilation_upstream_failures_total \(.assimilationUpstreamFailures)",
            "weather_backend_assimilation_validation_failures_total \(.assimilationValidationFailures)",
            "weather_backend_client_errors_total \(.clientErrorsReceived // 0)",
            "weather_backend_client_errors_rejected_total \(.clientErrorsRejected // 0)",
            "weather_backend_client_errors_rate_limited_total \(.clientErrorsRateLimited // 0)",
            "weather_backend_client_errors_distinct \(.clientErrorsDistinct // 0)"
        ' <<<"$json"
    } > "$tmp"
else
    { emit_help; echo "weather_backend_up 0"; } > "$tmp"
fi

chmod 0644 "$tmp"
mv "$tmp" "$out_file"
