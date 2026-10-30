#!/usr/bin/env bash
# Native Android Maestro — isolated E2E API + release APK (no staging/prod).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
API="$ROOT/apps/api"
DB_PATH="${DATABASE_PATH:-$ROOT/apps/api/data/e2e/clinic.db}"
export DATABASE_PATH="$DB_PATH"
export SKIP_DEMO_SEED="${SKIP_DEMO_SEED:-0}"
export PORT="${PORT:-3010}"
export EXPO_PUBLIC_CLINIC_API="${EXPO_PUBLIC_CLINIC_API:-http://10.0.2.2:${PORT}}"

MAESTRO_EMAIL="${MAESTRO_CLINIC_EMAIL:-e2e-receptionist@dentacare.in}"
MAESTRO_PASSWORD="${MAESTRO_CLINIC_PASSWORD:-E2eTest@2026}"
MAESTRO_TENANT="${MAESTRO_CLINIC_TENANT:-dentacare}"

echo "==> Prepare E2E database at $DB_PATH"
mkdir -p "$(dirname "$DB_PATH")"
if [[ ! -f "$DB_PATH" ]]; then
  (cd "$API" && node -e "
    process.env.DATABASE_PATH='$DB_PATH';
    import('./src/db/index.js').then(({ initDatabase, closeDatabase }) => {
      initDatabase();
      closeDatabase();
    });
  ")
fi
(cd "$API" && node scripts/seed-e2e-local.js)
(cd "$API" && node scripts/seed-maestro-mobile.js)

echo "==> Start API on :$PORT"
(cd "$API" && node src/index.js) &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null

echo "==> Prebuild Android (package in.kaana.clinicerp)"
cd "$MOBILE"
export EXPO_PUBLIC_CLINIC_API
npx expo prebuild --platform android --no-install --clean

echo "==> Build release APK (bundled JS, x86_64 for emulator)"
cd "$MOBILE/android"
./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 -x lint -x test

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK" ]]; then
  APK="$MOBILE/android/app/build/outputs/apk/release/app-release-unsigned.apk"
fi
[[ -f "$APK" ]] || { echo "APK not found"; ls -la "$MOBILE/android/app/build/outputs/apk/release/" || true; exit 1; }

echo "==> Install & launch"
adb wait-for-device
adb install -r "$APK"
adb shell am force-stop in.kaana.clinicerp || true
adb shell monkey -p in.kaana.clinicerp -c android.intent.category.LAUNCHER 1

export MAESTRO_CLINIC_EMAIL="$MAESTRO_EMAIL"
export MAESTRO_CLINIC_PASSWORD="$MAESTRO_PASSWORD"
export MAESTRO_CLINIC_TENANT="$MAESTRO_TENANT"
export MAESTRO_PHONE_TAIL="${MAESTRO_PHONE_TAIL:-$(date +%s | tail -c 8)}"

if ! command -v maestro >/dev/null; then
  echo "Installing Maestro CLI..."
  curl -Ls "https://get.mobile.dev" | bash
  export PATH="$HOME/.maestro/bin:$PATH"
fi

echo "==> Maestro flows (receptionist)"
cd "$MOBILE"
maestro test .maestro/login-smoke.yaml
maestro test .maestro/reception-book-tab.yaml
maestro test .maestro/reception-register.yaml

echo "==> Maestro doctor consult"
MAESTRO_CLINIC_EMAIL="${MAESTRO_DOCTOR_EMAIL:-e2e-doctor@dentacare.in}" \
MAESTRO_CLINIC_PASSWORD="$MAESTRO_PASSWORD" \
  maestro test .maestro/doctor-consult-smoke.yaml

echo "==> Maestro billing"
maestro test .maestro/billing-smoke.yaml

echo "==> Native Android Maestro complete"
