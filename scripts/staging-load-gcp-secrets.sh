#!/usr/bin/env bash
# Export staging secrets into env vars for the current shell (never echo values).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

read_secret() {
  local name="$1"
  gcloud secrets versions access latest --secret="$name" --project="$PROJECT" 2>/dev/null || true
}

STAGING_DEMO_PASSWORD="$(read_secret clinic-staging-demo-password)"
CLINIC_PROVISIONING_API_KEY="$(read_secret clinic-staging-provisioning-key)"
PLATFORM_ADMIN_PASSWORD="$(read_secret clinic-staging-platform-admin-password)"

export STAGING_DEMO_PASSWORD CLINIC_PROVISIONING_API_KEY PLATFORM_ADMIN_PASSWORD

if [ -z "${STAGING_DEMO_PASSWORD:-}" ]; then
  echo "::warning::clinic-staging-demo-password unavailable (secretAccessor missing?)" >&2
fi
