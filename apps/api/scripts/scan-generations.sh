#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/data/gcs-restore/new-gcp-replica/generations"
OUT="$ROOT/data/recovery/generations"
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

for gen in "$SRC"/*; do
  name="$(basename "$gen")"
  rep="$OUT/$name-replica"
  db="$OUT/$name.db"
  rm -rf "$rep" "$db"
  mkdir -p "$rep/generations"
  cp -r "$gen" "$rep/generations/"
  if litestream restore -if-replica-exists -o "$db" "file://$rep" 2>/tmp/litestream-err.txt; then
    echo "$name ok"
  else
    echo "$name fail $(head -1 /tmp/litestream-err.txt)"
  fi
done
