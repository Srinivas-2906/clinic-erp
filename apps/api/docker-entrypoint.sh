#!/bin/sh
set -e

mkdir -p /data/uploads
DB_PATH="${DATABASE_PATH:-/data/clinic.db}"
export UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"

if [ -n "${LITESTREAM_BUCKET:-}" ]; then
  REPLICA_URL="gcs://${LITESTREAM_BUCKET}/clinic.db"
  litestream restore -if-replica-exists -o "${DB_PATH}" "${REPLICA_URL}"
  exec litestream replicate -exec "node /app/src/index.js" "${DB_PATH}" "${REPLICA_URL}"
fi

exec node /app/src/index.js
