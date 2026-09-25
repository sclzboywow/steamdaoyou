# Local DB dumps (APP_ENV=local)

Restore example:
  pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" db-dumps/daoyou_local.dump

Generated: 2026-09-25T20:17:06.4727442+08:00
Contains auth + game schemas from local PostgreSQL. Keep this repository private.
