#!/usr/bin/env bash
# Staging-only reminder processor (Cloud Scheduler → internal API). No real delivery.
set -euo pipefail
PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_STAGING_REGION:-asia-south1}"
JOB_NAME="${CLINIC_STAGING_SCHEDULER_JOB:-clinic-staging-process-reminders}"
API_URL="${STAGING_API_URL:-$(gcloud run services describe clinic-api-staging --project "$PROJECT" --region "$REGION" --format='value(status.url)')}"
SECRET_NAME="${CLINIC_PROVISIONING_SECRET:-clinic-staging-provisioning-key}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

PROV_KEY="$(gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT")"
URI="${API_URL}/api/platform/internal/process-reminders"

gcloud scheduler jobs describe "$JOB_NAME" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1 && EXISTS=1 || EXISTS=0

if [ "$EXISTS" = "1" ]; then
  gcloud scheduler jobs update http "$JOB_NAME" \
    --project="$PROJECT" --location="$REGION" \
    --schedule="*/15 * * * *" \
    --uri="$URI" \
    --http-method=POST \
    --headers="Content-Type=application/json,x-clinic-provisioning-key=${PROV_KEY}" \
    --message-body='{"limit":50}' \
    --attempt-deadline=120s
else
  gcloud scheduler jobs create http "$JOB_NAME" \
    --project="$PROJECT" --location="$REGION" \
    --schedule="*/15 * * * *" \
    --uri="$URI" \
    --http-method=POST \
    --headers="Content-Type=application/json,x-clinic-provisioning-key=${PROV_KEY}" \
    --message-body='{"limit":50}' \
    --attempt-deadline=120s
fi

gcloud run services update clinic-api-staging \
  --project="$PROJECT" --region="$REGION" \
  --update-env-vars "REMINDER_EXTERNAL_SCHEDULER=1,DISABLE_REMINDER_WORKER=1,REMINDER_DELIVERY_ENABLED=0" \
  --update-secrets "CLINIC_PROVISIONING_API_KEY=${SECRET_NAME}:latest"

echo "Scheduler configured (staging). Mock delivery only."

gcloud scheduler jobs run "$JOB_NAME" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1 || true
echo "{\"ok\":true,\"schedulerJob\":\"${JOB_NAME}\",\"triggeredManualRun\":true}"
