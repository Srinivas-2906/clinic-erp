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

if [ "${E2E_REUSE_SERVERS:-0}" != "1" ]; then
  for port in 3010 5185; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "    freeing port $port (pids: $pids)"
      kill -9 $pids 2>/dev/null || true
    fi
  done
  sleep 1
fi

step() { echo ""; echo "==> $*"; }

if [ "${VERIFY_SKIP_NPM_CI:-0}" = "1" ]; then
  step "Skip npm ci (VERIFY_SKIP_NPM_CI=1)"
else
  step "Install dependencies (npm ci)"
  set +e
  npm ci --quiet 2>&1 | tee "$LOG_DIR/npm-ci.log" | tail -5
  ci_status=${PIPESTATUS[0]}
  set -e
  if [ "$ci_status" -ne 0 ]; then
    echo "    npm ci failed (exit $ci_status) — rebuilding native modules and continuing"
    npm rebuild better-sqlite3 2>&1 | tee -a "$LOG_DIR/npm-ci.log" | tail -5
    if ! node -e "require('better-sqlite3')" 2>/dev/null; then
      echo "FATAL: better-sqlite3 unavailable after rebuild"
      exit 1
    fi
  fi
fi

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
    step "Playwright full local suite (desktop then mobile)"
    PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" npm run test:e2e:full --workspace=apps/crm 2>&1 | tee "$LOG_DIR/e2e-full.log"
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
