# Production Deployment

This repository deploys to a single Ubuntu host with:

- nginx serving `apps/web/dist`
- PM2 running `apps/api/dist/index.js`
- file-backed room state under `/home/ubuntu/collaborate-app/shared/data/rooms.json`

## Paths

- app root: `/home/ubuntu/collaborate-app`
- synced source: `/home/ubuntu/collaborate-app/source`
- shared env and data: `/home/ubuntu/collaborate-app/shared`
- web root: `/var/www/collaborate`

## Server bootstrap

1. Sync the repository to `${APP_ROOT}/source`.
2. Run `scripts/deploy/bootstrap-server.sh`.
3. Review and edit:
   - `${APP_ROOT}/shared/api.env`
   - `${APP_ROOT}/shared/web.env`

## GitHub Actions secrets

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_WEB_ROOT`
- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`

## Deploy flow

On every push to `main`, GitHub Actions:

1. runs lint, typecheck, tests, build, and e2e
2. rsyncs the repository to the server
3. runs `scripts/deploy/remote-deploy.sh`

The remote deploy script installs dependencies, builds the current revision, syncs the static frontend to nginx, and reloads the PM2 API process.
