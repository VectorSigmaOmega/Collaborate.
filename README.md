# Collaborate.

Collaborate. is a production-focused anonymous real-time whiteboard built to demonstrate that the project owner can design, ship, and operate a small collaborative system with engineering discipline.

## What it does

- Share a room link with no auth flow
- Draw with mouse, touch, or stylus
- Use pen, eraser, color, and stroke width controls
- Undo and redo your own strokes
- Clear only your own content
- Export the current board to PNG
- Rejoin the same room after refresh or transient disconnect
- Expire empty rooms automatically after a bounded TTL

## Repository layout

- `apps/web` - React + Vite frontend
- `apps/api` - Express + Socket.IO backend
- `packages/contracts` - shared event names, schemas, and types
- `docs` - product, roadmap, and deployment notes
- `v1` - archived demo reference

## Architecture

### Frontend

- `RoomPage` owns room entry and board presentation
- `useRoomSession` owns socket lifecycle, sync, and reconnect behavior
- `useBoardCanvas` owns pointer input, local drawing, and export
- `AppErrorBoundary` contains runtime crashes behind a controlled fallback

### Backend

- `RoomService` owns room lifecycle and board mutation rules
- `RoomRepository` abstracts storage
- `registerSocketHandlers` validates and gates every socket event
- `createHttpApp` exposes health, readiness, and metrics

### Contracts

All socket event names and payload schemas are defined once in `packages/contracts` and imported by both apps.

## Room lifecycle

1. First valid join creates a room.
2. The API keeps canonical board state for the room.
3. Refreshing the same room auto-rejoins with the last successful local identity.
4. When the last participant leaves, the room enters expiring state.
5. Empty rooms are deleted after `ROOM_EMPTY_TTL_MS`.

## Storage model

The default repository mode is file-backed ephemeral storage.

- `ROOM_REPOSITORY=file` persists room state to `ROOM_STORAGE_PATH`
- `ROOM_REPOSITORY=memory` is intended for tests and disposable local runs

This gives the project restart-safe rooms on a single API instance without reintroducing the original in-process-only limitation.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the apps

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3. Start the API

```bash
npm run dev:api
```

### 4. Start the web app

```bash
npm run dev:web
```

Default URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:5000`
- Health: `http://localhost:5000/health`
- Readiness: `http://localhost:5000/ready`
- Metrics: `http://localhost:5000/metrics`

## Quality gates

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e
```

If Playwright browsers are not installed locally:

```bash
npx playwright install chromium
```

If you want to reuse a system Chrome instead:

```bash
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/google-chrome npm run e2e
```

## Operational safeguards

- Zod validation on every socket payload
- Payload size limits
- Per-socket rate limiting
- Structured JSON logs
- Prometheus-style metrics
- Frontend error boundary
- Unhandled rejection and exception shutdown logging
- Bounded room history and bounded stroke sizes

## Documentation

- PRD: [docs/PRD.md](docs/PRD.md)
- Implementation roadmap: [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md)
- Deployment notes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
