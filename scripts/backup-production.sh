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
POSTGRES_IMAGE="$(production_env_default "${POSTGRES_IMAGE:-}" "${ENV_FILE}" POSTGRES_IMAGE postgres:17-alpine)"
BACKUP_DIR="$(production_env_default "${BACKUP_DIR:-}" "${ENV_FILE}" BACKUP_DIR /root/daoyou/backups)"
BACKUP_RETENTION_DAYS="$(production_env_default "${BACKUP_RETENTION_DAYS:-}" "${ENV_FILE}" BACKUP_RETENTION_DAYS 14)"
DEPLOY_STATE_FILE="$(production_env_default "${DEPLOY_STATE_FILE:-}" "${ENV_FILE}" DEPLOY_STATE_FILE /root/daoyou/deploy-state.env)"

for command in docker date sha256sum find mkdir cp; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Required command not found: ${command}" >&2
    exit 1
  }
done

if [ "${EUID}" -eq 0 ]; then
  PRIVILEGED=()
elif command -v sudo >/dev/null 2>&1; then
  PRIVILEGED=(sudo)
else
  echo "Run as root or install sudo." >&2
  exit 1
fi

"${PRIVILEGED[@]}" mkdir -p "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="daoyou-${timestamp}.dump"
backup_path="${BACKUP_DIR}/${backup_name}"

echo "==> PostgreSQL backup: ${backup_path}"
docker run --rm \
  --network "${APP_NETWORK}" \
  --env-file "${ENV_FILE}" \
  -e BACKUP_FILE="${backup_name}" \
  -v "${BACKUP_DIR}:/backup" \
  "${POSTGRES_IMAGE}" \
  sh -ec '
    test -n "${DATABASE_URL:-}" || {
      echo "DATABASE_URL missing" >&2
      exit 1
    }
    pg_dump \
      --dbname="${DATABASE_URL}" \
      --format=custom \
      --compress=9 \
      --no-owner \
      --no-privileges \
      --file="/backup/${BACKUP_FILE}"
  '

echo "==> Validating pg_dump archive"
docker run --rm \
  -v "${BACKUP_DIR}:/backup:ro" \
  "${POSTGRES_IMAGE}" \
  pg_restore --list "/backup/${backup_name}" >/dev/null

(
  cd "${BACKUP_DIR}"
  sha256sum "${backup_name}" >"${backup_name}.sha256"
)

if [ -f "${DEPLOY_STATE_FILE}" ]; then
  "${PRIVILEGED[@]}" cp "${DEPLOY_STATE_FILE}" "${backup_path}.deploy-state"
fi

"${PRIVILEGED[@]}" find "${BACKUP_DIR}" \
  -type f \
  -mtime "+${BACKUP_RETENTION_DAYS}" \
  \( -name 'daoyou-*.dump' -o -name 'daoyou-*.dump.sha256' -o -name 'daoyou-*.dump.deploy-state' \) \
  -delete

echo "Backup completed: ${backup_path}"
