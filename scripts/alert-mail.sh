#!/usr/bin/env bash
# Send a failure alert through the local mail server (mailcow, localhost:25).
# Triggered by OnFailure= on weather-backend.service; recipient comes from
# ALERT_EMAIL in the environment (see EnvironmentFile in the alert unit).
set -euo pipefail

unit="${1:-weather-backend.service}"
rcpt="${ALERT_EMAIL:-}"
from="${ALERT_FROM:-weather-backend@micutu.com}"

if [[ -z "$rcpt" ]]; then
    echo "ALERT_EMAIL not set; skipping alert mail" >&2
    exit 0
fi

host="$(hostname -f 2>/dev/null || hostname)"
now="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
status="$(systemctl status "$unit" --no-pager -l 2>&1 | tail -25 || true)"

curl -sS --max-time 20 "smtp://127.0.0.1" \
    --mail-from "$from" --mail-rcpt "$rcpt" -T - <<EOF
From: Weather Backend <${from}>
To: ${rcpt}
Subject: [ALERT] ${unit} on ${host}

${unit} entered a failed state (or an alert test was run) at ${now}.

systemd has stopped restarting it; after fixing the cause, run:
  sudo systemctl reset-failed ${unit}
  sudo systemctl start ${unit}

Last status:
${status}
EOF
