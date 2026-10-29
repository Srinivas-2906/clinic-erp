#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
mkdir -p e2e/report

free_ports() {
  for port in 3010 5185; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi
  done
  pkill -f "chrome-headless-shell" 2>/dev/null || true
  pkill -f "Google Chrome for Testing" 2>/dev/null || true
  sleep 2
}

run_project() {
  local project=$1
  local extra_env=${2:-}
  echo "==> Playwright ${project}"
  set +e
  if [ -n "$extra_env" ]; then
    env $extra_env npx playwright test --project="$project" 2>&1 | tee "e2e/report/${project}-run.log"
  else
    npx playwright test --project="$project" 2>&1 | tee "e2e/report/${project}-run.log"
  fi
  local code=${PIPESTATUS[0]}
  set -e
  return "$code"
}

code_d=0
code_m=0
free_ports
run_project chromium-desktop || code_d=$?
free_ports
run_project chromium-mobile "E2E_RESET_DB=0" || code_m=$?
free_ports
echo "==> Summary desktop=${code_d} mobile=${code_m}"
if [ "$code_d" != "0" ] || [ "$code_m" != "0" ]; then
  exit 1
fi
