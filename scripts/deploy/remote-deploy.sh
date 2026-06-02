#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${COLLABORATE_APP_ROOT:-/home/ubuntu/collaborate-app}"
SOURCE_DIR="${APP_ROOT}/source"
SHARED_DIR="${APP_ROOT}/shared"
WEB_ROOT="${COLLABORATE_WEB_ROOT:-/var/www/collaborate}"

if [ ! -f "${SHARED_DIR}/api.env" ]; then
  echo "Missing ${SHARED_DIR}/api.env" >&2
  exit 1
fi

if [ ! -f "${SHARED_DIR}/web.env" ]; then
  echo "Missing ${SHARED_DIR}/web.env" >&2
  exit 1
fi

mkdir -p "${SHARED_DIR}/data" "${WEB_ROOT}"
ln -sfn "${SHARED_DIR}/api.env" "${SOURCE_DIR}/apps/api/.env.production"
ln -sfn "${SHARED_DIR}/web.env" "${SOURCE_DIR}/apps/web/.env.production"

cd "${SOURCE_DIR}"
npm ci
npm run build
rsync -az --delete "apps/web/dist/" "${WEB_ROOT}/"
COLLABORATE_APP_ROOT="${APP_ROOT}" pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
