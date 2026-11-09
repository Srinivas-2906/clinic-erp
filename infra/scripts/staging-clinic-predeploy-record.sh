#!/usr/bin/env bash
# Save staging clinic-api state before maintenance deploy (read-only).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLINIC_API_STAGING_SERVICE:-clinic-api-staging}"
BUCKET="${STAGING_LITESTREAM_BUCKET:-clinic-erp-staging-clinic-db}"
OUT_DIR="${1:-/tmp/staging-clinic-predeploy-$(date -u +%Y%m%dT%H%M%SZ)}"

GCLOUD=(gcloud)
[ -n "${GCLOUD_ACCOUNT:-}" ] && GCLOUD+=(--account="$GCLOUD_ACCOUNT")

mkdir -p "$OUT_DIR"
"${GCLOUD[@]}" run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --format=yaml > "$OUT_DIR/service.yaml"
"${GCLOUD[@]}" run revisions list --service="$SERVICE" \
  --project="$PROJECT" --region="$REGION" --limit=10 --format=yaml > "$OUT_DIR/revisions.yaml"

"${GCLOUD[@]}" run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --format=json > "$OUT_DIR/service.json"
python3 -c "
import json,sys
svc=json.load(open(sys.argv[1]))
traffic=svc.get('status',{}).get('traffic',[])
tags=[t for t in traffic if t.get('tag')]
print(json.dumps({'traffic': traffic, 'tags': tags, 'url': svc.get('status',{}).get('url')}, indent=2))
" "$OUT_DIR/service.json" > "$OUT_DIR/traffic.json"

if gcloud storage cat "gs://${BUCKET}/_meta/writer-lease.json" --project="$PROJECT" 2>/dev/null > "$OUT_DIR/writer-lease.json"; then
  echo "writer_lease_recorded=true"
else
  echo '{}' > "$OUT_DIR/writer-lease.json"
  echo "writer_lease_recorded=false"
fi

bash "$(dirname "$0")/staging-clinic-replica-checkpoint.sh" 60 10 1 \
  && cp /tmp/staging-replica-checkpoint.txt "$OUT_DIR/replica-checkpoint.txt" 2>/dev/null || true

echo "predeploy_record_dir=${OUT_DIR}"
