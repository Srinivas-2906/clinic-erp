#!/usr/bin/env bash
# Staging-only maintenance deploy — single SQLite writer.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLINIC_API_STAGING_SERVICE:-clinic-api-staging}"
BUCKET="${STAGING_LITESTREAM_BUCKET:-clinic-erp-staging-clinic-db}"
IMAGE="${1:-}"
GCLOUD_ACCOUNT="${GCLOUD_ACCOUNT:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="${STAGING_DEPLOY_STATE_DIR:-/tmp/staging-clinic-deploy-state}"
FAILED=0

GCLOUD=(gcloud)
[ -n "$GCLOUD_ACCOUNT" ] && GCLOUD+=(--account="$GCLOUD_ACCOUNT")

usage() {
  echo "Usage: CONFIRM_STAGING_CLINIC_DEPLOY=1 $0 <staging-image-ref>" >&2
  echo "Dry run: STAGING_CLINIC_DEPLOY_DRY_RUN=1 CONFIRM_STAGING_CLINIC_DEPLOY=1 $0 <image>" >&2
}

if [ "${CONFIRM_STAGING_CLINIC_DEPLOY:-}" != "1" ]; then
  echo "Refusing: export CONFIRM_STAGING_CLINIC_DEPLOY=1" >&2
  exit 1
fi
if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing: production project" >&2
  exit 1
fi
if [ -z "${IMAGE:-}" ]; then usage; exit 1; fi

maintenance_halt() {
  local reason="${1:-unknown}"
  echo "" >&2
  echo "==> MAINTENANCE HALT: ${reason}" >&2
  echo "    Service left at --scaling=0 until operator verifies:" >&2
  echo "      - instance_count = 0 (all revisions)" >&2
  echo "      - gs://${BUCKET}/ replica checkpoint (staging-clinic-replica-checkpoint.sh)" >&2
  echo "      - writer lease gs://${BUCKET}/_meta/writer-lease.json" >&2
  echo "    Recovery commands (run manually after review):" >&2
  echo "      gcloud run services describe ${SERVICE} --project=${PROJECT} --region=${REGION}" >&2
  echo "      gcloud run services update ${SERVICE} --project=${PROJECT} --region=${REGION} --scaling=auto --max-instances=1" >&2
  echo "      gcloud run services update-traffic ${SERVICE} --project=${PROJECT} --region=${REGION} --to-revisions=<VERIFIED_REVISION>=100" >&2
  echo "    Do NOT --to-latest if newer revision was deployed with --no-traffic and never verified." >&2
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
  FAILED=1
    maintenance_halt "script exited with code ${code}"
  fi
}
trap on_exit EXIT

mkdir -p "$STATE_DIR"

if [ "${STAGING_CLINIC_DEPLOY_DRY_RUN:-}" = "1" ]; then
  echo "==> DRY RUN: no GCP mutations (structure check only)"
  echo "[dry-run] staging-clinic-predeploy-record.sh"
  echo "[dry-run] staging-restore-drill.sh"
  echo "[dry-run] clear-tags → scaling=0 → wait zero → replica checkpoint"
  echo "[dry-run] deploy --no-traffic → pin ${SERVICE} traffic to new revision"
  echo "[dry-run] health/lease poll on service URL"
  trap - EXIT
  exit 0
fi

echo "==> Step 0: record predeploy state"
bash "${SCRIPT_DIR}/staging-clinic-predeploy-record.sh" "$STATE_DIR/pre"

echo "==> Step 0b: local restore drill (staging bucket only)"
bash "${SCRIPT_DIR}/../../apps/api/scripts/staging-restore-drill.sh" --sync-only
RESTORE_DB="$(ls -t "${SCRIPT_DIR}/../../.restore-drill"/staging-clinic-restored-*.db 2>/dev/null | head -1 || true)"
if [ -n "$RESTORE_DB" ] && command -v sqlite3 >/dev/null; then
  INTEGRITY="$(sqlite3 "$RESTORE_DB" "PRAGMA integrity_check;")"
  echo "predeploy_restore_db=${RESTORE_DB} integrity=${INTEGRITY}"
  if [ "$INTEGRITY" != "ok" ]; then
    echo "Refusing deploy: staging replica fails integrity" >&2
    exit 1
  fi
else
  bash "${SCRIPT_DIR}/../../apps/api/scripts/staging-restore-drill.sh"
fi

echo "==> Step 1: audit traffic/tags (skip traffic RPC if already pinned to ready revision)"
CURRENT_REV="$("${GCLOUD[@]}" run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --format='value(status.latestReadyRevisionName)')"
if [ -z "$CURRENT_REV" ]; then
  echo "Refusing: no latestReadyRevisionName" >&2
  exit 1
fi
HAS_TAGS="$(python3 -c "
import json,subprocess,sys
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
bash "${SCRIPT_DIR}/staging-clinic-revision-audit.sh" "$STATE_DIR/revision-audit-pre.json"

echo "==> Step 2: service min=0 max=1 auto, then --scaling=0"
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --scaling=auto --min-instances=0 --max-instances=1
# Service metadata run.googleapis.com/maxScale can lag template; set explicitly for SQLite safety.
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --max-instances=1
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --scaling=0

export GCLOUD_ACCOUNT
echo "==> Step 3: wait active instances = 0 (all revisions)"
bash "${SCRIPT_DIR}/wait-run-zero-instances.sh" "$PROJECT" "$REGION" "$SERVICE" 600

echo "==> Step 4: replica checkpoint + lease freshness (not fixed sleep)"
export STAGING_CHECKPOINT_FILE="${STATE_DIR}/replica-checkpoint.txt"
bash "${SCRIPT_DIR}/staging-clinic-replica-checkpoint.sh" 120 15 2
bash "${SCRIPT_DIR}/staging-clinic-replica-lease-verify.sh" "$STATE_DIR" \
  || { echo "Refusing deploy: replica/lease evidence insufficient" >&2; exit 1; }

echo "==> Step 5: deploy candidate (--no-traffic; never probe tag URL)"

NEW_REV="$("${GCLOUD[@]}" run deploy "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --platform=managed --no-traffic \
  --min-instances=0 --max-instances=1 \
  --format='value(status.latestCreatedRevisionName)')"

echo "deployed_revision=${NEW_REV} (no traffic)"

echo "==> Step 6: enable auto scaling max 1, route 100% to NEW revision only"
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --scaling=auto --min-instances=0 --max-instances=1
"${GCLOUD[@]}" run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --max-instances=1

"${GCLOUD[@]}" run services update-traffic "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --to-revisions="${NEW_REV}=100"

echo "==> Step 7: health + lease on service URL (not tag URL)"
API_URL=$("${GCLOUD[@]}" run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --format='value(status.url)')
HEALTH='{"ok":false}'
deadline=$((SECONDS + 180))
while [ "$SECONDS" -lt "$deadline" ]; do
  HEALTH="$(curl -fsS "${API_URL}/api/health" 2>/dev/null || echo '{"ok":false}')"
  if echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if d.get('ok') and (d.get('writerLease') or {}).get('held') else 1)"; then
    break
  fi
  echo "health/lease not ready, retry in 10s..."
  sleep 10
done
echo "$HEALTH" | head -c 1200
echo ""
echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if d.get('ok') and (d.get('writerLease') or {}).get('held') else 1)" \
  || { echo "Health/lease check failed" >&2; exit 1; }

echo "==> Step 8: post-deploy replica + state record"
bash "${SCRIPT_DIR}/staging-clinic-predeploy-record.sh" "$STATE_DIR/post"

bash "${SCRIPT_DIR}/wait-run-zero-instances.sh" "$PROJECT" "$REGION" "$SERVICE" 120 || true
ACTIVE_COUNT="see monitoring"
echo "post_deploy_active_instances=${ACTIVE_COUNT}"
echo "deploy_state_dir=${STATE_DIR}"
echo "==> Staging maintenance deploy complete"

trap - EXIT
