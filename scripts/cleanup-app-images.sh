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
KEEP_COUNT="$(production_env_default "${KEEP_APP_IMAGE_VERSIONS:-}" "${ENV_FILE}" KEEP_APP_IMAGE_VERSIONS 5)"

if ! [[ "${KEEP_COUNT}" =~ ^[1-9][0-9]*$ ]]; then
  echo "KEEP_APP_IMAGE_VERSIONS must be a positive integer." >&2
  exit 1
fi
if [ ! -f "${DEPLOY_STATE_FILE}" ]; then
  echo "Deploy state missing; skip image cleanup: ${DEPLOY_STATE_FILE}"
  exit 0
fi

state_value() {
  local key="$1"
  sed -nE "s/^${key}=(.*)$/\1/p" "${DEPLOY_STATE_FILE}" | tail -n 1
}

CURRENT_IMAGE="$(state_value CURRENT_IMAGE)"
PREVIOUS_IMAGE="$(state_value PREVIOUS_IMAGE)"
if [ -z "${CURRENT_IMAGE}" ]; then
  echo "CURRENT_IMAGE missing; skip image cleanup."
  exit 0
fi

repository_from_image() {
  local image="$1"
  image="${image%%@*}"
  local last="${image##*/}"
  if [[ "${last}" == *:* ]]; then
    printf '%s' "${image%:*}"
  else
    printf '%s' "${image}"
  fi
}

repository="$(repository_from_image "${CURRENT_IMAGE}")"
declare -A keep_ids=()
declare -A seen_ids=()

for protected_image in "${CURRENT_IMAGE}" "${PREVIOUS_IMAGE}"; do
  [ -n "${protected_image}" ] || continue
  image_id="$(
    docker image inspect --format '{{.Id}}' "${protected_image}" 2>/dev/null || true
  )"
  [ -n "${image_id}" ] && keep_ids["${image_id}"]=1
done

kept_recent=0
while IFS='|' read -r image_ref short_id; do
  [ -n "${image_ref}" ] && [ -n "${short_id}" ] || continue
  [ "${image_ref##*:}" != "<none>" ] || continue
  full_id="$(
    docker image inspect --format '{{.Id}}' "${image_ref}" 2>/dev/null || true
  )"
  [ -n "${full_id}" ] || continue
  if [ -z "${seen_ids[${full_id}]+x}" ]; then
    seen_ids["${full_id}"]=1
    if [ "${kept_recent}" -lt "${KEEP_COUNT}" ]; then
      keep_ids["${full_id}"]=1
      kept_recent="$((kept_recent + 1))"
    fi
  fi
done < <(
  docker image ls "${repository}" --format '{{.Repository}}:{{.Tag}}|{{.ID}}'
)

removed=0
while IFS='|' read -r image_ref short_id; do
  [ -n "${image_ref}" ] && [ -n "${short_id}" ] || continue
  [ "${image_ref##*:}" != "<none>" ] || continue
  full_id="$(
    docker image inspect --format '{{.Id}}' "${image_ref}" 2>/dev/null || true
  )"
  [ -n "${full_id}" ] || continue
  if [ -n "${keep_ids[${full_id}]+x}" ]; then
    continue
  fi

  echo "Removing old app image tag: ${image_ref}"
  if docker image rm "${image_ref}" >/dev/null 2>&1; then
    removed="$((removed + 1))"
  else
    echo "Keeping ${image_ref}: still referenced or could not be removed." >&2
  fi
done < <(
  docker image ls "${repository}" --format '{{.Repository}}:{{.Tag}}|{{.ID}}'
)

echo "Image cleanup complete: repository=${repository}, retained recent versions=${KEEP_COUNT}, removed tags=${removed}"
