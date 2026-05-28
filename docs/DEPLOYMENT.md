# Deployment Notes

## Runtime model

This rewrite targets a single API instance and a static web deployment.

- `apps/web` can be deployed as static assets behind any CDN or static host.
- `apps/api` runs as a Node 20 process with Socket.IO enabled.
- Canonical board state lives on the API and is stored through the repository adapter.

## Storage modes

`ROOM_REPOSITORY=file`

- Recommended default for this repository.
- Stores bounded ephemeral room state in `ROOM_STORAGE_PATH`.
- Survives API restarts on a single instance.

`ROOM_REPOSITORY=memory`

- Intended for tests and disposable local development.
- Does not survive API restart.

## Required API environment

- `PORT`
- `CLIENT_ORIGIN`
- `ROOM_REPOSITORY`
- `ROOM_STORAGE_PATH` when using `file`
- `ROOM_EMPTY_TTL_MS`
- `ROOM_MAX_PARTICIPANTS`
- `ROOM_MAX_STROKES`
- `ROOM_MAX_STROKE_POINTS`
- `ROOM_MAX_PAYLOAD_BYTES`

## Health and readiness

- `GET /health` returns process liveness.
- `GET /ready` returns readiness and storage mode.
- `GET /metrics` exposes Prometheus-style counters and gauges.

## Operational notes

- Empty rooms expire after 15 minutes by default.
- Room history is bounded at the service layer.
- Socket payloads are schema-validated, size-limited, and rate-limited.
- Frontend failures fall back to an error boundary with reload affordance.
