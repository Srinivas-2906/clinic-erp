#!/usr/bin/env bash
# Grant GitHub WIF deployer read access to staging validation secrets (least privilege).
# Run as project Owner or Secret Manager Admin on clinic-erp-staging only.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-clinic-erp-staging}"
GITHUB_SA="${GITHUB_SA:-github-clinic-erp-staging@${PROJECT_ID}.iam.gserviceaccount.com}"

if [ "$PROJECT_ID" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

for SECRET_ID in clinic-staging-demo-password clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  if gcloud secrets describe "$SECRET_ID" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET_ID" \
      --project="$PROJECT_ID" \
      --member="serviceAccount:${GITHUB_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet
    echo "Granted secretAccessor on ${SECRET_ID} to ${GITHUB_SA}"
  else
    echo "Skip (not found): ${SECRET_ID}"
  fi
done
