#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/production-env.sh"

ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"
if [ ! -f "${ENV_FILE}" ]; then
  echo "ENV_FILE not found: ${ENV_FILE}" >&2
  exit 1
fi

DEPLOY_STATE_FILE="$(production_env_default "${DEPLOY_STATE_FILE:-}" "${ENV_FILE}" DEPLOY_STATE_FILE /root/daoyou/deploy-state.env)"
if [ ! -f "${DEPLOY_STATE_FILE}" ]; then
  echo "Deploy state not found: ${DEPLOY_STATE_FILE}" >&2
  exit 1
fi

state_value() {
  local key="$1"
  sed -nE "s/^${key}=(.*)$/\1/p" "${DEPLOY_STATE_FILE}" | tail -n 1
}

PREVIOUS_IMAGE="$(state_value PREVIOUS_IMAGE)"
CURRENT_IMAGE="$(state_value CURRENT_IMAGE)"

if [ -z "${PREVIOUS_IMAGE}" ]; then
  echo "No previous image is recorded; automatic application rollback is unavailable." >&2
  exit 1
fi

export APP_NETWORK="$(production_env_default "${APP_NETWORK:-}" "${ENV_FILE}" APP_NETWORK daoyou-runtime)"
export API_DOMAIN="$(production_env_default "${API_DOMAIN:-}" "${ENV_FILE}" API_DOMAIN)"
export UPSTREAM_CONF="$(production_env_default "${UPSTREAM_CONF:-}" "${ENV_FILE}" UPSTREAM_CONF)"
export OPENRESTY_CONTAINER="$(production_env_default "${OPENRESTY_CONTAINER:-}" "${ENV_FILE}" OPENRESTY_CONTAINER)"
export BLUE_PORT="$(production_env_default "${BLUE_PORT:-}" "${ENV_FILE}" BLUE_PORT 3000)"
export GREEN_PORT="$(production_env_default "${GREEN_PORT:-}" "${ENV_FILE}" GREEN_PORT 3001)"
export OLD_CONTAINER_GRACE_SECONDS="$(production_env_default "${OLD_CONTAINER_GRACE_SECONDS:-}" "${ENV_FILE}" OLD_CONTAINER_GRACE_SECONDS 90)"

if [ -n "${API_DOMAIN}" ] && [ -z "${PUBLIC_READY_URL:-}" ]; then
  export PUBLIC_READY_URL="https://${API_DOMAIN}/api/ready-check"
fi

echo "Current image : ${CURRENT_IMAGE:-unknown}"
echo "Rollback image: ${PREVIOUS_IMAGE}"
echo "Database migrations are NOT reversed by this command."

ENV_FILE="${ENV_FILE}" APP_IMAGE="${PREVIOUS_IMAGE}" "${SCRIPT_DIR}/blue-green-app.sh"

echo "Application rollback completed."
