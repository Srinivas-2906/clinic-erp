#!/usr/bin/env bash
# Build release APK for emulator (x86_64). No device/emulator required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
ARCH="${ANDROID_APK_ARCH:-x86_64}"
export EXPO_PUBLIC_CLINIC_API="${EXPO_PUBLIC_CLINIC_API:-http://10.0.2.2:3010}"
export NODE_PATH="${NODE_PATH:-$ROOT/node_modules}"
export CI=1
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "==> Expo prebuild (android)"
cd "$MOBILE"
npx expo prebuild --platform android --no-install --clean
node scripts/strip-expo-file-system.js
node scripts/patch-android-settings.js

echo "==> Gradle assembleRelease (arch=$ARCH)"
cd "$MOBILE/android"
chmod +x gradlew
./gradlew :app:assembleRelease -PreactNativeArchitectures="$ARCH" -x lint -x test --stacktrace

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK" ]]; then
  APK="$MOBILE/android/app/build/outputs/apk/release/app-release-unsigned.apk"
fi
if [[ ! -f "$APK" ]]; then
  echo "APK missing under android/app/build/outputs/apk/release/"
  ls -la "$MOBILE/android/app/build/outputs/apk/release/" 2>/dev/null || true
  exit 1
fi

mkdir -p "$MOBILE/build"
OUT="$MOBILE/build/clinic-mobile-release.apk"
cp "$APK" "$OUT"
echo "APK_BUILT=$OUT"
echo "Built $(du -h "$OUT" | cut -f1) release APK at $OUT"
