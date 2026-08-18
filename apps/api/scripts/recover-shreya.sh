#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REP="$ROOT/data/gcs-restore/new-gcp-replica"
TMP=/tmp/litestream-bin
mkdir -p "$TMP"
if ! command -v litestream >/dev/null 2>&1; then
  if [ ! -x "$TMP/litestream" ]; then
    wget -q "https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb" -O /tmp/litestream.deb
    mkdir -p /tmp/lx
    dpkg-deb -x /tmp/litestream.deb /tmp/lx
    cp /tmp/lx/usr/bin/litestream "$TMP/litestream"
  fi
  export PATH="$TMP:$PATH"
fi

echo "==> Current restore (latest)"
litestream restore -if-replica-exists -o /tmp/clinic-latest.db "file://$REP"
echo -n "patient count: "
sqlite3 /tmp/clinic-latest.db "SELECT COUNT(*) FROM patients;"
sqlite3 /tmp/clinic-latest.db "SELECT id,name,phone,phone_digits,chief_complaint,source,tags,is_returning,last_visit,created_at FROM patients WHERE name LIKE '%Shreya%' OR phone_digits LIKE '%88988%';"

echo ""
echo "==> Point-in-time restores"
for ts in \
  '2026-08-17T00:00:00Z' \
  '2026-08-17T18:00:00Z' \
  '2026-08-18T00:00:00Z' \
  '2026-08-18T05:00:00Z' \
  '2026-08-18T06:00:00Z' \
  '2026-08-18T06:09:00Z' \
  '2026-08-18T06:11:00Z' \
  '2026-08-18T06:12:00Z'; do
  echo "--- $ts ---"
  if litestream restore -timestamp "$ts" -o /tmp/clinic-pts.db "file://$REP" 2>/tmp/litestream-err.txt; then
    echo -n "patients: "
    sqlite3 /tmp/clinic-pts.db "SELECT COUNT(*) FROM patients;" || echo "?"
    sqlite3 /tmp/clinic-pts.db "SELECT id,name,phone,phone_digits,chief_complaint,source,tags,is_returning,last_visit,created_at FROM patients;" 2>/dev/null | head -20
  else
    cat /tmp/litestream-err.txt
  fi
done

echo ""
echo "==> Generation dirs (newest first)"
ls -lt "$REP/generations" | head -15
