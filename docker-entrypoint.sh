#!/bin/sh
# Container entrypoint: apply pending migrations, then hand PID 1 over to the app.
#
# Runs the TypeORM CLI against the *compiled* datasource (dist/...data-source.js)
# so the runtime image needs no ts-node/devDependencies. Migrations are copied
# from src/, so dist/common/database/migrations/*.js is what the glob in
# buildDataSourceOptions() picks up.
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "entrypoint: DATABASE_URL is not set — cannot run migrations" >&2
    exit 1
  fi

  echo "entrypoint: running migrations..."
  # Fails the container start on a broken migration, rather than booting the app
  # against a half-migrated schema.
  node ./node_modules/typeorm/cli.js migration:run -d dist/common/database/data-source.js
  echo "entrypoint: migrations up to date"
else
  echo "entrypoint: RUN_MIGRATIONS=$RUN_MIGRATIONS — skipping migrations"
fi

# exec so the app inherits PID 1 (under tini) and receives SIGTERM directly.
exec "$@"
