#!/bin/sh
set -e
ORIGIN="${CLINIC_API_ORIGIN:-http://127.0.0.1:3010}"
ORIGIN="${ORIGIN%/}"
sed "s|__CLINIC_API_ORIGIN__|${ORIGIN}|g" /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
