#!/usr/bin/env bash
# Staging-only cold writer restart via maintenance scaling=0 + traffic restore.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLINIC_API_STAGING_SERVICE:-clinic-api-staging}"
MARKER="${1:?SW-PERSIST marker for survival check}"
BUCKET="${STAGING_LITESTREAM_BUCKET:-clinic-erp-staging-clinic-db}"

if [ "$PROJECT" != "clinic-erp-staging" ]; then echo "Refusing: not staging" >&2; exit 1; fi
if [ "${CONFIRM_STAGING_COLD_RESTART:-}" != "1" ]; then
  echo "Refusing: export CONFIRM_STAGING_COLD_RESTART=1" >&2
  exit 1; fi

REV="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
LEASE="$(gcloud storage cat "gs://${BUCKET}/_meta/writer-lease.json" --project="$PROJECT" 2>/dev/null || echo '{}')"
echo "pre_restart revision=${REV}"
echo "pre_restart_lease=${LEASE}"

gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" --scaling=0
bash "$(dirname "$0")/../infra/scripts/wait-run-zero-instances.sh" "$PROJECT" "$REGION" "$SERVICE" 300
bash "$(dirname "$0")/../infra/scripts/staging-clinic-replica-checkpoint.sh" 120 10 2

gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --scaling=auto --min-instances=0 --max-instances=1
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" --max-instances=1
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --to-revisions="${REV}=100"

API="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
deadline=$((SECONDS + 180))
while [ "$SECONDS" -lt "$deadline" ]; do
  if curl -fsS "${API}/api/health" | python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if d.get('ok') and (d.get('writerLease') or {}).get('held') else 1)"; then
    curl -fsS "${API}/api/health"
    echo ""
    break
  fi
  sleep 10
done

LEASE_AFTER="$(gcloud storage cat "gs://${BUCKET}/_meta/writer-lease.json" --project="$PROJECT")"
echo "post_restart_lease=${LEASE_AFTER}"
bash "$(dirname "$0")/staging-validate.mjs" >/tmp/staging-validate-after-restart.json 2>&1 || true
echo "staging_validate_exit=$?"
