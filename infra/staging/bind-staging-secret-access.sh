#!/usr/bin/env bash
# Minimal per-secret secretAccessor for clinic-erp-staging (run as Owner / Secret Manager Admin).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
RUNNER_SA="${RUNNER_SA:-clinic-staging-runner@${PROJECT}.iam.gserviceaccount.com}"
CLOUDBUILD_SA="${CLOUDBUILD_SA:-clinic-staging-cloudbuild@${PROJECT}.iam.gserviceaccount.com}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

bind() {
  local secret_id="$1"
  local sa_email="$2"
  if ! gcloud secrets describe "$secret_id" --project="$PROJECT" >/dev/null 2>&1; then
    echo "skip (not found): $secret_id"
    return 0
  fi
  gcloud secrets add-iam-policy-binding "$secret_id" \
    --project="$PROJECT" \
    --member="serviceAccount:${sa_email}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
  echo "bound: ${secret_id} -> ${sa_email}"
}

# Cloud Run API runtime + GHA ops (via impersonation of runner).
for SEC in clinic-staging-demo-password clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  bind "$SEC" "$RUNNER_SA"
done

# Deploy, Cloud Build infra, scheduler, platform-admin job (runs as cloudbuild identity in GHA).
for SEC in clinic-staging-demo-password clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  bind "$SEC" "$CLOUDBUILD_SA"
done

# JWT: API runtime only (provision.sh usually binds runner already).
bind clinic-staging-jwt-secret "$RUNNER_SA"

GITHUB_SA="${GITHUB_SA:-github-clinic-erp-staging@${PROJECT}.iam.gserviceaccount.com}"
for ROLE in roles/iam.serviceAccountUser roles/iam.serviceAccountTokenCreator; do
  gcloud iam service-accounts add-iam-policy-binding "$RUNNER_SA" \
    --project="$PROJECT" \
    --member="serviceAccount:${GITHUB_SA}" \
    --role="$ROLE" \
    --quiet
  echo "wif: ${GITHUB_SA} -> ${RUNNER_SA} (${ROLE})"
done

echo "Done. Verify: GCP_STAGING_PROJECT_ID=${PROJECT} bash scripts/staging-iam-verify.sh"
