#!/usr/bin/env bash
# Email notification channel + basic alert policies for clinic-erp-staging.
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
ALERT_EMAIL="${STAGING_ALERT_EMAIL:-}"

if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project"
  exit 1
fi
if [ -z "$ALERT_EMAIL" ]; then
  echo '{"ok":false,"reason":"STAGING_ALERT_EMAIL unset"}'
  exit 1
fi

CHANNEL_ID="$(gcloud alpha monitoring channels list --project="$PROJECT" --format=json \
  | node -e "
const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
const email=process.env.ALERT_EMAIL;
const hit=rows.find(r=>r.type==='email' && r.labels?.email_address===email);
console.log(hit?.name?.split('/').pop()||'');
" ALERT_EMAIL="$ALERT_EMAIL" 2>/dev/null || true)"

if [ -z "$CHANNEL_ID" ]; then
  CHANNEL_ID="$(gcloud alpha monitoring channels create \
    --project="$PROJECT" \
    --display-name="clinic-staging-ops" \
    --type=email \
    --channel-labels="email_address=${ALERT_EMAIL}" \
    --format='value(name)' | awk -F/ '{print $NF}')"
fi

upsert_policy() {
  local id="$1" json="$2"
  if gcloud monitoring policies describe "$id" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud monitoring policies update "$id" --project="$PROJECT" --policy-from-file="$json" --quiet
  else
    gcloud monitoring policies create --project="$PROJECT" --policy-from-file="$json" --quiet
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/api-5xx.json" <<EOF
{
  "displayName": "clinic-staging-api-5xx-rate",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["projects/${PROJECT}/notificationChannels/${CHANNEL_ID}"],
  "conditions": [{
    "displayName": "Cloud Run 5xx rate",
    "conditionThreshold": {
      "filter": "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"clinic-api-staging\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 5,
      "duration": "300s",
      "aggregations": [{ "alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_RATE" }]
    }
  }]
}
EOF

cat >"$TMP/api-instances.json" <<EOF
{
  "displayName": "clinic-staging-api-multi-instance",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["projects/${PROJECT}/notificationChannels/${CHANNEL_ID}"],
  "conditions": [{
    "displayName": "API instance count > 1",
    "conditionThreshold": {
      "filter": "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"clinic-api-staging\" AND metric.type = \"run.googleapis.com/container/instance_count\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1,
      "duration": "120s",
      "aggregations": [{ "alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_MAX" }]
    }
  }]
}
EOF

cat >"$TMP/log-writer-lease.json" <<EOF
{
  "displayName": "clinic-staging-writer-lease-fatal",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["projects/${PROJECT}/notificationChannels/${CHANNEL_ID}"],
  "conditions": [{
    "displayName": "writer-lease FATAL log",
    "conditionMatchedLog": {
      "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"clinic-api-staging\" AND textPayload=~\"writer-lease.*FATAL\""
    }
  }]
}
EOF

cat >"$TMP/log-litestream.json" <<EOF
{
  "displayName": "clinic-staging-litestream-error",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["projects/${PROJECT}/notificationChannels/${CHANNEL_ID}"],
  "conditions": [{
    "displayName": "Litestream ERROR",
    "conditionMatchedLog": {
      "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"clinic-api-staging\" AND (textPayload=~\"litestream\" OR textPayload=~\"Litestream\") AND severity>=ERROR"
    }
  }]
}
EOF

upsert_policy "clinic-staging-api-5xx-rate" "$TMP/api-5xx.json" || gcloud monitoring policies create --project="$PROJECT" --policy-from-file="$TMP/api-5xx.json" --quiet
upsert_policy "clinic-staging-api-multi-instance" "$TMP/api-instances.json" || true
gcloud monitoring policies create --project="$PROJECT" --policy-from-file="$TMP/log-writer-lease.json" --quiet || true
gcloud monitoring policies create --project="$PROJECT" --policy-from-file="$TMP/log-litestream.json" --quiet || true

echo "{\"ok\":true,\"channelId\":\"${CHANNEL_ID}\",\"policies\":[\"api-5xx\",\"multi-instance\",\"writer-lease-fatal\",\"litestream-error\"]}"
