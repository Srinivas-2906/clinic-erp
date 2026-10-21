#!/usr/bin/env bash
# Wire clinic-api Cloud Run service into the HTTPS load balancer + url map.
# Run once after first `gcloud builds submit --config cloudbuild.clinic.yaml`.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kaana-prod}"
REGION="${REGION:-asia-south1}"
SERVICE="${CLINIC_API_SERVICE:-clinic-api}"
NEG="${CLINIC_API_NEG:-clinic-api-neg}"
BACKEND="${CLINIC_API_BACKEND:-clinic-api-backend}"
URL_MAP="${URL_MAP:-kaana-web-map-multi}"

echo "==> Project: $PROJECT_ID  Region: $REGION  Service: $SERVICE"
gcloud config set project "$PROJECT_ID"

echo "==> Ensure Cloud Run service exists"
gcloud run services describe "$SERVICE" --region "$REGION" >/dev/null

echo "==> Serverless NEG: $NEG"
if ! gcloud compute network-endpoint-groups describe "$NEG" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute network-endpoint-groups create "$NEG" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$SERVICE"
else
  echo "   (exists)"
fi

echo "==> Backend service: $BACKEND"
if ! gcloud compute backend-services describe "$BACKEND" --global >/dev/null 2>&1; then
  gcloud compute backend-services create "$BACKEND" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED
fi

# Idempotent: remove old backend binding if present, then add
gcloud compute backend-services remove-backend "$BACKEND" \
  --global \
  --network-endpoint-group="$NEG" \
  --network-endpoint-group-region="$REGION" 2>/dev/null || true

gcloud compute backend-services add-backend "$BACKEND" \
  --global \
  --network-endpoint-group="$NEG" \
  --network-endpoint-group-region="$REGION"

echo "==> Import URL map (includes clinic-api.kaana.in → $BACKEND)"
gcloud compute url-maps import "$URL_MAP" \
  --source="$(dirname "$0")/url-map-multi.yaml" \
  --global \
  --quiet

echo ""
echo "==> DNS: point clinic-api.kaana.in to your load balancer IP (same A record as kaana.in)"
echo "    CRM frontend stays on crm.dentacare.kaana.in → kaana-clinic-backend"
echo "    API:           clinic-api.kaana.in          → clinic-api-backend"
echo ""
echo "Done."
