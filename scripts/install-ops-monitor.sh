#!/usr/bin/env bash
set -Eeuo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run this installer with sudo/root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/production-env.sh"

ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"
if [ ! -f "${ENV_FILE}" ]; then
  echo "ENV_FILE not found: ${ENV_FILE}" >&2
  exit 1
fi

RUNTIME_DIR="$(production_env_default "${OPS_RUNTIME_DIR:-}" "${ENV_FILE}" OPS_RUNTIME_DIR /root/daoyou/runtime)"
OPENRESTY_LOG_DIR="$(production_env_default "${OPENRESTY_LOG_DIR:-}" "${ENV_FILE}" OPENRESTY_LOG_DIR)"
INSTALL_OPENRESTY_LOGROTATE="$(production_env_default "${INSTALL_OPENRESTY_LOGROTATE:-}" "${ENV_FILE}" INSTALL_OPENRESTY_LOGROTATE 1)"
INSTALL_JOURNAL_LIMIT="$(production_env_default "${INSTALL_JOURNAL_LIMIT:-}" "${ENV_FILE}" INSTALL_JOURNAL_LIMIT 1)"
JOURNAL_SYSTEM_MAX_USE="$(production_env_default "${JOURNAL_SYSTEM_MAX_USE:-}" "${ENV_FILE}" JOURNAL_SYSTEM_MAX_USE 500M)"
JOURNAL_RUNTIME_MAX_USE="$(production_env_default "${JOURNAL_RUNTIME_MAX_USE:-}" "${ENV_FILE}" JOURNAL_RUNTIME_MAX_USE 200M)"

mkdir -p "${RUNTIME_DIR}"
chmod 0755 "${RUNTIME_DIR}"
chmod +x \
  "${SCRIPT_DIR}/collect-ops-status.sh" \
  "${SCRIPT_DIR}/cleanup-app-images.sh" \
  "${SCRIPT_DIR}/reopen-openresty-logs.sh"

cat >/etc/systemd/system/daoyou-ops-collector.service <<EOF
[Unit]
Description=WanJie Daoyou host operations snapshot
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
Environment=ENV_FILE=${ENV_FILE}
ExecStart=${SCRIPT_DIR}/collect-ops-status.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
EOF

cat >/etc/systemd/system/daoyou-ops-collector.timer <<'EOF'
[Unit]
Description=Collect WanJie Daoyou host operations snapshot every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
AccuracySec=30s
Unit=daoyou-ops-collector.service

[Install]
WantedBy=timers.target
EOF

chmod 0644 \
  /etc/systemd/system/daoyou-ops-collector.service \
  /etc/systemd/system/daoyou-ops-collector.timer

if [ "${INSTALL_JOURNAL_LIMIT}" = "1" ]; then
  mkdir -p /etc/systemd/journald.conf.d
  cat >/etc/systemd/journald.conf.d/90-daoyou-limits.conf <<EOF
[Journal]
SystemMaxUse=${JOURNAL_SYSTEM_MAX_USE}
RuntimeMaxUse=${JOURNAL_RUNTIME_MAX_USE}
EOF
  chmod 0644 /etc/systemd/journald.conf.d/90-daoyou-limits.conf
  systemctl restart systemd-journald
  echo "Installed journald limits: system=${JOURNAL_SYSTEM_MAX_USE}, runtime=${JOURNAL_RUNTIME_MAX_USE}"
fi

if [ "${INSTALL_OPENRESTY_LOGROTATE}" = "1" ] && [ -n "${OPENRESTY_LOG_DIR}" ]; then
  if [ ! -d "${OPENRESTY_LOG_DIR}" ]; then
    echo "Configured OPENRESTY_LOG_DIR does not exist: ${OPENRESTY_LOG_DIR}" >&2
    exit 1
  fi
  LOGROTATE_BIN="$(command -v logrotate || true)"
  if [ -z "${LOGROTATE_BIN}" ]; then
    echo "logrotate is required when OpenResty rotation is enabled." >&2
    exit 1
  fi

  cat >/etc/logrotate.d/daoyou-openresty <<EOF
"${OPENRESTY_LOG_DIR}"/*.log {
    daily
    rotate 7
    maxsize 100M
    compress
    delaycompress
    missingok
    notifempty
    dateext
    sharedscripts
    postrotate
        ${SCRIPT_DIR}/reopen-openresty-logs.sh >/dev/null 2>&1 || true
    endscript
}
EOF
  chmod 0644 /etc/logrotate.d/daoyou-openresty

  cat >/etc/systemd/system/daoyou-openresty-logrotate.service <<EOF
[Unit]
Description=WanJie Daoyou OpenResty log rotation

[Service]
Type=oneshot
ExecStart=${LOGROTATE_BIN} /etc/logrotate.d/daoyou-openresty
EOF

  cat >/etc/systemd/system/daoyou-openresty-logrotate.timer <<'EOF'
[Unit]
Description=Check WanJie Daoyou OpenResty logs hourly

[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
AccuracySec=5min
Unit=daoyou-openresty-logrotate.service

[Install]
WantedBy=timers.target
EOF
  chmod 0644 \
    /etc/systemd/system/daoyou-openresty-logrotate.service \
    /etc/systemd/system/daoyou-openresty-logrotate.timer
else
  echo "OpenResty file-log rotation not installed. Configure OPENRESTY_LOG_DIR to enable it."
fi

ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/collect-ops-status.sh"

systemctl daemon-reload
systemctl enable --now daoyou-ops-collector.timer
if [ -f /etc/systemd/system/daoyou-openresty-logrotate.timer ]; then
  systemctl enable --now daoyou-openresty-logrotate.timer
fi

echo "Installed: daoyou-ops-collector.timer"
systemctl list-timers daoyou-ops-collector.timer --no-pager || true
