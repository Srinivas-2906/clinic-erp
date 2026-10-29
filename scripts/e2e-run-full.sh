#!/usr/bin/env bash
# Run desktop then mobile Playwright with clean ports between phases.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/crm"

free_ports() {
  for port in 3010 5185; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi
  done
  sleep 1
}

free_ports
npx playwright test --project=chromium-desktop
d=$?
free_ports
npx playwright test --project=chromium-mobile
m=$?
exit $((d | m))
