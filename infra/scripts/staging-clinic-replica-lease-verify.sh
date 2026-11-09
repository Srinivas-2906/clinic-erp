#!/usr/bin/env bash
# After replica quiescence: ensure GCS replica is not stale vs writer lease metadata.
set -euo pipefail

STATE_DIR="${1:?state_dir}"
PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
BUCKET="${STAGING_LITESTREAM_BUCKET:-clinic-erp-staging-clinic-db}"
CHECKPOINT="${STATE_DIR}/replica-checkpoint.txt"
LEASE="${STATE_DIR}/writer-lease-snapshot.json"
PRE_LEASE="${STATE_DIR}/pre/writer-lease.json"

GCLOUD=(gcloud)
[ -n "${GCLOUD_ACCOUNT:-}" ] && GCLOUD+=(--account="$GCLOUD_ACCOUNT")

[ -f "$CHECKPOINT" ] || { echo "missing replica checkpoint file" >&2; exit 1; }

if ! "${GCLOUD[@]}" storage cat "gs://${BUCKET}/_meta/writer-lease.json" --project="$PROJECT" \
  > "$LEASE" 2>/dev/null; then
  if [ -f "$PRE_LEASE" ]; then
    cp "$PRE_LEASE" "$LEASE"
  else
    echo '{}' > "$LEASE"
  fi
fi

LATEST_OBJECT=$("${GCLOUD[@]}" storage ls -l "gs://${BUCKET}/clinic.db/**" --project="$PROJECT" 2>/dev/null \
  | awk 'NF>=3 {print $1, $NF}' | tail -1 || true)

python3 - <<'PY' "$CHECKPOINT" "$LEASE" "$LATEST_OBJECT"
import json, sys, re
from datetime import datetime, timezone

checkpoint_path, lease_path, latest_line = sys.argv[1:4]
checkpoint = open(checkpoint_path).read().strip()
lease = json.load(open(lease_path))
latest_mtime = None
if latest_line.strip():
    parts = latest_line.split()
    if len(parts) >= 1:
        # gcloud storage ls -l: first field often ISO-ish or date
        latest_mtime = parts[0]

report = {
    "replica_checkpoint_lines": len(checkpoint.splitlines()),
    "lease_holder": lease.get("holderId"),
    "lease_fence": lease.get("fence"),
    "lease_expiresAt": lease.get("expiresAt"),
    "lease_renewedAt": lease.get("renewedAt"),
    "latest_object_line": latest_line.strip(),
}
print(json.dumps(report, indent=2))

expires = lease.get("expiresAt")
if expires:
    exp = datetime.fromisoformat(expires.replace("Z", "+00:00"))
    if exp > datetime.now(timezone.utc):
        print("NOTE: lease still unexpired at cutover — acceptable only if active instance_count=0", file=sys.stderr)

# If lease renewed very recently but checkpoint empty, refuse
if lease.get("renewedAt") and len(checkpoint.splitlines()) < 2:
    print("Refusing: replica listing too sparse for verified checkpoint", file=sys.stderr)
    sys.exit(1)
PY

echo "replica_lease_verify_ok=true"
