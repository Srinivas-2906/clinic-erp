#!/usr/bin/env bash
# Staging-only: poll replica quiescence, restore isolated DB, assert disposable marker exists.
set -euo pipefail

MARKER="${1:?patient name marker e.g. SW-PERSIST-123}"
PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
if [ "$PROJECT" != "clinic-erp-staging" ]; then echo "Refusing non-staging project" >&2; exit 1; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECKPOINT="${ROOT}/infra/scripts/staging-clinic-replica-checkpoint.sh"
RESTORE="${ROOT}/apps/api/scripts/staging-restore-drill.sh"

export STAGING_CHECKPOINT_FILE="/tmp/staging-replica-verify-checkpoint.txt"
if ! bash "$CHECKPOINT" 180 10 2; then
  echo "replica_not_quiescent" >&2
  exit 1
fi

bash "$RESTORE" --sync-only
bash "$RESTORE" --restore-only
OUT_DB="$(ls -t "${ROOT}/.restore-drill"/staging-clinic-restored-*.db 2>/dev/null | head -1)"
if [ -z "$OUT_DB" ]; then echo "no restored db" >&2; exit 1; fi

ROW="$(sqlite3 "$OUT_DB" "SELECT id, tenant_id, name FROM patients WHERE name='${MARKER}' LIMIT 1;")"
if [ -z "$ROW" ]; then
  echo "RECORD_NOT_IN_REPLICA marker=${MARKER} db=${OUT_DB}" >&2
  exit 1
fi
echo "replica_verify_ok=true marker=${MARKER} row=${ROW} db=${OUT_DB}"
