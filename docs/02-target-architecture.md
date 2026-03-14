# Target Architecture

## Non-Negotiable Design Rules

1. Browsers never call upstream live timing providers directly.
2. Only one collector instance per live session may talk to the upstream live source.
3. Historical loads must start from a precomputed snapshot, not a cold replay from session start.
4. React Query is the cache orchestrator, not the source of truth.
5. Tinybird credentials and query shape stay server-side in app-owned repository modules.
6. The UI reads only from Tinybird-backed backend APIs, for both historical and realtime views.
7. The UI layer uses `shadcn/ui`, Tailwind CSS v4, and CSS variables as the default design-system contract.

## Runtime Topology

### `apps/web`

Purpose:

- Next.js app router frontend
- RSC-first historical rendering
- route handlers for typed read APIs
- realtime endpoints that read current and recent windows from Tinybird

Responsibilities:

- schedule, sessions, and replay entry screens
- server-side prefetch of historical data
- React Query hydration
- server-side read APIs backed by Tinybird
- client reconciliation of backend-provided live deltas into query caches
- use a shared design-system layer based on `shadcn/ui` and CSS variable tokens

### `apps/collector`

Purpose:

- long-lived Node / TypeScript process
- authoritative live ingest runtime
- single upstream SignalR connection
- optional low-frequency OpenF1 enrichers if specific fields are missing upstream

Responsibilities:

- subscribe to live topics once
- normalize updates into a shared event envelope
- batch writes into Tinybird via Events API
- maintain hot in-memory state for the current session
- produce periodic session snapshots and replay chunks

### `packages/contracts`

Purpose:

- shared topic enums
- Zod parsers for raw and normalized events
- snapshot envelope types
- React Query key factory types

### `packages/ui`

Purpose:

- shared `shadcn/ui`-based components
- CSS variable token definitions and semantic aliases
- application theme primitives for surfaces, states, data-viz colors, and spacing conventions

### `packages/data`

Purpose:

- Tinybird-first typed query functions
- one place for Tinybird SQL and response typing
- no direct Tinybird access from React components

Pattern:

- Tinybird endpoints and app-owned repository functions define query shape
- Zod validates rows at the boundary
- exported repository functions become the only app-facing read API

## Recommended Data Flow

### Live

1. Collector opens one upstream SignalR connection.
2. Collector receives full initial state.
3. Collector normalizes and persists raw and derived events into Tinybird.
4. Collector updates its in-memory canonical state only to support batching, snapshotting, and failure recovery.
5. The web backend reads current and recent live windows from Tinybird.
6. The browser fetches realtime data only through backend APIs.
7. React Query merges those backend-provided deltas into the client cache.

### Historical

1. User opens a historical session page.
2. Next server fetches session metadata, latest boot snapshot, and first replay chunk in parallel.
3. Server renders the shell immediately.
4. Client hydrates with React Query.
5. If the user scrubs or replays, the client requests chunk windows from Tinybird-backed APIs.

## Why Tinybird Fits

Use Tinybird for:

- append-heavy event ingestion
- materialized views over lap / stint / telemetry data
- low-latency historical queries
- low-latency current-state and recent-delta queries for live screens
- precomputed replay chunk generation
- public or private query endpoints, depending on deployment model

Tinybird is both the durable warehouse and the read model for the UI. The collector writes to it; the web/backend reads from it.

## Why A Tinybird-First Repository Fits

The app already has one durable analytical backend. There is no need to add a second query abstraction unless Tinybird leaves a clear gap.

Use the repository layer for:

- parameterized endpoint calls and server-side Tinybird reads
- result typing at the app boundary
- shared query modules used by Next route handlers and RSC loaders

Do not use Tinybird tokens directly from the browser.

## Data Model

All datasources are defined in `lib/tinybird.ts` using the Tinybird TypeScript SDK.

### Raw ingest datasources

- `raw_topic_events`

### Session and driver datasources

- `f1_sessions`
- `session_summaries`
- `session_drivers`

### Live and normalized event datasources

- `live_envelopes`
- `race_control_messages`

### Track and position datasources

- `track_position_frames`
- `track_outline_points`

### Telemetry datasources

- `telemetry_lap_summaries`
- `telemetry_samples`

### Snapshot and replay datasources

- `session_boot_snapshots`
- `replay_chunk_records`

## Critical Performance Decision

Do not boot a historical session by replaying raw events from time zero.

Instead:

- write a boot snapshot near session start
- write interval snapshots every 5 to 15 seconds of session clock
- prebuild replay chunks for the time range after each snapshot
- load the nearest snapshot plus subsequent chunks

That makes historical startup effectively constant-time.

## Live Event Envelope

Use one envelope for live and replay:

```ts
export type LiveEnvelope = {
  id: string;
  sessionKey: number;
  sequence: number;
  emittedAt: string;
  mode: 'snapshot' | 'patch';
  topic:
    | 'timing'
    | 'telemetry'
    | 'position'
    | 'weather'
    | 'trackStatus'
    | 'raceControl'
    | 'teamRadio'
    | 'session';
  payload: unknown;
};
```

If live and replay share the same envelope, the UI does not need separate rendering paths.

## React Query Strategy

Use React Query for:

- caching historical query results
- merging backend-provided live deltas into cached queries
- deduplication across components
- background fetching for chunk windows when scrubbing
- short-interval refetching or streamed backend updates for current sessions

Use server rendering for first paint on historical routes.

Recommended pattern:

- RSC prefetches query data in parallel
- dehydrate React Query state into the page
- client switches to live backend refresh only when the session is currently active
- backend live endpoints query Tinybird by monotonic sequence or recent time window

## UI System

Use:

- `shadcn/ui` for base primitives and accessible interaction patterns
- Tailwind CSS v4 for utility styling
- CSS variables for theme tokens and semantic values

Required token categories:

- background and foreground surfaces
- muted, accent, border, input, ring
- success, warning, destructive, and info states
- team and tire color mappings where appropriate
- chart and telemetry colors
- radius and layout tokens

Guidelines:

- define variables at the app theme layer first
- consume variables through Tailwind v4 and component classes
- keep component APIs semantic instead of passing raw colors around
- do not couple product theming to ad hoc inline styles unless rendering data-driven visuals

## Anti-Rate-Limit Strategy

1. Single live upstream connection.
2. No client-side polling to upstream providers.
3. Batch Tinybird writes every few hundred milliseconds or size threshold.
4. Cache schedule and static metadata aggressively.
5. Keep OpenF1 usage limited to optional enrichers and backfills.
6. Record raw live traffic once so retries and reprocessing never need upstream refetches.
7. Backoff and circuit-break on upstream failures.
8. Make the UI read from Tinybird-backed APIs only, so live and historical screens share one read path.

## Deployment Notes

- `apps/web` can run on Vercel if desired.
- `apps/collector` should run on a long-lived Node host, not a short-lived serverless runtime.
- Tinybird remains the durable data backend for both live persistence and historical querying.
- The collector is a separate service that can run alongside the web app, but it is not part of the UI read path.

## Repo Layout

```text
apps/
  web/          # Next.js frontend
  collector/    # Live ingest + backfill service
packages/
  contracts/    # Zod schemas and shared types
  data/         # Tinybird repository client
  ui/           # Shared UI components and theme
lib/
  tinybird.ts   # Tinybird SDK datasource and endpoint definitions
monitoring/     # Prometheus + Grafana config
docs/
```

Tinybird datasources and endpoints are defined using the TypeScript SDK in `lib/tinybird.ts`, not as separate datafile/pipe files.

## Feature Delivery Order

Ship in this order:

1. session catalog + schedule
2. historical session shell + boot snapshot loading
3. leaderboard + race control + session header
4. telemetry and track map
5. team radio, weather, standings, settings
6. replay scrubbing and delay controls
