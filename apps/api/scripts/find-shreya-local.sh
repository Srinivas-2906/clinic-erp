#!/bin/bash
set -e
cd /tmp
if [ ! -x litestream ]; then
  wget -q https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb
  mkdir -p lx
  dpkg-deb -x litestream-v0.3.13-linux-amd64.deb lx
  cp lx/usr/bin/litestream .
fi
REP=/mnt/c/Users/kanas/kaana/kaana-prod/clinic-api/data/recovery/kaana-replica
./litestream restore -if-replica-exists -o /tmp/kaana.db file://$REP
echo "==> kaana.db"
sqlite3 /tmp/kaana.db "SELECT id,name,phone,tags,source,chief_complaint,created_at FROM patients WHERE name LIKE '%Shreya%' OR phone_digits LIKE '%889883472%';"
