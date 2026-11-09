#!/usr/bin/env bash
# Wait until Cloud Run service has no active container instances (best-effort via Monitoring API).
set -euo pipefail

PROJECT="${1:?project}"
REGION="${2:?region}"
SERVICE="${3:?service}"
TIMEOUT_SEC="${4:-600}"
ACCOUNT="${GCLOUD_ACCOUNT:-}"

GCLOUD=(gcloud)
[ -n "$ACCOUNT" ] && GCLOUD+=(--account="$ACCOUNT")

filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND resource.labels.location=\"${REGION}\" AND metric.labels.state=\"active\""
end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
start=$(date -u -v-"${TIMEOUT_SEC}S" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "${TIMEOUT_SEC} seconds ago" +%Y-%m-%dT%H:%M:%SZ)

deadline=$((SECONDS + TIMEOUT_SEC))
while [ "$SECONDS" -lt "$deadline" ]; do
  token=$("${GCLOUD[@]}" auth print-access-token 2>/dev/null) || {
    echo "wait-run-zero: gcloud auth unavailable" >&2
    exit 1
  }
  url="https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?filter=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${filter}'''))")&interval.endTime=${end}&interval.startTime=${start}&aggregation.alignmentPeriod=60s&aggregation.perSeriesAligner=ALIGN_MAX&aggregation.crossSeriesReducer=REDUCE_SUM"
  sum=$(curl -sS -H "Authorization: Bearer ${token}" "$url" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);ts=d.get('timeSeries',[]);print(int(max((p.get('value',{}).get('int64Value',p.get('value',{}).get('doubleValue',0)) for s in ts for p in s.get('points',[])), default=0)))" 2>/dev/null || echo "")
  if [ "${sum:-1}" = "0" ]; then
    echo "wait-run-zero: active instances = 0"
    exit 0
  fi
  echo "wait-run-zero: active instances ≈ ${sum:-unknown}, sleeping 10s..."
  sleep 10
  end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  start=$(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
done
echo "wait-run-zero: timeout after ${TIMEOUT_SEC}s" >&2
exit 1
