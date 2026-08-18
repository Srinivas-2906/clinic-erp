#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REP="$ROOT/data/gcs-restore/new-gcp-replica"
OUT="$ROOT/data/recovery"
TMP=/tmp/litestream-bin
mkdir -p "$TMP" "$OUT"
if ! command -v litestream >/dev/null 2>&1; then
  if [ ! -x "$TMP/litestream" ]; then
    wget -q "https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb" -O /tmp/litestream.deb
    mkdir -p /tmp/lx
    dpkg-deb -x /tmp/litestream.deb /tmp/lx
    cp /tmp/lx/usr/bin/litestream "$TMP/litestream"
  fi
  export PATH="$TMP:$PATH"
fi

restore_at() {
  local ts="$1"
  local out="$2"
  rm -f "$out"
  if [ -n "$ts" ]; then
    litestream restore -timestamp "$ts" -o "$out" "file://$REP"
  else
    litestream restore -if-replica-exists -o "$out" "file://$REP"
  fi
}

for spec in \
  "latest|$OUT/pit-latest.db|" \
  "2026-08-18T06:09:00Z|$OUT/pit-0609.db|2026-08-18T06:09:00Z" \
  "2026-08-18T06:00:00Z|$OUT/pit-0600.db|2026-08-18T06:00:00Z" \
  "2026-08-18T05:00:00Z|$OUT/pit-0500.db|2026-08-18T05:00:00Z" \
  "2026-08-18T00:00:00Z|$OUT/pit-midnight.db|2026-08-18T00:00:00Z" \
  "2026-08-17T18:00:00Z|$OUT/pit-aug17.db|2026-08-17T18:00:00Z"; do
  IFS='|' read -r label out ts <<< "$spec"
  echo "==> $label -> $out"
  if restore_at "$ts" "$out" 2>/tmp/litestream-err.txt; then
    echo ok
  else
    echo fail: "$(cat /tmp/litestream-err.txt)"
  fi
done
