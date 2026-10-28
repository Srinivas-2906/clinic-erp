#!/usr/bin/env bash
# Idempotent staging platform admin via Cloud Run Job (SQLite via Litestream restore).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_STAGING_REGION:-asia-south1}"
BUCKET="${LITESTREAM_BUCKET:-clinic-erp-staging-clinic-db}"
RUNNER_SA="${API_SERVICE_ACCOUNT:-clinic-staging-runner@${PROJECT}.iam.gserviceaccount.com}"
JOB="${CLINIC_STAGING_PLATFORM_ADMIN_JOB:-clinic-staging-bootstrap-platform-admin}"
EMAIL="${PLATFORM_ADMIN_EMAIL:-staging-platform-admin@clinic-erp.invalid}"
PWD_SECRET="${PLATFORM_ADMIN_PASSWORD_SECRET:-clinic-staging-platform-admin-password}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

if ! gcloud secrets describe "$PWD_SECRET" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Creating secret ${PWD_SECRET} (staging-only operator password)"
  openssl rand -base64 24 | gcloud secrets create "$PWD_SECRET" \
    --project="$PROJECT" \
    --replication-policy=automatic \
    --data-file=-
fi

IMAGE="$(gcloud run services describe clinic-api-staging \
  --project="$PROJECT" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].image)')"

RESTORE_AND_BOOT="mkdir -p /data/uploads && litestream restore -if-replica-exists -o /data/clinic.db gcs://${BUCKET}/clinic.db && node /app/apps/api/scripts/ensure-staging-platform-admin.js"

if gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
  gcloud run jobs update "$JOB" \
    --project="$PROJECT" --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$RUNNER_SA" \
    --set-env-vars "DATABASE_PATH=/data/clinic.db,LITESTREAM_BUCKET=${BUCKET},NODE_ENV=production,PLATFORM_ADMIN_EMAIL=${EMAIL}" \
    --set-secrets "PLATFORM_ADMIN_PASSWORD=${PWD_SECRET}:latest" \
    --command=/bin/sh \
    --args=-c,"${RESTORE_AND_BOOT}" \
    --max-retries=0 \
    --task-timeout=600s
else
  gcloud run jobs create "$JOB" \
    --project="$PROJECT" --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$RUNNER_SA" \
    --set-env-vars "DATABASE_PATH=/data/clinic.db,LITESTREAM_BUCKET=${BUCKET},NODE_ENV=production,PLATFORM_ADMIN_EMAIL=${EMAIL}" \
    --set-secrets "PLATFORM_ADMIN_PASSWORD=${PWD_SECRET}:latest" \
    --command=/bin/sh \
    --args=-c,"${RESTORE_AND_BOOT}" \
    --max-retries=0 \
    --task-timeout=600s
fi

EXEC="$(gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --format='value(name)' --wait)"
echo "{\"ok\":true,\"job\":\"${JOB}\",\"execution\":\"${EXEC}\",\"platformAdminEmail\":\"${EMAIL}\",\"passwordSecret\":\"${PWD_SECRET}\"}"
