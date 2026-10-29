#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

free_ports() {
  for port in 3010 5185; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi
  done
  sleep 1
}

free_ports
npx playwright test --project=chromium-desktop
code_d=$?
free_ports
E2E_RESET_DB=0 npx playwright test --project=chromium-mobile
code_m=$?
if [ "$code_d" != "0" ] || [ "$code_m" != "0" ]; then
  exit 1
fi
