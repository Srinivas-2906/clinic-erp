#!/usr/bin/env bash
# Classify Secret Manager readiness (no secret values printed).
set -euo pipefail

PROJECT="${GCP_STAGING_PROJECT_ID:-clinic-erp-staging}"
IMPERSONATE="${GCP_IMPERSONATE_SA:-}"

GCLOUD=(gcloud)
if [ -n "$IMPERSONATE" ]; then
  GCLOUD=(gcloud --impersonate-service-account="$IMPERSONATE")
fi

classify() {
  local secret="$1"
  local err
  if "${GCLOUD[@]}" secrets versions access latest --secret="$secret" --project="$PROJECT" >/dev/null 2>&1; then
    echo "{\"secret\":\"${secret}\",\"status\":\"ok\"}"
    return 0
  fi
  err="$("${GCLOUD[@]}" secrets versions access latest --secret="$secret" --project="$PROJECT" 2>&1 >/dev/null || true)"
  if echo "$err" | grep -qiE 'PERMISSION_DENIED|403'; then
    echo "{\"secret\":\"${secret}\",\"status\":\"iam_denied\",\"identity\":\"${IMPERSONATE:-active}\"}"
  elif echo "$err" | grep -qiE 'DISABLED|destroyed'; then
    echo "{\"secret\":\"${secret}\",\"status\":\"disabled_version\"}"
  elif echo "$err" | grep -qiE 'NOT_FOUND|404'; then
    if "${GCLOUD[@]}" secrets describe "$secret" --project="$PROJECT" >/dev/null 2>&1; then
      echo "{\"secret\":\"${secret}\",\"status\":\"missing_version\"}"
    else
      echo "{\"secret\":\"${secret}\",\"status\":\"missing_secret\"}"
    fi
  else
    echo "{\"secret\":\"${secret}\",\"status\":\"error\"}"
  fi
  return 1
}

required_ok=1
optional_ok=1
classify clinic-staging-demo-password || required_ok=0
for SEC in clinic-staging-provisioning-key clinic-staging-platform-admin-password; do
  classify "$SEC" || optional_ok=0
done
if [ "$required_ok" = "0" ]; then
  exit 1
fi
exit 0
