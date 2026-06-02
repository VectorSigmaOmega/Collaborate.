#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${COLLABORATE_APP_ROOT:-/home/ubuntu/collaborate-app}"
SOURCE_DIR="${APP_ROOT}/source"
SHARED_DIR="${APP_ROOT}/shared"
WEB_ROOT="${COLLABORATE_WEB_ROOT:-/var/www/collaborate}"
SERVER_NAME="${COLLABORATE_SERVER_NAME:-collaborate.abhinash.dev}"
SITE_PATH="/etc/nginx/sites-available/${SERVER_NAME}"

mkdir -p "${SOURCE_DIR}" "${SHARED_DIR}/data"
sudo mkdir -p "${WEB_ROOT}"
sudo chown -R ubuntu:ubuntu "${WEB_ROOT}"

if [ ! -f "${SHARED_DIR}/api.env" ]; then
  cp "${SOURCE_DIR}/ops/env/api.production.env.example" "${SHARED_DIR}/api.env"
fi

if [ ! -f "${SHARED_DIR}/web.env" ]; then
  cp "${SOURCE_DIR}/ops/env/web.production.env.example" "${SHARED_DIR}/web.env"
fi

sed \
  -e "s|__SERVER_NAME__|${SERVER_NAME}|g" \
  -e "s|__WEB_ROOT__|${WEB_ROOT}|g" \
  "${SOURCE_DIR}/ops/nginx/collaborate.abhinash.dev.conf.template" |
  sudo tee "${SITE_PATH}" >/dev/null

sudo ln -sfn "${SITE_PATH}" "/etc/nginx/sites-enabled/${SERVER_NAME}"
sudo nginx -t
sudo systemctl reload nginx

pm2 delete whiteboard-api >/dev/null 2>&1 || true
