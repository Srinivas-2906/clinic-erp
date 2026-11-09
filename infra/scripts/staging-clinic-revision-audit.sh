#!/usr/bin/env bash
# List clinic-api revisions: traffic %, tags, per-revision min/max scale annotations.
set -euo pipefail

OUT="${1:-/tmp/staging-revision-audit.json}"
PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLINIC_API_STAGING_SERVICE:-clinic-api-staging}"

GCLOUD=(gcloud)
[ -n "${GCLOUD_ACCOUNT:-}" ] && GCLOUD+=(--account="$GCLOUD_ACCOUNT")

"${GCLOUD[@]}" run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --format=json > "${OUT}.svc.json"

"${GCLOUD[@]}" run revisions list --service="$SERVICE" \
  --project="$PROJECT" --region="$REGION" --limit=20 --format=json > "${OUT}.revs.json"

python3 - <<'PY' "$OUT"
import json, sys
out = sys.argv[1]
svc = json.load(open(out + ".svc.json"))
revs = json.load(open(out + ".revs.json"))
traffic = svc.get("status", {}).get("traffic", [])
tags = [t for t in traffic if t.get("tag")]
by_rev = {t.get("revisionName"): t for t in traffic if t.get("revisionName")}
rows = []
for r in revs:
    name = r.get("metadata", {}).get("name", "")
    ann = r.get("metadata", {}).get("annotations", {})
    rows.append({
        "revision": name,
        "active": r.get("status", {}).get("conditions", [{}])[0].get("status") == "True",
        "minScale": ann.get("autoscaling.knative.dev/minScale"),
        "maxScale": ann.get("autoscaling.knative.dev/maxScale"),
        "trafficPercent": by_rev.get(name, {}).get("percent"),
        "tags": [t.get("tag") for t in traffic if t.get("revisionName") == name and t.get("tag")],
        "url": r.get("status", {}).get("url"),
    })
payload = {
    "service": svc.get("metadata", {}).get("name"),
    "serviceScalingMode": svc.get("metadata", {}).get("annotations", {}).get("run.googleapis.com/scalingMode"),
    "trafficTagsRemaining": tags,
    "revisions": rows,
}
json.dump(payload, open(out, "w"), indent=2)
if tags:
    print("WARN: traffic tags still present after clear-tags:", [t.get("tag") for t in tags], file=sys.stderr)
    sys.exit(1)
PY

echo "revision_audit=${OUT}"
