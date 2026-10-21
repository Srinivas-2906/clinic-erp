#!/usr/bin/env bash
# Read-only production baseline capture. Run locally after: gcloud auth login
set -euo pipefail

PROJECT="${GCP_PROJECT:-kaana-prod}"
REGION="${GCP_REGION:-asia-south1}"
OUT="${1:-./production-baseline-$(date +%Y%m%d-%H%M%S).txt}"

{
  echo "=== gcloud identity ==="
  gcloud auth list
  gcloud config get-value account
  gcloud config get-value project
  echo

  echo "=== project ==="
  gcloud projects describe "$PROJECT" --format='yaml(projectId,projectNumber,name)' || true
  echo

  echo "=== Cloud Run: clinic-api ==="
  gcloud run services describe clinic-api --project "$PROJECT" --region "$REGION" \
    --format='yaml(status.url,status.latestReadyRevisionName,status.traffic,spec.template.metadata.annotations,spec.template.spec.containers[0].image)' || true
  echo

  echo "=== Cloud Run: kaana-clinic ==="
  gcloud run services describe kaana-clinic --project "$PROJECT" --region "$REGION" \
    --format='yaml(status.url,status.latestReadyRevisionName,status.traffic,spec.template.spec.containers[0].image)' || true
  echo

  echo "=== Recent Cloud Build (clinic images) ==="
  gcloud builds list --project "$PROJECT" --region "$REGION" --limit=15 \
    --format='table(id,status,createTime,source.repoSource.commitSha,images)' \
    --filter='images:clinic-api OR images:clinic-crm OR substitutions._CLINIC_API_SERVICE:clinic-api' || true
  echo

  echo "=== GCS bucket metadata (Litestream) ==="
  gsutil ls -L -b "gs://${LITESTREAM_BUCKET:-kaana-prod-db}" 2>/dev/null | head -25 || true
} | tee "$OUT"

echo "Wrote $OUT"
