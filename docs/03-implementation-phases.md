# Implementation Phases

## Progress Snapshot (2026-03-14)

- Phase 0: completed
- Phase 1: substantially completed for baseline collector + backfill paths
- Phase 2: completed for core datasources and read endpoints
- Phase 3: in progress
  - boot and replay chunk path exists
  - historical track replay path now exists with `track_position_frames` and `track_outline_points`
  - replay-time map playback is now wired through Tinybird-backed track frame windows
- Phase 4: completed for app foundation and Tinybird-backed route handlers
- Phase 5: in progress
  - catalog, summary, race control, replay, and track map are active
  - continued UI density and interaction polish still needed
- Phase 6: in progress
  - historical positional replay support landed
  - telemetry and map downsampling/aggregation should be hardened further
  - live structured track-frame ingestion from SignalR into `track_position_frames` landed in collector code
  - next structural step is to materialize fixed-path replay data (`driver_progress_frames` or equivalent) to reduce replay query cost and jitter risk
- Phase 7: pending
- Phase 8: pending

## Phase 0: Contracts And Discovery

Goal:
Create the shared event contract and lock the source-of-truth schema before UI work starts.

Tasks:

- map upstream SignalR topics to normalized event types
- define Zod schemas for raw topics and normalized envelopes
- define session identity rules: season, meeting, session key, session type
- decide whether OpenF1 is fallback-only or also part of the primary historical backfill path
- document the canonical replay envelope
- lock the UI system decision: `shadcn/ui` + Tailwind CSS v4 + CSS variables

Exit criteria:

- one contract package exists
- one normalized event glossary exists
- all downstream work references that contract only

## Phase 1: Collector MVP

Goal:
Replace the upstream Rust realtime service with a TypeScript collector.

Tasks:

- connect to live SignalR once
- subscribe to the 17 observed topics
- parse and normalize patches
- maintain in-memory current state
- write normalized live events to Tinybird only
- persist raw events to disk or queue as a short-term safety fallback during development

Exit criteria:

- one collector can continuously feed Tinybird without browser-to-upstream requests
- reconnect logic works across session boundaries

## Phase 2: Tinybird Ingestion Foundation

Goal:
Make live traffic durable and queryable.

Tasks:

- create raw Tinybird datasources
- batch ingest via Events API
- store compressed payloads where fidelity matters
- materialize normalized rows for timing, telemetry, positions, weather, race control, and radio
- create current-state and recent-delta read models for live screens
- track collector lag and ingestion failures

Exit criteria:

- every live event reaches Tinybird
- raw and normalized records can be queried by session key and time window

## Phase 3: Historical Boot Path

Goal:
Make historical session startup effectively instant.

Tasks:

- generate boot snapshots per session
- generate interval snapshots every 5 to 15 seconds of session clock
- precompute replay chunks between snapshots
- expose typed repository queries for `getSessionBoot`, `getReplayChunks`, `getSessionSummary`, and `getRaceControlFeed`
- preload first-view data in parallel from RSC

Exit criteria:

- historical page starts from a snapshot, not full replay
- first meaningful content is visible after a small fixed query set

## Phase 4: Web App Foundation

Goal:
Create the new Next app on the target stack without reusing the current project runtime.

Tasks:

- create `apps/web` with App Router
- add React Query provider, hydration, and query key factory
- add typed route handlers backed by Tinybird repository queries
- create session catalog, meeting page, and replay entry page
- wire server-side parallel fetching to avoid waterfalls
- add live backend endpoints that read recent deltas from Tinybird
- set up `shadcn/ui`, Tailwind CSS v4, and global CSS variable tokens
- create a shared `packages/ui` layer for reusable components and theme primitives

Exit criteria:

- historical session page renders from real Tinybird data
- query layer is fully server-owned
- live reads also come from Tinybird-backed backend endpoints

## Phase 5: Dashboard Parity MVP

Goal:
Ship the minimum dashboard that matches the upstream core experience.

Tasks:

- session header
- leaderboard
- race control feed
- connection status
- replay controls and delay controls
- team radio feed
- track status and lap count
- implement all product UI on top of the shared `shadcn/ui` + CSS variable design system
- stabilize track replay so cars move on a fixed path and the widget never falls back to live state mid-playback

Exit criteria:

- user can follow a live race and replay a completed race through the same Tinybird-backed read path

## Phase 6: High-Frequency Data Views

Goal:
Add telemetry and track map without making the app heavy.

Tasks:

- build downsampled telemetry pipes at multiple resolutions
- build position decimation pipes for map playback
- wire live SignalR position payloads into structured `track_position_frames` writes so live and historical maps share one Tinybird-backed read path
- materialize fixed-path replay reads (`driver_progress_frames`, path points, or equivalent) so UI does not need to project raw XY frames on every render
- load coarse data first, fine data on demand
- keep chart data outside the main global render path where possible
- merge live telemetry patches directly into targeted query caches

Exit criteria:

- telemetry and map views stay responsive on desktop and mobile
- historical scrubbing does not require loading full-resolution data up front

## Phase 7: Secondary Features

Goal:
Reach and exceed upstream feature parity.

Tasks:

- weather map and weather history
- championship prediction / standings
- settings persistence
- favorite drivers
- help / glossary / status surfaces
- track violations and derived incident summaries

Exit criteria:

- parity checklist is closed or intentionally deferred with reasons

## Phase 8: Hardening

Goal:
Prove the system can survive live-race traffic and source instability.

Tasks:

- load-test SSE fan-out
- test backend live polling or streaming against Tinybird sequence windows
- test collector reconnect during session change
- test backfill / reprocessing from raw events
- add alerting for ingest lag, stale snapshots, failed chunk generation, and live stream disconnects
- add feature flags for optional enrichers

Exit criteria:

- live-race operational playbook exists
- rollback path exists for collector and schema changes

## Suggested Milestone Slices

### Slice A

- session catalog
- boot snapshots
- historical leaderboard
- race control

### Slice B

- live collector to Tinybird
- Tinybird-backed live backend endpoints
- current session dashboard
- delay mode

### Slice C

- telemetry
- map
- weather

### Slice D

- standings
- radio polish
- settings
- operational hardening

## Acceptance Metrics

Use these as the working targets:

- historical session shell visible in under 1 second from a warm region
- live update visibility under 1 second from collector write to UI for core timing patches
- zero browser calls to upstream F1 / OpenF1 services during normal usage
- replay scrub loads bounded by chunk size, not session duration
- one collector connection per active session
