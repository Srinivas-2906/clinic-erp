#!/bin/sh
set -e

mkdir -p /data/uploads
DB_PATH="${DATABASE_PATH:-/data/clinic.db}"
export UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"

API_ENTRY="${CLINIC_API_ENTRY:-/app/apps/api/src/index.js}"

if [ -n "${LITESTREAM_BUCKET:-}" ]; then
  REPLICA_URL="gcs://${LITESTREAM_BUCKET}/clinic.db"
  # Writer lease is acquired once in run-api-with-lease.mjs (litestream -exec child).
  # Do not acquire here — duplicate holder IDs across processes caused startup deny.
  REQUIRE_REPLICA="${CLINIC_REQUIRE_LITESTREAM_REPLICA:-}"
  if [ -z "$REQUIRE_REPLICA" ]; then
    if [ "${NODE_ENV:-}" = "production" ]; then
      REQUIRE_REPLICA=1
    else
      REQUIRE_REPLICA=0
    fi
  fi
  if [ "$REQUIRE_REPLICA" = "1" ]; then
    if ! litestream restore -o "${DB_PATH}" "${REPLICA_URL}"; then
      echo "[entrypoint] FATAL: Litestream replica required but restore failed (${REPLICA_URL})" >&2
      exit 1
    fi
  else
    litestream restore -if-replica-exists -o "${DB_PATH}" "${REPLICA_URL}"
  fi
  if [ ! -s "${DB_PATH}" ] && [ "$REQUIRE_REPLICA" = "1" ]; then
    echo "[entrypoint] FATAL: database file missing or empty after required restore" >&2
    exit 1
  fi
  exec litestream replicate -exec "node /app/apps/api/scripts/run-api-with-lease.mjs" "${DB_PATH}" "${REPLICA_URL}"
fi

exec node "${API_ENTRY}"
