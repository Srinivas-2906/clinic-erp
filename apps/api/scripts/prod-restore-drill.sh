#!/usr/bin/env bash
# Production Litestream READ-ONLY restore drill (local isolated output only).
# Does NOT run Litestream replicate, does NOT write to GCS, does NOT touch Cloud Run.
set -euo pipefail

if [ "${CLINIC_PROD_RESTORE_AUTHORIZED:-}" != "1" ]; then
  echo "Refusing: set CLINIC_PROD_RESTORE_AUTHORIZED=1 after explicit approval." >&2
  exit 1
fi

ALLOWED_BUCKET="${CLINIC_PROD_RESTORE_BUCKET:-crucial-accord-505607-g9-db}"
PROJECT="${GCP_PROD_PROJECT_ID:-crucial-accord-505607-g9}"
BUCKET="${CLINIC_PROD_LITESTREAM_BUCKET:-$ALLOWED_BUCKET}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRILL_ROOT="${CLINIC_PROD_RESTORE_DRILL_DIR:-${ROOT}/../../.restore-drill-prod}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOCAL_REPLICA="${DRILL_ROOT}/replica/clinic.db"
OUT_DB="${DRILL_ROOT}/prod-clinic-restored-${STAMP}.db"

if [ "$BUCKET" != "$ALLOWED_BUCKET" ]; then
  echo "Refusing: bucket must be ${ALLOWED_BUCKET}" >&2
  exit 1
fi

case "$DRILL_ROOT" in
  /|/data|/data/*) echo "Refusing unsafe drill dir" >&2; exit 1 ;;
esac

if [ -e "$OUT_DB" ]; then
  echo "Refusing to overwrite ${OUT_DB}" >&2
  exit 1
fi

mkdir -p "${DRILL_ROOT}/replica"
LITESTREAM="${ROOT}/.tools/litestream"
[ -x "$LITESTREAM" ] || LITESTREAM="$(command -v litestream || true)"
[ -n "$LITESTREAM" ] || { echo "litestream binary required" >&2; exit 1; }

echo "==> READ-ONLY rsync gs://${BUCKET}/clinic.db/ (project ${PROJECT})"
RSYNC_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gcloud storage rsync -r "gs://${BUCKET}/clinic.db/" "${LOCAL_REPLICA}/" --project="$PROJECT"
RSYNC_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "replica_sync_start=${RSYNC_START}"
echo "replica_sync_end=${RSYNC_END}"

echo "==> Local restore only"
"$LITESTREAM" restore -if-replica-exists -o "$OUT_DB" "file://${LOCAL_REPLICA}"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$OUT_DB" <<'SQL'
.headers on
SELECT 'integrity_check' AS check_name, * FROM pragma_integrity_check;
PRAGMA foreign_keys = ON;
SELECT 'fk_violations' AS check_name, count(*) AS cnt FROM pragma_foreign_key_check;
SELECT count(*) AS tenants FROM tenants;
SELECT count(*) AS users FROM users;
SELECT count(*) AS patients FROM patients;
SELECT max(substr(created_at,1,19)) AS max_audit_ts FROM audit_log WHERE created_at IS NOT NULL;
SQL
fi

echo "restored_db=${OUT_DB}"
echo "==> Done (no GCS writes, no replicate, no prod Run changes)"
