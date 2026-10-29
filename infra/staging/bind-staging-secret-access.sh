#!/usr/bin/env bash
# Minimal per-secret secretAccessor for clinic-erp-staging (run as Owner / Secret Manager Admin).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
RUNNER_SA="${RUNNER_SA:-clinic-staging-runner@${PROJECT}.iam.gserviceaccount.com}"
CLOUDBUILD_SA="${CLOUDBUILD_SA:-clinic-staging-cloudbuild@${PROJECT}.iam.gserviceaccount.com}"
SKIP_WIF="${SKIP_WIF:-0}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
echo "project=${PROJECT} account=${ACCOUNT:-unknown}"

bind() {
  local secret_id="$1"
  local sa_email="$2"
  local err
  if err="$(gcloud secrets add-iam-policy-binding "$secret_id" \
    --project="$PROJECT" \
    --member="serviceAccount:${sa_email}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>&1)"; then
    echo "bound: ${secret_id} -> ${sa_email}"
    return 0
  fi
  if echo "$err" | grep -qiE 'NOT_FOUND|was not found'; then
    echo "skip (secret missing): $secret_id"
    return 0
  fi
  if echo "$err" | grep -qiE 'BILLING_DISABLED|billing to be enabled'; then
    echo "error: billing disabled on ${PROJECT} — Secret Manager API is blocked until billing is re-enabled." >&2
    echo "  Check: gcloud billing projects describe ${PROJECT}" >&2
    echo "  Fix: https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT}" >&2
    return 1
  fi
  if echo "$err" | grep -qiE 'PERMISSION_DENIED|403'; then
    echo "error: cannot bind ${secret_id} (need Secret Manager Admin or Owner on ${PROJECT})" >&2
    echo "$err" >&2
    return 1
  fi
  echo "$err" >&2
  return 1
}

secret_fail=0
bind_or_track() {
  bind "$1" "$2" || secret_fail=1
}

# Cloud Run API runtime + GHA ops (via impersonation of runner).
for SEC in clinic-staging-demo-password clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  bind_or_track "$SEC" "$RUNNER_SA"
done

# Deploy, Cloud Build infra, scheduler, platform-admin job (runs as cloudbuild identity in GHA).
for SEC in clinic-staging-demo-password clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  bind_or_track "$SEC" "$CLOUDBUILD_SA"
done

# JWT: API runtime only (provision.sh usually binds runner already).
bind_or_track clinic-staging-jwt-secret "$RUNNER_SA"

if [ "$secret_fail" != "0" ]; then
  if ! gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null | grep -qi '^true$'; then
    echo "Secret IAM blocked: billingEnabled=false on ${PROJECT}. Re-link billing, wait ~2 min, re-run." >&2
  else
    echo "Secret IAM incomplete. Use: gcloud auth login (Owner on ${PROJECT}) then re-run this script." >&2
  fi
  exit 1
fi

if [ "$SKIP_WIF" = "1" ]; then
  echo "SKIP_WIF=1: skipping runner impersonation bindings (already applied manually)."
else
  GITHUB_SA="${GITHUB_SA:-github-clinic-erp-staging@${PROJECT}.iam.gserviceaccount.com}"
  wif_fail=0
  for ROLE in roles/iam.serviceAccountUser roles/iam.serviceAccountTokenCreator; do
    if gcloud iam service-accounts add-iam-policy-binding "$RUNNER_SA" \
      --project="$PROJECT" \
      --member="serviceAccount:${GITHUB_SA}" \
      --role="$ROLE" \
      --quiet 2>/dev/null; then
      echo "wif: ${GITHUB_SA} -> ${RUNNER_SA} (${ROLE})"
    else
      echo "warn: could not bind ${ROLE} on runner (need Service Account Admin, or set SKIP_WIF=1 if already done)" >&2
      wif_fail=1
    fi
  done
  if [ "$wif_fail" != "0" ]; then
    echo "WIF bindings may already exist from an earlier run; verify impersonation in scripts/staging-iam-verify.sh" >&2
  fi
fi

echo "Done. Verify: GCP_STAGING_PROJECT_ID=${PROJECT} bash scripts/staging-iam-verify.sh"
