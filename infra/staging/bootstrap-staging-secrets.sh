#!/usr/bin/env bash
# Create missing staging-only secrets and bind secretAccessor (never print values).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
CLOUDBUILD_SA="${CLOUDBUILD_SA:-clinic-staging-cloudbuild@${PROJECT}.iam.gserviceaccount.com}"
RUNNER_SA="${RUNNER_SA:-clinic-staging-runner@${PROJECT}.iam.gserviceaccount.com}"
GITHUB_SA="${GITHUB_SA:-github-clinic-erp-staging@${PROJECT}.iam.gserviceaccount.com}"
IMPERSONATE="${GCP_IMPERSONATE_SA:-}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

GCLOUD=(gcloud)
if [ -n "$IMPERSONATE" ]; then
  GCLOUD=(gcloud --impersonate-service-account="$IMPERSONATE")
fi

ensure_secret() {
  local id="$1"
  local create="${2:-0}"
  if "${GCLOUD[@]}" secrets describe "$id" --project="$PROJECT" >/dev/null 2>&1; then
    echo "exists: $id"
    return 0
  fi
  if [ "$create" != "1" ]; then
    echo "missing (preserve): $id"
    return 1
  fi
  openssl rand -base64 32 | "${GCLOUD[@]}" secrets create "$id" \
    --project="$PROJECT" \
    --replication-policy=automatic \
    --data-file=-
  echo "created: $id"
}

bind_accessor() {
  local id="$1"
  local member="$2"
  "${GCLOUD[@]}" secrets add-iam-policy-binding "$id" \
    --project="$PROJECT" \
    --member="serviceAccount:${member}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null 2>&1 || true
}

# Demo password: must already exist (Cloud Run deploy depends on it).
ensure_secret clinic-staging-demo-password 0 || exit 1

# Optional ops secrets — create if missing.
ensure_secret clinic-staging-provisioning-key 1 || true
ensure_secret clinic-staging-platform-admin-password 1 || true

for SEC in clinic-staging-demo-password clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  if "${GCLOUD[@]}" secrets describe "$SEC" --project="$PROJECT" >/dev/null 2>&1; then
    for SA in "$CLOUDBUILD_SA" "$RUNNER_SA" "$GITHUB_SA"; do
      bind_accessor "$SEC" "$SA"
    done
    echo "iam: $SEC"
  fi
done

echo '{"ok":true,"project":"'"$PROJECT"'"}'
