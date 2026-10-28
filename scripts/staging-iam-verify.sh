#!/usr/bin/env bash
# Verify staging ops can access secrets (no values printed). Exit 1 if demo password unreachable.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
RUNNER_SA="${RUNNER_SA:-clinic-staging-runner@${PROJECT}.iam.gserviceaccount.com}"
CLOUDBUILD_SA="${CLOUDBUILD_SA:-clinic-staging-cloudbuild@${PROJECT}.iam.gserviceaccount.com}"
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

check_access() {
  local label="$1"
  local secret="$2"
  local sa="$3"
  if [ -z "$sa" ]; then
    if "${GCLOUD[@]}" secrets versions access latest --secret="$secret" --project="$PROJECT" >/dev/null 2>&1; then
      echo "{\"check\":\"access\",\"secret\":\"${secret}\",\"identity\":\"${label}\",\"ok\":true}"
      return 0
    fi
  elif gcloud --impersonate-service-account="$sa" secrets versions access latest \
    --secret="$secret" --project="$PROJECT" >/dev/null 2>&1; then
    echo "{\"check\":\"access\",\"secret\":\"${secret}\",\"identity\":\"${label}\",\"ok\":true}"
    return 0
  fi
  echo "{\"check\":\"access\",\"secret\":\"${secret}\",\"identity\":\"${label}\",\"ok\":false,\"need\":\"roles/secretmanager.secretAccessor on secret for ${sa:-active}\"}"
  return 1
}

demo_ok=0
for pair in "runner:${RUNNER_SA}" "cloudbuild:${CLOUDBUILD_SA}"; do
  label="${pair%%:*}"
  sa="${pair#*:}"
  if check_access "$label" clinic-staging-demo-password "$sa"; then
    demo_ok=1
    break
  fi
done

for SEC in clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  check_access "runner" "$SEC" "$RUNNER_SA" || true
  check_access "cloudbuild" "$SEC" "$CLOUDBUILD_SA" || true
done

# Can GitHub WIF impersonate runner? (needed for ops workflow)
if gcloud --impersonate-service-account="$RUNNER_SA" auth print-access-token --project="$PROJECT" >/dev/null 2>&1; then
  echo "{\"check\":\"impersonation\",\"from\":\"${GITHUB_SA}\",\"to\":\"${RUNNER_SA}\",\"ok\":true}"
else
  echo "{\"check\":\"impersonation\",\"from\":\"${GITHUB_SA}\",\"to\":\"${RUNNER_SA}\",\"ok\":false,\"need\":\"roles/iam.serviceAccountTokenCreator + serviceAccountUser on runner for github SA\"}"
fi

if [ "$demo_ok" = "1" ]; then
  echo '{"ok":true,"demoPasswordReadable":true}'
  exit 0
fi
echo '{"ok":false,"demoPasswordReadable":false,"fix":"Run infra/staging/bind-staging-secret-access.sh as Project Owner on clinic-erp-staging"}'
exit 1
