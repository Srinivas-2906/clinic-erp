#!/usr/bin/env bash
# Production maintenance deploy — single SQLite writer (READ approval required).
set -euo pipefail

PROJECT="${GCP_PROD_PROJECT_ID:-crucial-accord-505607-g9}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLINIC_PROD_API_SERVICE:-clinic-api}"
BUCKET="${CLINIC_PROD_LITESTREAM_BUCKET:-crucial-accord-505607-g9-db}"
IMAGE="${1:-}"
GCLOUD_ACCOUNT="${GCLOUD_ACCOUNT:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="${PROD_DEPLOY_STATE_DIR:-/tmp/prod-clinic-deploy-state}"

GCLOUD=(gcloud)
[ -n "$GCLOUD_ACCOUNT" ] && GCLOUD+=(--account="$GCLOUD_ACCOUNT")

usage() {
  echo "Usage: CONFIRM_PROD_CLINIC_DEPLOY=1 $0 <prod-image-ref>" >&2
  echo "Dry run: PROD_CLINIC_DEPLOY_DRY_RUN=1 CONFIRM_PROD_CLINIC_DEPLOY=1 $0 <image>" >&2
}

if [ "${CONFIRM_PROD_CLINIC_DEPLOY:-}" != "1" ]; then
  echo "Refusing: export CONFIRM_PROD_CLINIC_DEPLOY=1" >&2
  exit 1
fi
if [ "$PROJECT" != "crucial-accord-505607-g9" ]; then
  echo "Refusing: wrong project ${PROJECT}" >&2
  exit 1
fi
if [ "$BUCKET" != "crucial-accord-505607-g9-db" ]; then
  echo "Refusing: wrong bucket ${BUCKET}" >&2
  exit 1
fi
if [ "$PROJECT" = "clinic-erp-staging" ]; then
  echo "Refusing: use staging-clinic-safe-deploy.sh for staging" >&2
  exit 1
fi
if [ -z "${IMAGE:-}" ]; then usage; exit 1; fi

maintenance_halt() {
  local reason="${1:-unknown}"
  echo "" >&2
  echo "==> PRODUCTION MAINTENANCE HALT: ${reason}" >&2
  echo "    Service left at --scaling=0 until operator verifies lease + replica." >&2
  echo "    Do NOT route traffic to unverified revisions." >&2
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    maintenance_halt "script exited with code ${code}"
  fi
}
trap on_exit EXIT

mkdir -p "$STATE_DIR"

if [ "${PROD_CLINIC_DEPLOY_DRY_RUN:-}" = "1" ]; then
  echo "==> DRY RUN: prod maintenance deploy (no GCP mutations)"
  echo "[dry-run] prod-clinic-predeploy-record.sh"
  echo "[dry-run] prod-restore-drill.sh (requires CLINIC_PROD_RESTORE_AUTHORIZED=1)"
  echo "[dry-run] scaling=0 → checkpoint → deploy --no-traffic → pin revision"
  trap - EXIT
  exit 0
fi

echo "==> Step 0: record predeploy state"
bash "${SCRIPT_DIR}/prod-clinic-predeploy-record.sh" "$STATE_DIR/pre"

echo "==> Step 0b: read-only prod restore drill preflight"
export CLINIC_PROD_RESTORE_AUTHORIZED=1
bash "${SCRIPT_DIR}/../../apps/api/scripts/prod-restore-drill.sh" || {
  echo "Refusing deploy: prod restore drill failed" >&2
  exit 1
}

echo "==> Step 1: audit traffic/tags"
CURRENT_REV="$("${GCLOUD[@]}" run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --format='value(status.latestReadyRevisionName)')"
HAS_TAGS="$(python3 -c "
import json,subprocess
svc=json.loads(subprocess.check_output([
  'gcloud','run','services','describe','${SERVICE}',
  '--project=${PROJECT}','--region=${REGION}','--format=json'
]))
traffic=svc.get('status',{}).get('traffic',[])
print(1 if any(t.get('tag') for t in traffic) else 0)
")"
if [ "$HAS_TAGS" = "1" ]; then
  "${GCLOUD[@]}" run services update-traffic "$SERVICE" \
    --project="$PROJECT" --region="$REGION" --clear-tags
else
  echo "skip clear-tags (no tags)"
fi
export GCP_STAGING_PROJECT_ID="$PROJECT"
export CLINIC_API_STAGING_SERVICE="$SERVICE"
export STAGING_LITESTREAM_BUCKET="$BUCKET"
bash "${SCRIPT_DIR}/staging-clinic-revision-audit.sh" "$STATE_DIR/revision-audit-pre.json"

echo "==> Step 2: min=0 max=1 then --scaling=0"
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --scaling=auto --min-instances=0 --max-instances=1
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --max-instances=1
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --scaling=0

export GCLOUD_ACCOUNT
echo "==> Step 3: wait active instances = 0"
bash "${SCRIPT_DIR}/wait-run-zero-instances.sh" "$PROJECT" "$REGION" "$SERVICE" 600

echo "==> Step 4: replica checkpoint + lease verify"
export STAGING_CHECKPOINT_FILE="${STATE_DIR}/replica-checkpoint.txt"
bash "${SCRIPT_DIR}/prod-clinic-replica-checkpoint.sh" 120 15 2
export GCP_STAGING_PROJECT_ID="$PROJECT"
export STAGING_LITESTREAM_BUCKET="$BUCKET"
bash "${SCRIPT_DIR}/staging-clinic-replica-lease-verify.sh" "$STATE_DIR" \
  || { echo "Refusing deploy: replica/lease evidence insufficient" >&2; exit 1; }

echo "==> Step 5: deploy candidate --no-traffic"
NEW_REV="$("${GCLOUD[@]}" run deploy "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --platform=managed --no-traffic \
  --min-instances=0 --max-instances=1 \
  --format='value(status.latestCreatedRevisionName)')"

echo "==> Step 6: restore scaling; route 100% to NEW revision only"
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --scaling=auto --min-instances=0 --max-instances=1
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --max-instances=1
"${GCLOUD[@]}" run services update-traffic "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --to-revisions="${NEW_REV}=100"

echo "==> Step 7: health + writerLease"
API_URL=$("${GCLOUD[@]}" run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --format='value(status.url)')
HEALTH='{"ok":false}'
deadline=$((SECONDS + 180))
while [ "$SECONDS" -lt "$deadline" ]; do
  HEALTH="$(curl -fsS "${API_URL}/api/health" 2>/dev/null || echo '{"ok":false}')"
  if echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if d.get('ok') and (d.get('writerLease') or {}).get('held') else 1)"; then
    break
  fi
  sleep 10
done
echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if d.get('ok') and (d.get('writerLease') or {}).get('held') else 1)" \
  || { echo "Health/lease check failed" >&2; exit 1; }

bash "${SCRIPT_DIR}/prod-clinic-predeploy-record.sh" "$STATE_DIR/post"
trap - EXIT
echo "==> Production maintenance deploy complete (deploy_state_dir=${STATE_DIR})"
