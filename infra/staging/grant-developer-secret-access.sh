#!/usr/bin/env bash
# Grant a developer read access to staging demo password (for local smoke tests only).
# Run as clinic-erp-staging project Owner or Secret Manager Admin.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-clinic-erp-staging}"
SECRET_ID="${SECRET_ID:-clinic-staging-demo-password}"
MEMBER="${1:-}"

if [ -z "$MEMBER" ]; then
  echo "Usage: $0 user:email@example.com"
  echo "Example: $0 user:yarrala.srinivas@gmail.com"
  exit 1
fi

gcloud secrets add-iam-policy-binding "$SECRET_ID" \
  --project="$PROJECT_ID" \
  --member="$MEMBER" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "Granted secretAccessor on ${SECRET_ID} to ${MEMBER}"
