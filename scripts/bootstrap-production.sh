#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/production-env.sh"

ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"
INFRA_COMPOSE_FILE="${INFRA_COMPOSE_FILE:-${SCRIPT_DIR}/docker-compose.infrastructure.yml}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "ENV_FILE not found: ${ENV_FILE}" >&2
  echo "Copy deploy/production/production.env.example and fill secrets first." >&2
  exit 1
fi

for command in docker mkdir; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Required command not found: ${command}" >&2
    exit 1
  }
done

APP_NETWORK="$(production_env_default "${APP_NETWORK:-}" "${ENV_FILE}" APP_NETWORK daoyou-runtime)"
API_DOMAIN="$(production_env_default "${API_DOMAIN:-}" "${ENV_FILE}" API_DOMAIN)"
BLUE_PORT="$(production_env_default "${BLUE_PORT:-}" "${ENV_FILE}" BLUE_PORT 3000)"
UPSTREAM_CONF="$(production_env_default "${UPSTREAM_CONF:-}" "${ENV_FILE}" UPSTREAM_CONF)"
BACKUP_DIR="$(production_env_default "${BACKUP_DIR:-}" "${ENV_FILE}" BACKUP_DIR /root/daoyou/backups)"
OPS_RUNTIME_DIR="$(production_env_default "${OPS_RUNTIME_DIR:-}" "${ENV_FILE}" OPS_RUNTIME_DIR /root/daoyou/runtime)"

if [ -z "${UPSTREAM_CONF}" ] && [ -n "${API_DOMAIN}" ]; then
  UPSTREAM_CONF="/opt/1panel/www/sites/${API_DOMAIN}/upstream/daoyou_backend.conf"
fi

if [ "${EUID}" -eq 0 ]; then
  PRIVILEGED=()
elif command -v sudo >/dev/null 2>&1; then
  PRIVILEGED=(sudo)
else
  echo "Run as root or install sudo." >&2
  exit 1
fi

if ! docker network inspect "${APP_NETWORK}" >/dev/null 2>&1; then
  docker network create "${APP_NETWORK}" >/dev/null
  echo "Created Docker network: ${APP_NETWORK}"
fi

echo "==> Starting PostgreSQL / Redis / NATS"
docker compose \
  --env-file "${ENV_FILE}" \
  -f "${INFRA_COMPOSE_FILE}" \
  -p daoyou-infra \
  up -d --wait

"${PRIVILEGED[@]}" mkdir -p "${BACKUP_DIR}" "${OPS_RUNTIME_DIR}"

if [ -n "${UPSTREAM_CONF}" ]; then
  "${PRIVILEGED[@]}" mkdir -p "$(dirname "${UPSTREAM_CONF}")"
  if [ ! -f "${UPSTREAM_CONF}" ]; then
    printf 'server 127.0.0.1:%s;\n' "${BLUE_PORT}" | \
      "${PRIVILEGED[@]}" tee "${UPSTREAM_CONF}" >/dev/null
    echo "Created OpenResty blue/green upstream: ${UPSTREAM_CONF}"
  else
    echo "Keeping existing OpenResty upstream: ${UPSTREAM_CONF}"
  fi
fi

if command -v systemctl >/dev/null 2>&1 && [ "${INSTALL_BACKUP_TIMER:-1}" = "1" ]; then
  echo "==> Installing daily PostgreSQL backup timer"
  "${PRIVILEGED[@]}" env ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/install-backup-timer.sh"
fi

if command -v systemctl >/dev/null 2>&1 && [ "${INSTALL_OPS_MONITOR:-1}" = "1" ]; then
  echo "==> Installing host operations monitor"
  "${PRIVILEGED[@]}" env ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/install-ops-monitor.sh"
fi

echo
echo "Production infrastructure is ready."
echo "Next:"
echo "  1. Configure the 1Panel/OpenResty HTTPS site using deploy/production/openresty/daoyou-api.conf.example."
echo "  2. Run the first database migration with MIGRATION_COMPATIBILITY=expand."
echo "  3. Release an immutable APP_IMAGE with scripts/release-production.sh."
