#!/usr/bin/env bash
# Capture Litestream replica state on staging; wait until WAL tail is quiescent (no new uploads).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
BUCKET="${STAGING_LITESTREAM_BUCKET:-clinic-erp-staging-clinic-db}"
if [ "$PROJECT" = "crucial-accord-505607-g9" ]; then
  echo "Refusing production project" >&2
  exit 1
fi

GCLOUD=(gcloud)
[ -n "${GCLOUD_ACCOUNT:-}" ] && GCLOUD+=(--account="$GCLOUD_ACCOUNT")

snapshot_replica() {
  # Latest 8 objects under clinic.db (paths + update time from listing)
  gcloud storage ls -l "gs://${BUCKET}/clinic.db/**" --project="$PROJECT" 2>/dev/null \
    | tail -8 \
    | awk '{print $1, $2, $NF}' \
    | sort
}

echo "==> replica checkpoint bucket=gs://${BUCKET}/clinic.db/"
WALLS="${1:-120}"
POLL="${2:-15}"
stable_needed="${3:-2}"
stable=0
prev=""
deadline=$((SECONDS + WALLS))

while [ "$SECONDS" -lt "$deadline" ]; do
  cur="$(snapshot_replica)"
  echo "--- snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
  echo "$cur"
  if [ -n "$prev" ] && [ "$cur" = "$prev" ]; then
    stable=$((stable + 1))
    echo "stable_polls=${stable}/${stable_needed}"
    if [ "$stable" -ge "$stable_needed" ]; then
      echo "replica_checkpoint_ok=true"
      echo "$cur" > "${STAGING_CHECKPOINT_FILE:-/tmp/staging-replica-checkpoint.txt}"
      exit 0
    fi
  else
    stable=0
  fi
  prev="$cur"
  sleep "$POLL"
done

echo "replica_checkpoint_ok=false reason=wal_still_changing_after_${WALLS}s" >&2
exit 1
