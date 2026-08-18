#!/usr/bin/env bash
set -euo pipefail
cd /tmp
if [ ! -f litestream ]; then
  wget -q "https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb"
  mkdir -p litestream-extract
  dpkg-deb -x litestream-v0.3.13-linux-amd64.deb litestream-extract
  cp litestream-extract/usr/bin/litestream litestream
fi
export CLOUDSDK_CORE_ACCOUNT=yarrala.srinivas@gmail.com
export CLOUDSDK_CONFIG="/mnt/c/Users/kanas/AppData/Roaming/gcloud"
export GOOGLE_APPLICATION_CREDENTIALS="/mnt/c/Users/kanas/AppData/Roaming/gcloud/application_default_credentials.json"
./litestream restore -if-replica-exists -o /tmp/kaana.db "gcs://kaana-prod-db/kaana.db"
echo "==> Shreya in kaana.db"
sqlite3 /tmp/kaana.db "SELECT id,name,phone,phone_digits,chief_complaint,source,tags,notes,created_at FROM patients WHERE name LIKE '%Shreya%' OR phone_digits LIKE '%889883472%';"
echo "==> Shreya in old clinic.db"
./litestream restore -if-replica-exists -o /tmp/clinic-old.db "gcs://kaana-prod-db/clinic.db"
sqlite3 /tmp/clinic-old.db "SELECT id,name,phone,phone_digits,chief_complaint,source,tags,notes,created_at FROM patients WHERE name LIKE '%Shreya%' OR phone_digits LIKE '%889883472%';"
