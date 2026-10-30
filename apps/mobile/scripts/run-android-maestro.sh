#!/usr/bin/env bash
# Local: build APK then run Maestro (requires emulator + adb).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
bash "$ROOT/apps/mobile/scripts/build-android-apk.sh"
export APK_PATH="$ROOT/apps/mobile/build/clinic-mobile-release.apk"
bash "$ROOT/apps/mobile/scripts/run-maestro-android.sh"
