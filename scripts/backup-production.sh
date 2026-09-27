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
OPS_RUNTIME_DIR="$(production_env_default "${OPS_RUNTIME_DIR:-}" "${ENV_FILE}" OPS_RUNTIME_DIR /root/daoyou/runtime)"
BACKUP_STATUS_FILE="$(production_env_default "${BACKUP_STATUS_FILE:-}" "${ENV_FILE}" BACKUP_STATUS_FILE "${OPS_RUNTIME_DIR}/backup-status.env")"

for command in docker date sha256sum find mkdir cp stat mktemp mv rm sed; do
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

"${PRIVILEGED[@]}" mkdir -p "${BACKUP_DIR}" "${OPS_RUNTIME_DIR}"

state_value() {
  local key="$1"
  [ -f "${BACKUP_STATUS_FILE}" ] || return 0
  sed -nE "s/^${key}=(.*)$/\1/p" "${BACKUP_STATUS_FILE}" | tail -n 1
}

last_success_at="$(state_value LAST_SUCCESS_AT)"
last_success_file="$(state_value LAST_SUCCESS_FILE)"
last_success_size_bytes="$(state_value LAST_SUCCESS_SIZE_BYTES)"
attempt_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
backup_path=""
backup_name=""

write_backup_status() {
  local attempt_status="$1"
  local attempt_time="$2"
  local success_at="$3"
  local success_file="$4"
  local success_size="$5"
  local tmp
  tmp="$(mktemp)"
  {
    printf 'LAST_ATTEMPT_STATUS=%s\n' "${attempt_status}"
    printf 'LAST_ATTEMPT_AT=%s\n' "${attempt_time}"
    printf 'LAST_SUCCESS_AT=%s\n' "${success_at}"
    printf 'LAST_SUCCESS_FILE=%s\n' "${success_file}"
    printf 'LAST_SUCCESS_SIZE_BYTES=%s\n' "${success_size}"
  } >"${tmp}"
  "${PRIVILEGED[@]}" mv "${tmp}" "${BACKUP_STATUS_FILE}"
}

on_backup_error() {
  local exit_code="$?"
  if [ -n "${backup_path:-}" ]; then
    "${PRIVILEGED[@]}" rm -f       "${backup_path}"       "${backup_path}.sha256"       "${backup_path}.deploy-state" || true
  fi
  write_backup_status     failed     "${attempt_at}"     "${last_success_at}"     "${last_success_file}"     "${last_success_size_bytes}"
  echo "Backup failed; status recorded in ${BACKUP_STATUS_FILE}" >&2
  exit "${exit_code}"
}
trap on_backup_error ERR

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

backup_size_bytes="$(stat -c '%s' "${backup_path}")"
completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
write_backup_status   success   "${attempt_at}"   "${completed_at}"   "${backup_name}"   "${backup_size_bytes}"
trap - ERR

echo "Backup completed: ${backup_path}"
echo "Backup status: ${BACKUP_STATUS_FILE}"
