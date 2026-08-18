#!/usr/bin/env bash
# Download production kaana.db from GCS (litestream replica), migrate dentacare tenant, upload clinic.db replica.
set -euo pipefail

BUCKET="${LITESTREAM_BUCKET:-kaana-prod-db}"
TENANT="${CLINIC_TENANT:-dentacare}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${ROOT}/data"
SOURCE_DB="${DATA_DIR}/kaana.db"
TARGET_DB="${DATA_DIR}/clinic.db"
TOOLS_DIR="${ROOT}/.tools"
LITESTREAM_VERSION="${LITESTREAM_VERSION:-0.3.13}"

ensure_litestream() {
  if command -v litestream >/dev/null 2>&1; then
    command -v litestream
    return
  fi
  mkdir -p "$TOOLS_DIR"
  local bin="${TOOLS_DIR}/litestream"
  if [ -x "$bin" ]; then
    echo "$bin"
    return
  fi

  local os arch url zip
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64) arch=amd64 ;;
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
  esac
  url="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-${os}-${arch}.zip"
  zip="${TOOLS_DIR}/litestream.zip"
  echo "==> Download litestream v${LITESTREAM_VERSION} (${os}-${arch})" >&2
  curl -fsSL "$url" -o "$zip"
  unzip -oq "$zip" -d "$TOOLS_DIR"
  mv "${TOOLS_DIR}/litestream" "$bin"
  chmod +x "$bin"
  rm -f "$zip"
  echo "$bin"
}

ensure_gcs_auth() {
  if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]; then
    return
  fi
  local adc="${HOME}/.config/gcloud/application_default_credentials.json"
  if [ -f "$adc" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$adc"
    return
  fi
  echo "No GCS credentials. Run: gcloud auth application-default login" >&2
  exit 1
}

LITESTREAM="$(ensure_litestream)"
ensure_gcs_auth
mkdir -p "$DATA_DIR"

echo "==> Restore gs://${BUCKET}/kaana.db (litestream replica) → ${SOURCE_DB}"
rm -f "$SOURCE_DB" "${SOURCE_DB}-wal" "${SOURCE_DB}-shm"
"$LITESTREAM" restore -if-replica-exists -o "$SOURCE_DB" "gcs://${BUCKET}/kaana.db"

if [ ! -f "$SOURCE_DB" ]; then
  echo "Failed to restore kaana.db from litestream replica." >&2
  exit 1
fi

echo "==> Migrate tenant: ${TENANT}"
node "${ROOT}/scripts/migrate-from-kaana-db.js" \
  --source "$SOURCE_DB" \
  --target "$TARGET_DB" \
  --tenant "$TENANT"

echo "==> Upload clinic.db → gs://${BUCKET}/clinic.db (litestream replica)"
# Do not delete -wal/-shm: migration uses WAL mode; removing them drops uncheckpointed rows.
"$LITESTREAM" replicate -exec "sleep 35" "$TARGET_DB" "gcs://${BUCKET}/clinic.db" &
REPL_PID=$!
sleep 40
kill "$REPL_PID" 2>/dev/null || true
wait "$REPL_PID" 2>/dev/null || true

echo ""
echo "==> Done."
echo "    Local clinic.db: ${TARGET_DB}"
echo "    GCS replica:     gs://${BUCKET}/clinic.db"
echo "    Next: gcloud builds submit --config cloudbuild.clinic.yaml ."
echo "    Then: ./scripts/setup-clinic-api-backend.sh"
