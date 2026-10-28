#!/usr/bin/env bash
# Emit deployment trace JSON (no secrets). Requires gcloud auth on clinic-erp-staging.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_STAGING_REGION:-asia-south1}"
MAIN_SHA="${MAIN_SHA:-unknown}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi

describe_service() {
  local name="$1"
  gcloud run services describe "$name" \
    --project="$PROJECT" --region="$REGION" \
    --format=json 2>/dev/null || echo '{}'
}

api_json="$(describe_service clinic-api-staging)"
crm_json="$(describe_service kaana-clinic-staging)"

node -e "
const api = JSON.parse(process.argv[1]);
const crm = JSON.parse(process.argv[2]);
function pick(svc, label) {
  const rev = svc.status?.latestReadyRevisionName || null;
  const url = svc.status?.url || null;
  const image = svc.spec?.template?.spec?.containers?.[0]?.image || null;
  const created = svc.metadata?.annotations?.['run.googleapis.com/client-version'] || null;
  return { service: label, url, latestReadyRevision: rev, image, clientVersion: created };
}
console.log(JSON.stringify({
  project: process.argv[3],
  region: process.argv[4],
  mainCommit: process.argv[5],
  recordedAt: new Date().toISOString(),
  api: pick(api, 'clinic-api-staging'),
  crm: pick(crm, 'kaana-clinic-staging'),
}, null, 2));
" "$api_json" "$crm_json" "$PROJECT" "$REGION" "$MAIN_SHA"
