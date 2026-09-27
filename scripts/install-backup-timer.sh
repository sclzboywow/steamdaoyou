#!/usr/bin/env bash
set -Eeuo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run this installer with sudo/root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"
SERVICE_FILE="/etc/systemd/system/daoyou-postgres-backup.service"
TIMER_FILE="/etc/systemd/system/daoyou-postgres-backup.timer"

cat >"${SERVICE_FILE}" <<EOF
[Unit]
Description=WanJie Daoyou PostgreSQL backup
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
Environment=ENV_FILE=${ENV_FILE}
ExecStart=${SCRIPT_DIR}/backup-production.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
EOF

cat >"${TIMER_FILE}" <<'EOF'
[Unit]
Description=Daily WanJie Daoyou PostgreSQL backup

[Timer]
OnCalendar=*-*-* 03:30:00 Asia/Shanghai
Persistent=true
RandomizedDelaySec=15m
Unit=daoyou-postgres-backup.service

[Install]
WantedBy=timers.target
EOF

chmod 0644 "${SERVICE_FILE}" "${TIMER_FILE}"
chmod +x "${SCRIPT_DIR}/backup-production.sh"
systemctl daemon-reload
systemctl enable --now daoyou-postgres-backup.timer

echo "Installed: daoyou-postgres-backup.timer"
systemctl list-timers daoyou-postgres-backup.timer --no-pager || true
