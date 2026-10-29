#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx playwright test --project=chromium-desktop
code_d=$?
npx playwright test --project=chromium-mobile
code_m=$?
if [ "$code_d" != "0" ] || [ "$code_m" != "0" ]; then
  exit 1
fi
