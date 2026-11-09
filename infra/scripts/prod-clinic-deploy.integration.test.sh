#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY="${ROOT}/infra/scripts/prod-clinic-safe-deploy.sh"
fail() { echo "FAIL: $*" >&2; exit 1; }

bash -n "$DEPLOY" || fail "syntax"
grep -q 'CONFIRM_PROD_CLINIC_DEPLOY' "$DEPLOY" || fail "missing confirm flag"
grep -q 'crucial-accord-505607-g9-db' "$DEPLOY" || fail "missing prod bucket allowlist"
grep -q 'maintenance_halt\|MAINTENANCE HALT' "$DEPLOY" || fail "missing halt"
grep -q 'clinic-erp-staging' "$DEPLOY" && grep -q 'Refusing' "$DEPLOY" || true

export CONFIRM_PROD_CLINIC_DEPLOY=1
export PROD_CLINIC_DEPLOY_DRY_RUN=1
bash "$DEPLOY" test:latest || fail "dry-run failed"
echo "OK: prod-clinic-deploy integration"
