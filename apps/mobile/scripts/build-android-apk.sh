#!/usr/bin/env bash
# Build release APK for emulator (x86_64). No device/emulator required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
ARCH="${ANDROID_APK_ARCH:-x86_64}"
export EXPO_PUBLIC_CLINIC_API="${EXPO_PUBLIC_CLINIC_API:-http://10.0.2.2:3010}"
export NODE_PATH="${NODE_PATH:-$ROOT/node_modules}"
export CI="${CI:-1}"
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

align_react_native_for_bundle() {
  local mobile_rn="$MOBILE/node_modules/react-native/package.json"
  if [[ ! -f "$mobile_rn" ]]; then
    echo "Missing $mobile_rn — run npm ci from repo root"
    exit 1
  fi
  local want
  want="$(node -p "require('$mobile_rn').version")"
  local root_rn="$ROOT/node_modules/react-native/package.json"
  local have=""
  if [[ -f "$root_rn" ]]; then
    have="$(node -p "require('$root_rn').version")"
  fi
  if [[ "$have" != "$want" ]]; then
    echo "==> Align hoisted react-native (${have:-none}) -> $want for release bundle"
    rm -rf "$ROOT/node_modules/react-native"
    cp -a "$MOBILE/node_modules/react-native" "$ROOT/node_modules/react-native"
  fi
  node -e "const v=require(process.argv[1]).version; const w=process.argv[2]; if(v!==w){console.error('react-native version mismatch',v,'expected',w); process.exit(1)}" "$ROOT/node_modules/react-native/package.json" "$want"
}

align_react_native_for_bundle

mkdir -p "$MOBILE/build"
OUT="$MOBILE/build/clinic-mobile-release.apk"
if [[ "${FORCE_ANDROID_APK_BUILD:-0}" != "1" && -f "$OUT" ]]; then
  echo "Using existing APK at $OUT (FORCE_ANDROID_APK_BUILD=1 to rebuild)"
  exit 0
fi

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
