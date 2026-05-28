# Collaborate. Implementation Roadmap

## Status

- Status: Active execution plan
- Date: 2026-05-23
- Companion document: `docs/PRD.md`

## 1. Purpose

This document turns the PRD into an execution plan with milestone ordering, default technical decisions, and acceptance criteria.

The intent is to remove avoidable ambiguity so implementation can proceed without frequent replanning.

## 2. Locked Decisions

These are the defaults to build against unless explicitly changed later.

- Build in this repository
- Keep the existing visual direction from `v1/whiteboard`
- Keep `v1/` as the archived demo reference
- No authentication
- Anonymous display names only
- Empty-room TTL: 15 minutes
- Maximum room size: 15 participants
- New production code: TypeScript
- Repo structure: npm workspaces
- Frontend: React + Vite
- Backend: Express + Socket.IO
- Shared contracts: `packages/contracts`
- Validation library: Zod
- Unit and integration tests: Vitest
- Browser E2E: Playwright
- Logging: structured JSON logs
- Metrics: Prometheus-style metrics endpoint
- Canonical room state lives on the server
- Initial product model: anonymous, ephemeral, reconnect-safe rooms

## 3. Delivery Strategy

The project should be built in this order:

1. Foundation and shared contracts
2. Room domain and sync correctness
3. Frontend rebuild with existing visual design
4. Product feature completion
5. Persistence, observability, and deployment quality
6. Test hardening, CI, and launch readiness

This order is deliberate. It prevents the team from building more UI on top of weak real-time foundations.

## 4. Target Architecture

### Repository

- `apps/web` - production frontend
- `apps/api` - production backend
- `packages/contracts` - shared event names, schemas, types
- `docs` - PRD, roadmap, architecture notes
- `v1` - archived demo

### Backend modules

- `config`
- `http`
- `socket`
- `rooms`
- `validation`
- `observability`
- `testing`

### Frontend modules

- `app`
- `pages`
- `components`
- `features/room`
- `features/board`
- `hooks`
- `lib/socket`
- `lib/api`

## 5. Working Assumptions

These defaults should be used during implementation unless a strong reason emerges to change them.

### Room lifecycle

- Room is created on first valid join
- Room stays active while at least one participant is present
- When last participant leaves, room enters expiring state
- Expired empty rooms are deleted after 15 minutes
- Rejoining before TTL restores room state

### State limits

- Room capacity: 15 users
- Undo/redo is per-user and stroke-based
- Room history is bounded
- Payload sizes are bounded
- Batch sizes are bounded

Exact numeric limits for payload and history can be tuned during implementation, but bounded behavior is mandatory from the start.

### Feature bar for first production release

- room create/join
- presence
- draw
- undo/redo
- clear my content
- pen color
- stroke width
- eraser
- reconnect/resync
- pointer and touch input
- export to PNG
- room full and room expired UX
- connection state feedback

## 6. Milestones

## Milestone 1: Workspace Foundation

### Goal

Create the production-grade project skeleton and baseline engineering tooling.

### Deliverables

- TypeScript enabled in all new packages and apps
- Root workspace scripts for dev, build, lint, and test
- Shared tsconfig strategy
- ESLint configured for the workspace
- `.env.example` files for web and API
- Basic README updates for local development

### Acceptance Criteria

- `npm install` works from the repo root
- `npm run build` works from the repo root
- `npm run lint` works from the repo root
- `npm run test` works from the repo root, even if tests are placeholder smoke tests initially
- `apps/web`, `apps/api`, and `packages/contracts` compile as TypeScript projects
- No demo code is reintroduced outside `v1/`

## Milestone 2: Shared Contracts and API Bootstrap

### Goal

Define the communication contract before rebuilding behavior.

### Deliverables

- Shared event name constants
- Zod schemas for all socket payloads
- Shared type definitions for room, participant, stroke, tool state, and sync messages
- API bootstrap with config loading
- `/health` endpoint
- `/ready` endpoint
- Structured logger wiring

### Acceptance Criteria

- All socket events used by the app are defined centrally in `packages/contracts`
- API startup fails clearly on invalid required config
- `/health` returns `200` when process is alive
- `/ready` returns correct readiness state
- Invalid socket payloads are rejected with structured errors
- Event names are not duplicated as raw strings across the codebase

## Milestone 3: Room Domain and Lifecycle

### Goal

Build the room model as a standalone domain layer before adding UI complexity.

### Deliverables

- Room service with create, join, leave, expire, and restore behavior
- Participant model
- Stroke model
- Per-user undo/redo model
- Empty-room TTL scheduler
- In-memory room repository behind an interface
- Unit tests for room lifecycle and stroke operations

### Acceptance Criteria

- A valid user can create or join a room
- A duplicate display name in the same room is rejected
- A user cannot exceed room capacity
- Leaving the last room participant starts expiration
- Rejoining before TTL restores room state
- Expired rooms are deleted
- Undo removes the last stroke owned by the requesting user only
- Redo restores only that user's most recently undone stroke
- Clear-my-content removes only the requesting user's content
- Room and stroke logic is tested without requiring browser or socket runtime

## Milestone 4: Socket Transport and Sync Correctness

### Goal

Rebuild the real-time transport around validated, reconnect-safe synchronization.

### Deliverables

- Socket connection bootstrap
- Join handshake flow
- Membership tracking on the server
- Canonical state sync on join
- Resync event for reconnect or repair
- Presence broadcasting
- Connection state events
- Transport-level integration tests

### Acceptance Criteria

- A client cannot send draw or mutation events for a room it has not joined
- Join flow does not race listener registration
- New clients receive canonical room state on join
- Reconnecting clients can request and receive a full resync
- Presence updates remain correct on join, leave, and disconnect
- Invalid events are rejected without corrupting room state
- Integration tests cover join, draw, undo, redo, disconnect, reconnect, and expiry paths

## Milestone 5: Frontend Rebuild with Current Visual Design

### Goal

Recreate the current visual style on top of a cleaner frontend architecture.

### Deliverables

- New app shell and router
- Room landing page
- Room join screen
- Whiteboard page
- Presence panel
- Toolbar
- Connection state UI
- Error and expired-room UI
- Extracted hooks for socket and board behavior

### Acceptance Criteria

- The new UI clearly resembles the current visual direction from `v1/whiteboard`
- The main UI is no longer implemented as a single large page component
- Canvas and socket behavior are separated into dedicated hooks or modules
- Join, error, expired, and active-room states all have explicit UI
- The app works on desktop and tablet breakpoints
- There is no blocking use of browser alerts for normal product UX

## Milestone 6: Core Feature Completion

### Goal

Add enough feature depth for the product to feel complete, not skeletal.

### Deliverables

- Pointer events for mouse, touch, and stylus
- Pen color picker
- Stroke width control
- Eraser
- Undo/redo controls
- Clear-my-content control
- Copy room link action
- Export to PNG

### Acceptance Criteria

- Drawing works with mouse and touch
- Local drawing feels immediate
- Remote drawing is visible in near real time
- Pen color and stroke width changes are reflected across participants
- Eraser behavior is consistent across participants
- Undo/redo semantics stay per-user
- Export produces a valid PNG of the current board state
- Features do not break reconnect and resync behavior

## Milestone 7: Persistence and Bounded Runtime Behavior

### Goal

Replace process-bound room state with a production-ready ephemeral persistence model.

### Deliverables

- Room repository interface finalized
- Redis-backed room repository
- TTL-backed room expiration behavior
- Bounded history enforcement
- Payload size and rate limits

### Acceptance Criteria

- Room state survives API process restart when Redis is available
- Empty-room expiration still deletes rooms after 15 minutes
- History growth is bounded and enforced
- Oversized payloads are rejected
- Excessive event rates are throttled or rejected
- Redis is optional in local development only if an in-memory fallback is explicitly documented

## Milestone 8: Observability and Operational Hardening

### Goal

Add the runtime signals and safeguards expected of a production service.

### Deliverables

- Structured logs for joins, leaves, errors, expirations, and rejections
- Metrics endpoint
- Error boundary for frontend
- Server-side unhandled error handling
- CORS and config hardening

### Acceptance Criteria

- Logs are machine-readable and include request or room context where relevant
- Metrics expose at least active rooms, active participants, expirations, rejected events, and socket errors
- Frontend runtime failures produce controlled user-facing failure states
- Backend unhandled exceptions are logged consistently
- Environment-specific configuration is explicit and documented

## Milestone 9: Testing, CI, and Launch Readiness

### Goal

Make the repo reviewable as a serious shipped artifact.

### Deliverables

- Unit tests for room and board model logic
- Integration tests for API and socket flows
- Playwright E2E happy-path test
- CI workflow for lint, build, and test
- Architecture-oriented README
- Deployment documentation

### Acceptance Criteria

- CI passes on a clean checkout
- Unit and integration tests cover the critical room lifecycle and sync flows
- E2E test covers create, join, draw, refresh, reconnect, and export
- README explains architecture, room lifecycle, and tradeoffs
- There are no known high-severity production dependency vulnerabilities at release
- A reviewer can run the project locally from the repo root using documented steps

## 7. Cross-Cutting Acceptance Standards

These standards apply to all milestones.

- New code is typed
- New behavior is modular
- Shared contracts are imported, not duplicated
- Failure states are explicit
- Runtime behavior is bounded
- Docs stay in sync with shipped behavior

## 8. Definition of Done for the First Production Release

The first production release is done when all of the following are true:

- anonymous room flow works end to end
- current visual style is preserved in the new frontend
- reconnect and resync are reliable
- empty-room TTL works
- room state is no longer process-memory only
- draw, erase, undo, redo, clear-my-content, and export all work
- touch input works
- health, readiness, logs, and metrics exist
- unit, integration, and E2E tests exist and pass
- CI exists and passes
- repo documentation reads like a deliberate engineering artifact

## 9. Recommended Execution Order

The actual coding sequence should be:

1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4
5. Milestone 5
6. Milestone 6
7. Milestone 7
8. Milestone 8
9. Milestone 9

This order should not be inverted by adding late-phase features early.

## 10. Items That Should Not Block Implementation

The following are intentionally not blockers:

- final hosting vendor choice
- final brand copy
- shapes and text tools
- host-only controls
- long-term persistent storage beyond room TTL

## 11. Immediate Next Coding Task

Start with Milestone 1 and Milestone 2 together:

- TypeScript workspace setup
- shared contracts package
- API bootstrap
- config and health endpoints

That creates the baseline needed for uninterrupted feature implementation.
