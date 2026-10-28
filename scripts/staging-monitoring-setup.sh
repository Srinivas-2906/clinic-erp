#!/usr/bin/env bash
# Lightweight GCP uptime checks for staging (no paid third-party). Idempotent where possible.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
API_URL="${STAGING_API_URL:-https://clinic-api-staging-339065153036.asia-south1.run.app}"
CRM_URL="${STAGING_CRM_URL:-https://kaana-clinic-staging-339065153036.asia-south1.run.app}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

API_HOST="$(node -e "console.log(new URL(process.argv[1]).host)" "$API_URL")"
CRM_HOST="$(node -e "console.log(new URL(process.argv[1]).host)" "$CRM_URL")"

upsert_uptime() {
  local id="$1"
  local host="$2"
  local path="$3"
  if gcloud monitoring uptime-check-configs describe "$id" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud monitoring uptime-check-configs update "$id" \
      --project="$PROJECT" \
      --resource-type=uptime-url \
      --host="$host" \
      --path="$path" \
      --port=443 \
      --use-ssl \
      --period=300 \
      --timeout=10s \
      --quiet
  else
    gcloud monitoring uptime-check-configs create "$id" \
      --project="$PROJECT" \
      --display-name="$id" \
      --resource-type=uptime-url \
      --host="$host" \
      --path="$path" \
      --port=443 \
      --use-ssl \
      --period=300 \
      --timeout=10s \
      --quiet
  fi
}

upsert_uptime "clinic-staging-api-health" "$API_HOST" "/health"
upsert_uptime "clinic-staging-crm-root" "$CRM_HOST" "/"

echo "{\"ok\":true,\"uptimeChecks\":[\"clinic-staging-api-health\",\"clinic-staging-crm-root\"],\"note\":\"Alert notification channels are not configured; checks visible in Cloud Monitoring uptime dashboard\"}"
