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

free_ports
npx playwright test --project=chromium-desktop --project=chromium-mobile 2>&1 | tee e2e/report/full-run.log
