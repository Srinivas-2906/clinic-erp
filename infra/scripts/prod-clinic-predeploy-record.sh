#!/usr/bin/env bash
set -euo pipefail
PROJECT="${GCP_PROD_PROJECT_ID:-crucial-accord-505607-g9}"
if [ "$PROJECT" != "crucial-accord-505607-g9" ]; then
  echo "Refusing non-prod project" >&2
  exit 1
fi
export GCP_STAGING_PROJECT_ID="$PROJECT"
export CLINIC_API_STAGING_SERVICE="${CLINIC_PROD_API_SERVICE:-clinic-api}"
export STAGING_LITESTREAM_BUCKET="${CLINIC_PROD_LITESTREAM_BUCKET:-crucial-accord-505607-g9-db}"
exec "$(dirname "$0")/staging-clinic-predeploy-record.sh" "$@"
