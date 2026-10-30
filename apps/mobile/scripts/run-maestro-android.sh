#!/usr/bin/env bash
# Install prebuilt APK on running emulator, start isolated API, run Maestro (no Gradle).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
API="$ROOT/apps/api"
APK="${APK_PATH:-$MOBILE/build/clinic-mobile-release.apk}"
DB_PATH="${DATABASE_PATH:-$ROOT/apps/api/data/e2e/clinic.db}"
export DATABASE_PATH="$DB_PATH"
export PORT="${PORT:-3010}"

MAESTRO_EMAIL="${MAESTRO_CLINIC_EMAIL:-e2e-receptionist@dentacare.in}"
MAESTRO_PASSWORD="${MAESTRO_CLINIC_PASSWORD:-E2eTest@2026}"
MAESTRO_TENANT="${MAESTRO_CLINIC_TENANT:-dentacare}"

[[ -f "$APK" ]] || { echo "APK not found at $APK"; exit 1; }

echo "==> Seed E2E database at $DB_PATH"
mkdir -p "$(dirname "$DB_PATH")"
if [[ ! -f "$DB_PATH" ]]; then
  (cd "$API" && DATABASE_PATH="$DB_PATH" node -e "
    import('./src/db/index.js').then(({ initDatabase, closeDatabase }) => {
      initDatabase();
      closeDatabase();
    });
  ")
fi
(cd "$API" && DATABASE_PATH="$DB_PATH" node scripts/seed-e2e-local.js)
(cd "$API" && DATABASE_PATH="$DB_PATH" node scripts/seed-maestro-mobile.js)

echo "==> Start API on 0.0.0.0:$PORT (emulator via 10.0.2.2)"
export DATABASE_PATH
(cd "$API" && PORT="$PORT" node src/index.js) &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null
echo "API health OK"

echo "==> Install APK"
adb wait-for-device
adb install -r "$APK"
adb shell am force-stop in.kaana.clinicerp || true
adb shell monkey -p in.kaana.clinicerp -c android.intent.category.LAUNCHER 1
sleep 3

if ! command -v maestro >/dev/null; then
  curl -Ls "https://get.mobile.dev" | bash
  export PATH="$HOME/.maestro/bin:$PATH"
fi

export MAESTRO_CLINIC_EMAIL="$MAESTRO_EMAIL"
export MAESTRO_CLINIC_PASSWORD="$MAESTRO_PASSWORD"
export MAESTRO_CLINIC_TENANT="$MAESTRO_TENANT"
export MAESTRO_PHONE_TAIL="${MAESTRO_PHONE_TAIL:-$(date +%s | tail -c 8)}"

cd "$MOBILE"
FLOWS=(
  login-smoke.yaml
  reception-register.yaml
  reception-book-tab.yaml
  reception-book-appointment.yaml
  reception-check-in.yaml
  billing-smoke.yaml
)

for f in "${FLOWS[@]}"; do
  echo "==> Maestro $f"
  maestro test ".maestro/$f"
done

echo "==> Maestro doctor consult"
MAESTRO_CLINIC_EMAIL="${MAESTRO_DOCTOR_EMAIL:-e2e-doctor@dentacare.in}" \
MAESTRO_CLINIC_PASSWORD="$MAESTRO_PASSWORD" \
  maestro test .maestro/doctor-consult-smoke.yaml

echo "==> Maestro billing partial"
maestro test .maestro/billing-partial.yaml

echo "==> All Maestro flows passed"
