#!/usr/bin/env bash
# Litestream backup freshness (read-only GCS listing). No secrets.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
BUCKET="${LITESTREAM_BUCKET:-clinic-erp-staging-clinic-db}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

PREFIX="gs://${BUCKET}/clinic.db"
LATEST="$(gcloud storage ls -l "${PREFIX}/**" 2>/dev/null | awk '{print $1,$2}' | tail -5 || true)"
COUNT="$(gcloud storage ls "${PREFIX}/**" 2>/dev/null | wc -l | tr -d ' ' || echo 0)"

node -e "
console.log(JSON.stringify({
  bucket: process.argv[1],
  prefix: process.argv[2],
  objectCountApprox: Number(process.argv[3]) || 0,
  latestObjectsSample: process.argv[4].split('\\n').filter(Boolean),
  note: 'Non-zero count and recent WAL/generation objects indicate Litestream activity',
}, null, 2));
" "$BUCKET" "$PREFIX" "$COUNT" "$LATEST"
