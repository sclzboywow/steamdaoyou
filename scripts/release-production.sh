#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/production-env.sh"

ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"
APP_IMAGE="${APP_IMAGE:-}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "ENV_FILE not found: ${ENV_FILE}" >&2
  exit 1
fi
if [ -z "${APP_IMAGE}" ]; then
  echo "APP_IMAGE is required, preferably registry/daoyou-app:<full-git-sha>" >&2
  exit 1
fi
if [[ "${APP_IMAGE}" == *":latest" ]] && [ "${ALLOW_LATEST_IMAGE:-0}" != "1" ]; then
  echo "Refusing :latest. Use the immutable Git SHA tag produced by CI." >&2
  exit 1
fi

export APP_NETWORK="$(production_env_default "${APP_NETWORK:-}" "${ENV_FILE}" APP_NETWORK daoyou-runtime)"
export API_DOMAIN="$(production_env_default "${API_DOMAIN:-}" "${ENV_FILE}" API_DOMAIN)"
export UPSTREAM_CONF="$(production_env_default "${UPSTREAM_CONF:-}" "${ENV_FILE}" UPSTREAM_CONF)"
export OPENRESTY_CONTAINER="$(production_env_default "${OPENRESTY_CONTAINER:-}" "${ENV_FILE}" OPENRESTY_CONTAINER)"
export DEPLOY_STATE_FILE="$(production_env_default "${DEPLOY_STATE_FILE:-}" "${ENV_FILE}" DEPLOY_STATE_FILE /root/daoyou/deploy-state.env)"
export BLUE_PORT="$(production_env_default "${BLUE_PORT:-}" "${ENV_FILE}" BLUE_PORT 3000)"
export GREEN_PORT="$(production_env_default "${GREEN_PORT:-}" "${ENV_FILE}" GREEN_PORT 3001)"
export OLD_CONTAINER_GRACE_SECONDS="$(production_env_default "${OLD_CONTAINER_GRACE_SECONDS:-}" "${ENV_FILE}" OLD_CONTAINER_GRACE_SECONDS 90)"

if [ -n "${API_DOMAIN}" ] && [ -z "${PUBLIC_READY_URL:-}" ]; then
  export PUBLIC_READY_URL="https://${API_DOMAIN}/api/ready-check"
fi

if [ "${BACKUP_BEFORE_DEPLOY:-1}" = "1" ]; then
  echo "==> Pre-release database backup"
  ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/backup-production.sh"
fi

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "==> Backward-compatible production migrations"
  ENV_FILE="${ENV_FILE}" \
    MIGRATION_COMPATIBILITY="${MIGRATION_COMPATIBILITY:-}" \
    "${SCRIPT_DIR}/migrate-production.sh"
fi

echo "==> Blue/green release: ${APP_IMAGE}"
ENV_FILE="${ENV_FILE}" APP_IMAGE="${APP_IMAGE}" "${SCRIPT_DIR}/blue-green-app.sh"

echo
echo "Release completed: ${APP_IMAGE}"
if [ -n "${PUBLIC_READY_URL:-}" ]; then
  echo "Ready: ${PUBLIC_READY_URL}"
fi
