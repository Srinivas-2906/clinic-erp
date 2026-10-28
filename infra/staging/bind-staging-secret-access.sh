#!/usr/bin/env bash
# Per-secret secretAccessor for staging ops identities (run once as Project Owner / SM Admin).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
CLOUDBUILD_SA="${CLOUDBUILD_SA:-clinic-staging-cloudbuild@${PROJECT}.iam.gserviceaccount.com}"
RUNNER_SA="${RUNNER_SA:-clinic-staging-runner@${PROJECT}.iam.gserviceaccount.com}"
GITHUB_SA="${GITHUB_SA:-github-clinic-erp-staging@${PROJECT}.iam.gserviceaccount.com}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

for SEC in clinic-staging-demo-password clinic-staging-provisioning-key clinic-staging-platform-admin-password clinic-staging-jwt-secret; do
  if ! gcloud secrets describe "$SEC" --project="$PROJECT" >/dev/null 2>&1; then
    echo "skip (not found): $SEC"
    continue
  fi
  for SA in "$RUNNER_SA" "$CLOUDBUILD_SA" "$GITHUB_SA"; do
    gcloud secrets add-iam-policy-binding "$SEC" \
      --project="$PROJECT" \
      --member="serviceAccount:${SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet
    echo "bound: $SEC -> $SA"
  done
done

echo "Done. Re-run GitHub workflow: Staging ops (confirm=run-staging-ops)."
