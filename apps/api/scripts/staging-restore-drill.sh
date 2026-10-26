#!/usr/bin/env bash
# Staging-only Litestream restore drill — writes to an isolated local file; never touches Cloud Run /data.
set -euo pipefail

ALLOWED_PROJECT="${STAGING_RESTORE_ALLOWED_PROJECT:-clinic-erp-staging}"
ALLOWED_BUCKET="${STAGING_RESTORE_ALLOWED_BUCKET:-clinic-erp-staging-clinic-db}"
PROJECT="${GCP_STAGING_PROJECT_ID:-$ALLOWED_PROJECT}"
BUCKET="${STAGING_LITESTREAM_BUCKET:-$ALLOWED_BUCKET}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS_DIR="${ROOT}/.tools"
LITESTREAM_VERSION="${LITESTREAM_VERSION:-0.3.13}"
DRILL_ROOT="${STAGING_RESTORE_DRILL_DIR:-${ROOT}/../../.restore-drill}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOCAL_REPLICA="${DRILL_ROOT}/replica/clinic.db"
OUT_DB="${DRILL_ROOT}/staging-clinic-restored-${STAMP}.db"

ensure_litestream() {
  if command -v litestream >/dev/null 2>&1; then
    command -v litestream
    return
  fi
  mkdir -p "$TOOLS_DIR"
  local bin="${TOOLS_DIR}/litestream"
  if [ -x "$bin" ]; then
    echo "$bin"
    return
  fi
  local os arch url zip
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64) arch=amd64 ;;
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
  esac
  url="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-${os}-${arch}.zip"
  zip="${TOOLS_DIR}/litestream.zip"
  echo "==> Download litestream v${LITESTREAM_VERSION} (${os}-${arch})" >&2
  curl -fsSL "$url" -o "$zip"
  unzip -oq "$zip" -d "$TOOLS_DIR"
  chmod +x "$bin"
  rm -f "$zip"
  echo "$bin"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [--sync-only | --restore-only]

  Default: rsync replica from GCS (gcloud user creds), then litestream restore to:
    ${OUT_DB}

  Env:
    GCP_STAGING_PROJECT_ID   (default: clinic-erp-staging)
    STAGING_LITESTREAM_BUCKET (default: clinic-erp-staging-clinic-db)
    STAGING_RESTORE_DRILL_DIR  (default: repo .restore-drill/)

  Does NOT modify staging Cloud Run, live /data/clinic.db, or production buckets.
EOF
}

SYNC_ONLY=0
RESTORE_ONLY=0
MODE="${1:-}"
case "$MODE" in
  -h|--help) usage; exit 0 ;;
  --sync-only) SYNC_ONLY=1 ;;
  --restore-only) RESTORE_ONLY=1 ;;
  "") SYNC_ONLY=1; RESTORE_ONLY=1 ;;
  *) echo "Unknown option: $MODE" >&2; usage; exit 1 ;;
esac

refuse_staging_only() {
  echo "Refusing: $1" >&2
  exit 1
}

# Staging allowlist — no production fallback.
if [ "$PROJECT" != "$ALLOWED_PROJECT" ]; then
  refuse_staging_only "GCP_STAGING_PROJECT_ID must be ${ALLOWED_PROJECT} (got: ${PROJECT})."
fi
if [ "$BUCKET" != "$ALLOWED_BUCKET" ]; then
  refuse_staging_only "STAGING_LITESTREAM_BUCKET must be ${ALLOWED_BUCKET} (got: ${BUCKET})."
fi
case "$BUCKET" in
  kaana-prod-db|*-prod-*|crucial-accord*) refuse_staging_only "production or legacy bucket name." ;;
esac

case "$DRILL_ROOT" in
  /|/data|/data/*|/tmp/clinic.db|*/clinic.db)
    refuse_staging_only "unsafe STAGING_RESTORE_DRILL_DIR=${DRILL_ROOT}"
    ;;
esac

mkdir -p "$DRILL_ROOT/replica"
LITESTREAM="$(ensure_litestream)"

if [ "${SYNC_ONLY:-0}" = 1 ]; then
  echo "==> Sync Litestream replica (read-only): gs://${BUCKET}/clinic.db/ → ${LOCAL_REPLICA}/"
  RSYNC_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! gcloud storage rsync -r "gs://${BUCKET}/clinic.db/" "${LOCAL_REPLICA}/" --project="$PROJECT"; then
    echo "Replica sync failed (read-only on GCS; no live DB changes)." >&2
    exit 1
  fi
  RSYNC_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "replica_sync_start=${RSYNC_START}"
  echo "replica_sync_end=${RSYNC_END}"
  OBJECTS="$(find "${LOCAL_REPLICA}" -type f 2>/dev/null | wc -l | tr -d ' ')"
  echo "replica_object_files=${OBJECTS}"
fi

if [ "${RESTORE_ONLY:-0}" = 1 ]; then
  if [ ! -d "${LOCAL_REPLICA}/generations" ]; then
    echo "Missing local replica at ${LOCAL_REPLICA}; run without --restore-only first." >&2
    exit 1
  fi
  if [ -e "$OUT_DB" ]; then
    echo "Refusing to overwrite existing restore artifact: ${OUT_DB}" >&2
    exit 1
  fi
  echo "==> Restore to isolated DB: ${OUT_DB}"
  RESTORE_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! "$LITESTREAM" restore -if-replica-exists -o "$OUT_DB" "file://${LOCAL_REPLICA}"; then
    echo "Litestream restore failed; live staging unchanged." >&2
    rm -f "$OUT_DB" "${OUT_DB}.tmp" 2>/dev/null || true
    exit 1
  fi
  RESTORE_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "restore_start=${RESTORE_START}"
  echo "restore_end=${RESTORE_END}"
  echo "restored_db=${OUT_DB}"
  echo "restored_bytes=$(stat -f '%z' "$OUT_DB" 2>/dev/null || stat -c '%s' "$OUT_DB")"

  if command -v sqlite3 >/dev/null 2>&1; then
    echo "==> Validation (aggregates only; no PII)"
    sqlite3 "$OUT_DB" <<'SQL'
.headers on
.mode column
SELECT 'integrity_check' AS check_name, * FROM pragma_integrity_check;
PRAGMA foreign_keys = ON;
SELECT 'fk_violations' AS check_name, count(*) AS cnt FROM pragma_foreign_key_check;
SELECT slug FROM tenants;
SELECT count(*) AS users FROM users;
SELECT count(*) AS patients FROM patients;
SELECT count(*) AS appointments FROM appointments;
SELECT count(*) AS encounters FROM encounters;
SELECT count(*) AS prescriptions FROM prescriptions;
SELECT count(*) AS payments FROM patient_payments;
SELECT count(*) AS audit_rows FROM audit_log;
SELECT max(substr(created_at,1,19)) AS max_appt_created FROM appointments WHERE created_at IS NOT NULL;
SELECT max(substr(created_at,1,19)) AS max_enc_created FROM encounters WHERE created_at IS NOT NULL;
SELECT max(substr(created_at,1,19)) AS max_audit_ts FROM audit_log WHERE created_at IS NOT NULL;
SQL
  else
    echo "sqlite3 not found; skip local validation." >&2
  fi
fi

echo "==> Done (staging drill only; live service unchanged)."
