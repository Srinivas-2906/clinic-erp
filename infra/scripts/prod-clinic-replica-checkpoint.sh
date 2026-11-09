#!/usr/bin/env bash
# Production Litestream replica quiescence (read-only GCS listing).
set -euo pipefail

PROJECT="${GCP_PROD_PROJECT_ID:-crucial-accord-505607-g9}"
BUCKET="${CLINIC_PROD_LITESTREAM_BUCKET:-crucial-accord-505607-g9-db}"
if [ "$PROJECT" != "crucial-accord-505607-g9" ]; then
  echo "Refusing: production checkpoint requires crucial-accord-505607-g9" >&2
  exit 1
fi
if [ "$BUCKET" != "crucial-accord-505607-g9-db" ]; then
  echo "Refusing: bucket must be crucial-accord-505607-g9-db" >&2
  exit 1
fi

export GCP_STAGING_PROJECT_ID="$PROJECT"
export STAGING_LITESTREAM_BUCKET="$BUCKET"
exec "$(dirname "$0")/staging-clinic-replica-checkpoint.sh" "$@"
