#!/usr/bin/env bash

# Read simple KEY=VALUE entries without sourcing secrets as shell code.
production_env_get() {
  local file="$1"
  local key="$2"
  local line value

  [ -f "${file}" ] || return 1
  line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
  [ -n "${line}" ] || return 1

  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

production_env_default() {
  local current="$1"
  local file="$2"
  local key="$3"
  local fallback="${4:-}"
  local value

  if [ -n "${current}" ]; then
    printf '%s' "${current}"
    return
  fi
  value="$(production_env_get "${file}" "${key}" || true)"
  printf '%s' "${value:-${fallback}}"
}
