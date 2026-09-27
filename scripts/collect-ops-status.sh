#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/production-env.sh"

ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"
if [ ! -f "${ENV_FILE}" ]; then
  echo "ENV_FILE not found: ${ENV_FILE}" >&2
  exit 1
fi

RUNTIME_DIR="$(production_env_default "${OPS_RUNTIME_DIR:-}" "${ENV_FILE}" OPS_RUNTIME_DIR /root/daoyou/runtime)"
OUTPUT_FILE="${RUNTIME_DIR}/ops-status.json"
DISK_PATH="$(production_env_default "${OPS_DISK_PATH:-}" "${ENV_FILE}" OPS_DISK_PATH /)"
OPENRESTY_LOG_DIR="$(production_env_default "${OPENRESTY_LOG_DIR:-}" "${ENV_FILE}" OPENRESTY_LOG_DIR)"
BACKUP_STATUS_FILE="$(production_env_default "${BACKUP_STATUS_FILE:-}" "${ENV_FILE}" BACKUP_STATUS_FILE "${RUNTIME_DIR}/backup-status.env")"
TLS_DOMAIN="$(production_env_default "${OPS_TLS_DOMAIN:-}" "${ENV_FILE}" OPS_TLS_DOMAIN)"
if [ -z "${TLS_DOMAIN}" ]; then
  TLS_DOMAIN="$(production_env_default "" "${ENV_FILE}" API_DOMAIN)"
fi

for command in df awk du stat date docker mkdir mktemp mv sed; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Required command not found: ${command}" >&2
    exit 1
  }
done

mkdir -p "${RUNTIME_DIR}"

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  printf '%s' "${value}"
}

state_value() {
  local file="$1"
  local key="$2"
  [ -f "${file}" ] || return 0
  sed -nE "s/^${key}=(.*)$/\1/p" "${file}" | tail -n 1
}

read -r disk_total disk_used disk_free disk_percent < <(
  df -PB1 "${DISK_PATH}" | awk 'NR==2 {
    gsub("%", "", $5);
    printf "%s %s %s %s\n", $2, $3, $4, $5
  }'
)

mem_total_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
mem_available_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
mem_total_bytes="$((mem_total_kb * 1024))"
mem_available_bytes="$((mem_available_kb * 1024))"
mem_used_bytes="$((mem_total_bytes - mem_available_bytes))"
mem_used_percent="$(
  awk -v total="${mem_total_bytes}" -v available="${mem_available_bytes}" \
    'BEGIN {
      if (total <= 0) { print "0"; exit }
      printf "%.1f", ((total - available) / total) * 100
    }'
)"

docker_log_bytes=0
largest_docker_container=""
largest_docker_container_bytes=0
while IFS= read -r container_id; do
  [ -n "${container_id}" ] || continue
  log_path="$(docker inspect --format '{{.LogPath}}' "${container_id}" 2>/dev/null || true)"
  [ -n "${log_path}" ] && [ -f "${log_path}" ] || continue
  size="$(stat -c '%s' "${log_path}" 2>/dev/null || printf '0')"
  docker_log_bytes="$((docker_log_bytes + size))"
  if [ "${size}" -gt "${largest_docker_container_bytes}" ]; then
    largest_docker_container_bytes="${size}"
    largest_docker_container="$(
      docker inspect --format '{{.Name}}' "${container_id}" 2>/dev/null |
        sed 's#^/##' || true
    )"
  fi
done < <(docker ps -aq)

openresty_configured=false
openresty_bytes=0
openresty_json="null"
if [ -n "${OPENRESTY_LOG_DIR}" ]; then
  openresty_configured=true
  if [ -d "${OPENRESTY_LOG_DIR}" ]; then
    openresty_bytes="$(
      du -sb "${OPENRESTY_LOG_DIR}" 2>/dev/null | awk '{print $1}' || printf '0'
    )"
    openresty_json="${openresty_bytes}"
  fi
fi

journal_bytes=0
for journal_dir in /var/log/journal /run/log/journal; do
  if [ -d "${journal_dir}" ]; then
    size="$(du -sb "${journal_dir}" 2>/dev/null | awk '{print $1}' || printf '0')"
    journal_bytes="$((journal_bytes + size))"
  fi
done

total_log_bytes="$((docker_log_bytes + openresty_bytes + journal_bytes))"
largest_source="none"
largest_source_bytes=0
for candidate in \
  "docker:${docker_log_bytes}" \
  "openresty:${openresty_bytes}" \
  "journal:${journal_bytes}"; do
  source_name="${candidate%%:*}"
  source_bytes="${candidate#*:}"
  if [ "${source_bytes}" -gt "${largest_source_bytes}" ]; then
    largest_source="${source_name}"
    largest_source_bytes="${source_bytes}"
  fi
done

last_attempt_status="$(state_value "${BACKUP_STATUS_FILE}" LAST_ATTEMPT_STATUS)"
last_attempt_at="$(state_value "${BACKUP_STATUS_FILE}" LAST_ATTEMPT_AT)"
last_success_at="$(state_value "${BACKUP_STATUS_FILE}" LAST_SUCCESS_AT)"
last_success_file="$(state_value "${BACKUP_STATUS_FILE}" LAST_SUCCESS_FILE)"
last_success_size_bytes="$(state_value "${BACKUP_STATUS_FILE}" LAST_SUCCESS_SIZE_BYTES)"
last_attempt_status="${last_attempt_status:-unknown}"

nullable_string() {
  if [ -n "${1:-}" ]; then
    printf '"%s"' "$(json_escape "$1")"
  else
    printf 'null'
  fi
}

nullable_number() {
  if [[ "${1:-}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    printf '%s' "$1"
  else
    printf 'null'
  fi
}

tls_json="null"
if [ -n "${TLS_DOMAIN}" ] && command -v openssl >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
  cert_end="$(
    timeout 8 openssl s_client \
      -servername "${TLS_DOMAIN}" \
      -connect "${TLS_DOMAIN}:443" </dev/null 2>/dev/null |
      openssl x509 -noout -enddate 2>/dev/null |
      sed 's/^notAfter=//' || true
  )"
  if [ -n "${cert_end}" ]; then
    cert_epoch="$(date -d "${cert_end}" +%s 2>/dev/null || true)"
    now_epoch="$(date +%s)"
    if [[ "${cert_epoch}" =~ ^[0-9]+$ ]]; then
      days_remaining="$(( (cert_epoch - now_epoch) / 86400 ))"
      cert_iso="$(date -u -d "@${cert_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
      tls_json="$(printf '{"domain":"%s","expiresAt":"%s","daysRemaining":%s}' \
        "$(json_escape "${TLS_DOMAIN}")" \
        "$(json_escape "${cert_iso}")" \
        "${days_remaining}")"
    fi
  fi
fi

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
tmp="$(mktemp "${RUNTIME_DIR}/.ops-status.XXXXXX")"
trap 'rm -f "${tmp}"' EXIT

cat >"${tmp}" <<EOF
{
  "generatedAt": "$(json_escape "${generated_at}")",
  "disk": {
    "path": "$(json_escape "${DISK_PATH}")",
    "totalBytes": ${disk_total},
    "usedBytes": ${disk_used},
    "freeBytes": ${disk_free},
    "usedPercent": ${disk_percent}
  },
  "memory": {
    "totalBytes": ${mem_total_bytes},
    "usedBytes": ${mem_used_bytes},
    "availableBytes": ${mem_available_bytes},
    "usedPercent": ${mem_used_percent}
  },
  "logs": {
    "dockerBytes": ${docker_log_bytes},
    "openrestyBytes": ${openresty_json},
    "openrestyConfigured": ${openresty_configured},
    "journalBytes": ${journal_bytes},
    "totalBytes": ${total_log_bytes},
    "largestSource": "$(json_escape "${largest_source}")",
    "largestDockerContainer": $(nullable_string "${largest_docker_container}"),
    "largestDockerContainerBytes": ${largest_docker_container_bytes}
  },
  "backup": {
    "lastAttemptStatus": "$(json_escape "${last_attempt_status}")",
    "lastAttemptAt": $(nullable_string "${last_attempt_at}"),
    "lastSuccessAt": $(nullable_string "${last_success_at}"),
    "lastSuccessFile": $(nullable_string "${last_success_file}"),
    "lastSuccessSizeBytes": $(nullable_number "${last_success_size_bytes}")
  },
  "tls": ${tls_json}
}
EOF

chmod 0644 "${tmp}"
mv "${tmp}" "${OUTPUT_FILE}"
trap - EXIT

echo "Ops status updated: ${OUTPUT_FILE}"
