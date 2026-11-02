#!/usr/bin/env bash
# Local-only restore drill: copy source DB to an isolated file and validate.
# Never overwrites DATABASE_PATH or Cloud Run /data paths.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${PILOT_RESTORE_SOURCE:-${DATABASE_PATH:-${ROOT}/data/clinic.db}}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DRILL_DIR="${PILOT_RESTORE_DRILL_DIR:-${ROOT}/../../.pilot-restore-drill}"
OUT="${DRILL_DIR}/local-copy-${STAMP}.db"

mkdir -p "$DRILL_DIR"

if [ ! -f "$SOURCE" ]; then
  echo "Source database not found: $SOURCE" >&2
  echo "Set PILOT_RESTORE_SOURCE or DATABASE_PATH to a readable SQLite file." >&2
  exit 1
fi

case "$(realpath "$SOURCE" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$SOURCE")" in
  /data/clinic.db|/data/*)
    echo "Refusing to copy from live container path: $SOURCE" >&2
    exit 1
    ;;
esac

echo "==> Copy (read-only source): $SOURCE"
echo "==> Isolated destination: $OUT"
cp "$SOURCE" "$OUT"

echo "==> SQLite validation (aggregates only)"
PILOT_RESTORE_DB="$OUT" node "${ROOT}/scripts/pilot-restore-validate.mjs"

echo "==> Clinical file metadata vs storage (if configured)"
if PILOT_RESTORE_DB="$OUT" node "${ROOT}/scripts/pilot-clinical-files-validate.mjs"; then
  echo "files_check=ok"
else
  echo "files_check=missing_objects (see JSON above; expected for local-only DB without uploads dir)"
fi

echo "restored_db=${OUT}"
echo "==> Local drill complete (live source unchanged)."
