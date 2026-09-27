#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/production-env.sh"

ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"
if [ ! -f "${ENV_FILE}" ]; then
  echo "ENV_FILE not found: ${ENV_FILE}" >&2
  exit 1
fi

APP_NETWORK="$(production_env_default "${APP_NETWORK:-}" "${ENV_FILE}" APP_NETWORK daoyou-runtime)"
API_DOMAIN="$(production_env_default "${API_DOMAIN:-}" "${ENV_FILE}" API_DOMAIN)"
UPSTREAM_CONF="$(production_env_default "${UPSTREAM_CONF:-}" "${ENV_FILE}" UPSTREAM_CONF)"
BLUE_PORT="$(production_env_default "${BLUE_PORT:-}" "${ENV_FILE}" BLUE_PORT 3000)"
GREEN_PORT="$(production_env_default "${GREEN_PORT:-}" "${ENV_FILE}" GREEN_PORT 3001)"

if [ -z "${UPSTREAM_CONF}" ] && [ -n "${API_DOMAIN}" ]; then
  UPSTREAM_CONF="/opt/1panel/www/sites/${API_DOMAIN}/upstream/daoyou_backend.conf"
fi

echo "==> Infrastructure"
docker compose \
  --env-file "${ENV_FILE}" \
  -f "${SCRIPT_DIR}/docker-compose.infrastructure.yml" \
  -p daoyou-infra \
  ps

echo "==> Docker network"
docker network inspect "${APP_NETWORK}" >/dev/null
echo "OK: ${APP_NETWORK}"

echo "==> Active upstream"
if [ -n "${UPSTREAM_CONF}" ] && [ -f "${UPSTREAM_CONF}" ]; then
  cat "${UPSTREAM_CONF}"
else
  echo "Upstream file not found: ${UPSTREAM_CONF:-unset}" >&2
  exit 1
fi

active_port="$(sed -nE 's/^[[:space:]]*server[[:space:]]+127\.0\.0\.1:([0-9]+);.*$/\1/p' "${UPSTREAM_CONF}" | head -n 1)"
if [ "${active_port}" != "${BLUE_PORT}" ] && [ "${active_port}" != "${GREEN_PORT}" ]; then
  echo "Unexpected active upstream port: ${active_port:-none}" >&2
  exit 1
fi

echo "==> Local readiness"
curl --fail --silent --show-error "http://127.0.0.1:${active_port}/api/ready-check"
echo

if [ -n "${API_DOMAIN}" ]; then
  echo "==> Public HTTPS readiness"
  curl --fail --silent --show-error "https://${API_DOMAIN}/api/ready-check"
  echo
fi

echo "Production verification passed."
