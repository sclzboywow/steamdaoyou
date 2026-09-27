#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-/root/daoyou/.env.production}"

if [ "${MIGRATION_COMPATIBILITY:-}" != "expand" ]; then
  cat >&2 <<'EOF'
Production migration refused.

Blue/green releases require backward-compatible schema changes while old and new
applications overlap. Review the migration first, then rerun with:

  MIGRATION_COMPATIBILITY=expand

Destructive DROP/RENAME/type-contract migrations must be deferred to a later
release after all old application versions have been retired.
EOF
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "ENV_FILE not found: ${ENV_FILE}" >&2
  exit 1
fi
command -v bun >/dev/null 2>&1 || {
  echo "bun is required on the deployment host for database migrations." >&2
  exit 1
}

cd "${REPO_ROOT}"

echo "==> Better Auth migrations"
bun --env-file="${ENV_FILE}" run auth:migrate

echo "==> Application migrations"
bun --env-file="${ENV_FILE}" x drizzle-kit migrate

echo "==> Admin migrations"
bun --env-file="${ENV_FILE}" run admin:migrate

echo "Production migrations completed."
