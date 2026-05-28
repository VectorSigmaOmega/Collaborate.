# Collaborate. Product Requirements Document

## Document Status

- Status: Draft
- Product: Collaborate.
- Date: 2026-05-23
- Purpose: Define the product direction for turning the current demo into a production-grade portfolio project that signals strong engineering judgment to recruiters.

## 1. Product Summary

Collaborate. is an anonymous, real-time collaborative whiteboard built for lightweight shared sketching and ideation through a single room link.

The current version proves the core interaction loop. The next version must prove the ability to design, build, test, deploy, and operate a small real-time system with production-grade discipline.

The product should communicate:

- Real-time collaboration
- Clear lifecycle management for ephemeral rooms
- Reliable reconnect and resync behavior
- Clean architecture and maintainable code
- Production readiness through testing, deployment, and operational visibility

## 2. Problem Statement

The current app works as a classroom demo, but it does not yet demonstrate the level of engineering rigor expected from a candidate claiming production-readiness.

Current gaps:

- Room state is process memory only
- Socket payloads are trusted without validation
- Reconnect and resize behavior are fragile
- The feature set is too narrow to feel product-shaped
- There is no testing, CI, deployment, or operational instrumentation

The project needs to become a credible shipped system, not just a functional prototype.

## 3. Product Goal

Build a small but polished anonymous collaboration product that recruiters can evaluate as evidence that the developer can ship production-grade software end to end.

## 4. Target Audience

Primary audience:

- Recruiters reviewing portfolio links
- Hiring managers scanning for engineering maturity
- Engineers doing a quick repo review

Secondary audience:

- Real users who want a frictionless shared whiteboard for quick collaboration

## 5. Success Criteria

The project succeeds if a reviewer can quickly conclude that the author understands:

- system design tradeoffs
- real-time application architecture
- resilience and failure handling
- production deployment concerns
- code organization and testing discipline

## 6. Product Principles

1. Anonymous by default
   No login, no account system, no auth complexity.

2. Ephemeral but reliable
   Rooms survive refreshes and short disconnects, but empty rooms expire automatically.

3. Narrow scope, high quality
   Add enough functionality to feel complete, but prioritize depth and reliability over breadth.

4. Canonical server state
   The room state on the server is the source of truth for sync, reconnect, redraw, and recovery.

5. Explicit operational discipline
   The product must expose enough signals to debug and operate in production.

## 7. Non-Goals

The following are out of scope for the first production-grade release:

- User authentication
- User accounts or profiles
- Permanent workspace history across days or weeks
- Enterprise permissions
- Complex document management
- AI features
- Social feeds, comments, or chat

## 8. Product Positioning

Collaborate. is not trying to compete with Miro or FigJam. It should present as:

"A well-engineered anonymous real-time whiteboard with thoughtful room lifecycle, collaboration UX, and production-grade implementation quality."

That is a credible portfolio story.

## 9. Core User Stories

### Room Creation and Joining

- As a user, I can create a room instantly with no signup.
- As a user, I can share a room link with another person.
- As a user, I can join a room by opening the link and entering a display name.
- As a user, I am prevented from joining if the room is full or invalid.

### Collaboration

- As a user, I can draw on the board and see my strokes immediately.
- As a user, I can see other users' strokes in near real time.
- As a user, I can see who else is present in the room.
- As a user, I can distinguish collaborators visually.

### Recovery and Continuity

- As a user, if I refresh or briefly disconnect, I can rejoin the same room and recover the current board state.
- As a user, if the browser window resizes or orientation changes, the board redraws correctly.

### Editing

- As a user, I can undo and redo my own recent actions.
- As a user, I can erase selectively or clear my own content.
- As a user, I can choose pen color and stroke width.

### Output

- As a user, I can export the board as an image.

## 10. Feature Scope

### 10.1 Must-Have Features

- Anonymous room creation
- Shareable room links
- Display-name entry
- Real-time multi-user drawing
- Presence list
- Reconnect-safe room rejoin
- Canonical room resync on demand
- Undo/redo for the user's own actions
- Clear my content
- Pen color picker
- Stroke width control
- Touch and pointer support
- Export board as PNG
- Room expiration after a configurable empty-room TTL

### 10.2 Should-Have Features

- Eraser tool
- Join/leave status feedback
- Connection state indicator
- Copy room link action
- Graceful full-room and expired-room UX

### 10.3 Nice-to-Have Features

- Basic shapes
- Text notes
- Simple host controls such as "clear board"

Nice-to-have features should only be considered after the core reliability and production-readiness work is complete.

## 11. Feature Strategy

Yes, the app needs more features. But it does not need many unrelated features.

The right move is to add features that make the product feel intentional and complete while reinforcing engineering quality:

- tools that are expected in a whiteboard
- recovery behavior that makes collaboration believable
- lifecycle behavior that shows system design discipline

The wrong move is to add a broad set of flashy features that increase code volume without improving product coherence or engineering signal.

The first release should feel like a focused product, not a feature sampler.

## 12. Functional Requirements

### 12.1 Room Lifecycle

- The system must create a room on first valid join or explicit create action.
- Rooms must have a maximum capacity.
- Rooms must remain available while at least one participant is present.
- When the last participant leaves, the room must enter an expiring state with a configurable TTL.
- If a participant rejoins before TTL expiry, the room must be restored.
- If TTL expires with no participants, room state must be deleted.

### 12.2 Real-Time Sync

- The server must validate all socket event payloads.
- The server must track room membership server-side.
- A client must not be able to emit actions into a room it has not joined.
- New or reconnecting clients must receive canonical board state.
- The client must be able to request a full state resync.

### 12.3 Drawing Model

- Drawing actions must be grouped into strokes.
- Undo/redo must operate on stroke groups, not individual points.
- The system must support pen color and stroke width per stroke.
- The eraser must behave consistently for all participants.

### 12.4 UX

- The app must support mouse, touch, and stylus input through pointer events.
- The UI must work on desktop and tablet layouts.
- The app must provide clear feedback for loading, reconnecting, room expiry, and join errors.

### 12.5 Export

- Users must be able to export the current board to PNG.

## 13. Non-Functional Requirements

### Reliability

- Normal page refresh must not lose recoverable room state.
- Brief network interruptions must not permanently break the session.
- The client must redraw board state correctly after resize and reconnect.

### Performance

- Drawing latency should feel immediate to the local user.
- Remote drawing updates should feel near real time under normal network conditions.
- Room history and payload sizes must be bounded.

### Maintainability

- Frontend and backend code must be split into modular units.
- Shared event names and payload contracts must be centralized.
- Environment configuration must be explicit and documented.

### Security

- All inbound payloads must be schema-validated.
- Rate limiting and payload caps must be enforced.
- CORS and origin configuration must be explicit per environment.

### Operability

- The backend must expose health endpoints.
- The system must emit structured logs.
- The app must capture runtime errors.
- Basic metrics must be available for active rooms, active users, reconnects, expirations, and errors.

## 14. Technical Direction

### Frontend

- React with a more modular component and hook structure
- Pointer-event based drawing
- A canonical board state rehydrate path
- Connection and sync status handling

### Backend

- Express for HTTP endpoints
- Socket.IO for real-time transport
- Validation layer for all events
- Room service abstraction
- Expiration and cleanup scheduler

### Storage

Recommended target:

- Redis for ephemeral room state and TTL management

Rationale:

- Fits anonymous short-lived rooms
- Supports expiration naturally
- Better production signal than process memory
- Keeps scope smaller than introducing a heavy persistent collaboration model

## 15. Architecture Expectations

The codebase should be reorganized into obvious ownership boundaries.

### Backend modules

- app bootstrap
- config
- socket event registry
- room service
- validation schemas
- cleanup and expiration logic
- observability utilities

### Frontend modules

- routing and shell
- room join flow
- whiteboard canvas hook
- socket sync hook
- toolbar and presence components
- shared board model utilities

## 16. Metrics

### Product Metrics

- room creations
- average participants per room
- average room duration
- export usage
- reconnect success rate

### Operational Metrics

- active rooms
- active socket connections
- room expiration count
- socket event rejection count
- sync failure count
- frontend error count
- backend exception count

## 17. Test Strategy

Minimum release bar:

- unit tests for room lifecycle and stroke operations
- integration tests for socket flows
- E2E test covering create room, join room, draw, refresh, reconnect, and export
- CI checks for lint, build, test, and dependency audit

## 18. Deployment Expectations

The project should be publicly deployed and easy to evaluate.

Release requirements:

- deployed frontend
- deployed backend
- production environment config
- health endpoint
- CI pipeline
- documented local development and deployment steps

## 19. README Expectations

The README should act as a short engineering case study and include:

- what the product is
- why room TTL was chosen
- architecture diagram
- event flow summary
- reliability and failure handling decisions
- testing approach
- deployment details
- tradeoffs and future work

## 20. Milestones

### Milestone 1: Product Foundation

- Define room model and TTL behavior
- Refactor frontend and backend structure
- Introduce schema validation and shared contracts

### Milestone 2: Real-Time Reliability

- Fix join handshake race
- Add reconnect and resync flow
- Fix resize redraw behavior
- Bound room history and payload sizes

### Milestone 3: Feature Completion

- Add pointer support
- Add color and stroke width tools
- Add eraser
- Add export
- Improve room state and status UX

### Milestone 4: Production Hardening

- Move room state to Redis
- Add health checks, structured logs, and metrics
- Add rate limiting and error handling

### Milestone 5: Verification and Launch

- Add automated tests
- Add CI
- Deploy
- Write architecture-focused README

## 21. Launch Checklist

- Core features implemented
- Reconnect behavior verified
- Empty-room TTL verified
- Validation and rate limiting in place
- Tests passing in CI
- Deployment live
- README complete
- No tracked dependencies or generated assets committed accidentally

## 22. Open Questions

- Exact empty-room TTL value: 15 minutes vs 30 minutes
- Whether board exports should include background grid
- Whether eraser is stroke-delete or pixel-delete in the first production release

## 23. Recommendation

The project should aim for a narrow but complete release:

- anonymous
- ephemeral
- reconnect-safe
- production-hardened

It should gain a few carefully chosen product features, but the main signal should come from reliability, lifecycle design, testing, deployment, and code quality.
