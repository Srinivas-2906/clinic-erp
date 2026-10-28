#!/usr/bin/env bash
# One-command local verification (API + CRM + tests). Does not use GCP.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DATABASE_PATH="${DATABASE_PATH:-$ROOT/apps/api/data/e2e/clinic.db}"
export CLINIC_FILES_STORAGE="${CLINIC_FILES_STORAGE:-memory}"
export CLINIC_FILES_PREFIX="${CLINIC_FILES_PREFIX:-clinic-files-e2e}"
export DISABLE_REMINDER_WORKER="${DISABLE_REMINDER_WORKER:-1}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:5185}"
export E2E_TENANT="${E2E_TENANT:-dentacare}"

MODE="${1:-verify}"
LOG_DIR="${LOG_DIR:-$ROOT/.local-verify/logs}"
mkdir -p "$LOG_DIR"

echo "==> Clinic ERP local verify (mode=$MODE)"
echo "    DATABASE_PATH=$DATABASE_PATH"

step() { echo ""; echo "==> $*"; }

step "Install dependencies (npm ci)"
npm ci --quiet 2>&1 | tee "$LOG_DIR/npm-ci.log" | tail -5

step "API unit + integration tests"
npm run test:api 2>&1 | tee "$LOG_DIR/api-test.log" | tail -20

step "CRM unit tests + typecheck build"
npm test --workspace=apps/crm 2>&1 | tee "$LOG_DIR/crm-unit.log" | tail -15
npm run build --workspace=apps/crm 2>&1 | tee "$LOG_DIR/crm-build.log" | tail -10

step "Playwright browsers"
npm run test:e2e:install --workspace=apps/crm

case "$MODE" in
  smoke)
    step "Playwright smoke (@smoke)"
    npm run test:e2e:smoke --workspace=apps/crm 2>&1 | tee "$LOG_DIR/e2e-smoke.log"
    ;;
  full)
    step "Playwright full local suite"
    npm run test:e2e:full --workspace=apps/crm 2>&1 | tee "$LOG_DIR/e2e-full.log"
    ;;
  verify|*)
    step "Playwright smoke (@smoke)"
    npm run test:e2e:smoke --workspace=apps/crm 2>&1 | tee "$LOG_DIR/e2e-smoke.log"
    ;;
esac

echo ""
echo "Done. Logs: $LOG_DIR"
echo "Screenshots (on failure): apps/crm/e2e/test-results"
echo "HTML report: apps/crm/e2e/report — npm run test:e2e:report --workspace=apps/crm"
