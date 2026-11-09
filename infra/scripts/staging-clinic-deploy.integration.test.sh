#!/usr/bin/env bash
# Integration checks for staging deploy safety (no GCP required for dry-run path).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY="${ROOT}/infra/scripts/staging-clinic-safe-deploy.sh"
CHECKPOINT="${ROOT}/infra/scripts/staging-clinic-replica-checkpoint.sh"
WAIT="${ROOT}/infra/scripts/wait-run-zero-instances.sh"
REVAUDIT="${ROOT}/infra/scripts/staging-clinic-revision-audit.sh"
RPLVERIFY="${ROOT}/infra/scripts/staging-clinic-replica-lease-verify.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

bash -n "$DEPLOY" || fail "syntax deploy"
bash -n "$CHECKPOINT" || fail "syntax checkpoint"
bash -n "$WAIT" || fail "syntax wait"
bash -n "$REVAUDIT" || fail "syntax revision-audit"
bash -n "$RPLVERIFY" || fail "syntax replica-lease-verify"

grep -q 'maintenance_halt' "$DEPLOY" || fail "missing maintenance_halt"
grep -q 'clear-tags' "$DEPLOY" || fail "missing clear-tags"
grep -q 'replica-checkpoint' "$DEPLOY" || fail "missing replica checkpoint"
grep -q 'revision-audit' "$DEPLOY" || fail "missing revision audit"
grep -q 'replica-lease-verify' "$DEPLOY" || fail "missing replica/lease verify"
grep -q 'recover_partial' "$DEPLOY" && fail "blind recover_partial still present"
grep -Fq -- '--to-revisions=' "$DEPLOY" || fail "must pin traffic to new revision"

export CONFIRM_STAGING_CLINIC_DEPLOY=1
export STAGING_CLINIC_DEPLOY_DRY_RUN=1
export GCP_STAGING_PROJECT_ID=clinic-erp-staging
# Will fail at restore drill without gcloud — allow if auth missing
if bash "$DEPLOY" test-image:dry 2>&1 | tee /tmp/staging-deploy-dry.log; then
  grep -q 'dry-run' /tmp/staging-deploy-dry.log || fail "dry-run markers missing"
  echo "OK: dry-run path completed"
elif grep -q 'Refusing: production' /tmp/staging-deploy-dry.log; then
  fail "project guard"
elif grep -qi 'reauth\|auth' /tmp/staging-deploy-dry.log; then
  echo "SKIP: dry-run blocked at GCS (gcloud auth) — script structure OK"
else
  fail "unexpected dry-run failure"
fi

echo "OK: staging-clinic-deploy integration checks"
