#!/usr/bin/env bash
# Staging-only maintenance cutover — clinic-erp-staging / asia-south1.
# Run from clean checkout at approved SHA. Never use production project.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_STAGING_REGION:-asia-south1}"
API_SVC="${CLINIC_API_SERVICE:-clinic-api-staging}"
CRM_SVC="${CLINIC_CRM_SERVICE:-kaana-clinic-staging}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALERT_EMAIL="${STAGING_ALERT_EMAIL:-}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project" >&2
  exit 1
fi

echo "==> release_sha=$(git -C "$REPO_ROOT" rev-parse HEAD)"

LIVE_API="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" \
  --format='value(status.traffic[0].revisionName)')"
LIVE_CRM="$(gcloud run services describe "$CRM_SVC" --project="$PROJECT" --region="$REGION" \
  --format='value(status.traffic[0].revisionName)')"
echo "rollback_api=$LIVE_API rollback_crm=$LIVE_CRM"

echo "==> restore drill (local read-only)"
GCP_STAGING_PROJECT_ID="$PROJECT" bash "$REPO_ROOT/apps/api/scripts/staging-restore-drill.sh"

GCS_COUNT="$(gcloud storage ls "gs://${PROJECT}-clinic-db/clinic-files-staging/denta-care/" --project="$PROJECT" 2>/dev/null | wc -l | tr -d ' ')"
echo "gcs_denta_care_objects=$GCS_COUNT"
if [ "${GCS_COUNT:-0}" -lt 4 ]; then
  echo "STOP: expected at least 4 legacy clinical objects" >&2
  exit 1
fi

echo "==> provisioning secret + IAM"
GCP_STAGING_PROJECT_ID="$PROJECT" bash "$REPO_ROOT/infra/staging/bootstrap-staging-secrets.sh"

if [ -n "$ALERT_EMAIL" ]; then
  echo "==> monitoring uptime + alerts (email redacted)"
  STAGING_API_URL="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
  STAGING_CRM_URL="$(gcloud run services describe "$CRM_SVC" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
  export GCP_STAGING_PROJECT_ID="$PROJECT" STAGING_API_URL STAGING_CRM_URL
  bash "$REPO_ROOT/scripts/staging-monitoring-setup.sh"
  bash "$REPO_ROOT/scripts/staging-monitoring-alerts.sh"
else
  echo "WARN: STAGING_ALERT_EMAIL unset — uptime only"
  STAGING_API_URL="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
  STAGING_CRM_URL="$(gcloud run services describe "$CRM_SVC" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
  export GCP_STAGING_PROJECT_ID="$PROJECT" STAGING_API_URL STAGING_CRM_URL
  bash "$REPO_ROOT/scripts/staging-monitoring-setup.sh"
fi

echo "==> quiesce API writer"
gcloud run services update "$API_SVC" --project="$PROJECT" --region="$REGION" --scaling=0 --quiet

wait_lease_clear() {
  local attempt
  for attempt in $(seq 1 36); do
    local instances held=unknown
    instances="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" \
      --format='value(status.observedGeneration)' 2>/dev/null || echo 0)"
    held="$(gcloud storage cat "gs://${PROJECT}-clinic-db/_meta/writer-lease.json" --project="$PROJECT" 2>/dev/null \
      | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);const e=Date.parse(j.expiresAt||0);console.log(e>Date.now()?'held':'expired')}catch{console.log('absent')}})" 2>/dev/null || echo absent)"
    echo "lease_probe attempt=$attempt lease=$held"
    if [ "$held" = "expired" ] || [ "$held" = "absent" ]; then
      return 0
    fi
    sleep 10
  done
  echo "STOP: writer lease still active after quiesce" >&2
  exit 1
}
wait_lease_clear

echo "==> API candidate (no traffic)"
CLOUDBUILD_SA="clinic-staging-cloudbuild@${PROJECT}.iam.gserviceaccount.com"
cd "$REPO_ROOT"
gcloud builds submit --project="$PROJECT" \
  --config cloudbuild.staging.yaml \
  --service-account="projects/${PROJECT}/serviceAccounts/${CLOUDBUILD_SA}" \
  .

CANDIDATE_API="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" \
  --format='value(status.latestCreatedRevisionName)')"
TAG_URL="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" \
  --format='yaml(status.trafficStatuses)' | awk '/tag: mvp-candidate/{getline; if(/url:/) print $2}' | head -1)"
if [ -z "$TAG_URL" ]; then
  TAG_URL="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" \
    --format=json | node -e "
const s=JSON.parse(require('fs').readFileSync(0,'utf8'));
const t=(s.status?.trafficStatuses||[]).find(x=>x.tag==='mvp-candidate');
console.log(t?.url||'');
")"
fi
echo "candidate_api=$CANDIDATE_API tag_url_set=$([ -n \"$TAG_URL\" ] && echo yes || echo no)"
HEALTH="$(curl -fsS "${TAG_URL}/api/health")"
echo "$HEALTH" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
if(!j.ok) process.exit(1);
if(!j.writerLease?.held) { console.error('STOP: candidate has no lease'); process.exit(1); }
console.log('candidate_health_ok');
"

echo "==> shift API traffic 100% -> $CANDIDATE_API"
gcloud run services update-traffic "$API_SVC" --project="$PROJECT" --region="$REGION" \
  --to-revisions="${CANDIDATE_API}=100" --quiet
gcloud run services update "$API_SVC" --project="$PROJECT" --region="$REGION" \
  --scaling=auto --max-instances=1 --quiet

echo "==> CRM candidate (no traffic)"
gcloud builds submit --project="$PROJECT" \
  --config cloudbuild.staging-crm.yaml \
  --service-account="projects/${PROJECT}/serviceAccounts/${CLOUDBUILD_SA}" \
  .

CANDIDATE_CRM="$(gcloud run services describe "$CRM_SVC" --project="$PROJECT" --region="$REGION" \
  --format='value(status.latestCreatedRevisionName)')"
CRM_TAG="$(gcloud run services describe "$CRM_SVC" --project="$PROJECT" --region="$REGION" \
  --format=json | node -e "
const s=JSON.parse(require('fs').readFileSync(0,'utf8'));
const t=(s.status?.trafficStatuses||[]).find(x=>x.tag==='crm-candidate');
console.log(t?.url||'');
")"
curl -fsS -o /dev/null "${CRM_TAG}/"
echo "==> shift CRM traffic 100% -> $CANDIDATE_CRM"
gcloud run services update-traffic "$CRM_SVC" --project="$PROJECT" --region="$REGION" \
  --to-revisions="${CANDIDATE_CRM}=100" --quiet

API_URL="$(gcloud run services describe "$API_SVC" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
CRM_URL="$(gcloud run services describe "$CRM_SVC" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
curl -fsS "${API_URL}/api/health" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.ok||!j.writerLease?.held) process.exit(1); console.log('live_api_health_ok');"
curl -fsS -o /dev/null "${CRM_URL}/"
echo "live_api=$API_URL live_crm=$CRM_URL live_api_rev=$CANDIDATE_API live_crm_rev=$CANDIDATE_CRM"
