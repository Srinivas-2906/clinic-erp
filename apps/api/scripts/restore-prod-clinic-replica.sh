#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REP="$ROOT/data/gcs-restore/clinic-replica"
OUT="$ROOT/data/recovery/prod-clinic.db"
TMP=/tmp/litestream-bin
mkdir -p "$TMP"
if [ ! -x "$TMP/litestream" ]; then
  wget -q "https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb" -O /tmp/litestream.deb
  mkdir -p /tmp/lx
  dpkg-deb -x /tmp/litestream.deb /tmp/lx
  cp /tmp/lx/usr/bin/litestream "$TMP/litestream"
fi
rm -f "$OUT"
"$TMP/litestream" restore -if-replica-exists -o "$OUT" "file://$REP"
