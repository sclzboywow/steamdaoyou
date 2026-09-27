#!/usr/bin/env bash
set -Eeuo pipefail

OPENRESTY_CONTAINER="${OPENRESTY_CONTAINER:-}"
if [ -z "${OPENRESTY_CONTAINER}" ]; then
  OPENRESTY_CONTAINER="$(
    docker ps --format '{{.Names}}' |
      grep -E '^1Panel-openresty-' |
      head -n 1 || true
  )"
fi

if [ -z "${OPENRESTY_CONTAINER}" ]; then
  echo "No 1Panel OpenResty container detected; skip log reopen." >&2
  exit 0
fi

docker exec "${OPENRESTY_CONTAINER}" nginx -s reopen
