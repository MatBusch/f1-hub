# f1-hub

Greenfield rebuild workspace for an F1 live and historical dashboard.

Target stack:

- Next.js `16.1.6`
- React `19.2.4`
- TypeScript `5.9.3`
- Tinybird for ingestion, storage, and analytical queries
- Tinybird-backed typed repository modules for server-side reads
- React Query for client cache orchestration
- `shadcn/ui` for UI primitives
- Tailwind CSS v4
- CSS variables as the default styling and theming contract

## Core Architecture Rule

The UI must always read through Tinybird-backed backend APIs, for both historical and realtime data.

That means:

- the collector is a separate write-only service
- the collector pushes live data into Tinybird
- the web app and its backend routes read from Tinybird only
- the browser never depends on the collector directly
- the browser never calls upstream timing providers directly

## Purpose

This repository is the standalone workspace for the `f1-hub` product.

Use it for:

- architecture and migration planning
- monorepo scaffolding for the rebuild
- new implementation work for the `f1-hub` product

## UI System Rule

`f1-hub` should use:

- `shadcn/ui` components and patterns
- Tailwind CSS v4 only
- CSS variables for tokens such as color, radius, spacing aliases, chart colors, and semantic surfaces

Avoid hardcoded one-off values when a reusable CSS variable token is the right abstraction.

## Docs

- `docs/01-upstream-reverse-engineering.md`
- `docs/02-target-architecture.md`
- `docs/03-implementation-phases.md`
- `docs/04-open-questions.md`
- `docs/05-adr-ui-reads-from-tinybird-only.md`
- `docs/06-adr-ui-system.md`
- `docs/07-current-status.md`

## Workspace Root

Run all workspace commands from:

```bash
/home/greenrandall/f1-hub
```

The web app resolves framework dependencies from `apps/web/node_modules`, so local dev should be launched through the workspace scripts instead of forcing Turbopack to treat the repo root as the Next app root.

## Web Runtime

Preferred development command from the workspace root:

```bash
pnpm --filter @f1-hub/web dev
```

Fallback if Turbopack hits an upstream dev-only issue:

```bash
pnpm --filter @f1-hub/web dev:webpack
```

App routes worth knowing:

- `Home` -> `/`
- `Dashboard` -> `/dashboard`
- `Timing` -> `/timing`
- `Comms` -> `/comms`
- `Map` -> `/map`
- `Live` -> `/live`
- `Replay` -> `/simulate`
- `Telemetry` -> `/telemetry`
- session detail -> `/sessions/[sessionKey]`
- session replay -> `/sessions/[sessionKey]/simulate`
- session telemetry -> `/sessions/[sessionKey]/telemetry`

## Replay Architecture

Historical replay now uses a canvas-first renderer instead of the older SVG/card replay surface.

- the replay browser lives at `/simulate`
- the replay experience lives at `/sessions/[sessionKey]/simulate`
- the circuit path is derived from stored Tinybird geometry and rendered in `apps/web/components/replay-track-canvas.tsx`
- playback runs from a progressively loaded local timeline in `apps/web/components/simulation-workspace.tsx`
- loading placeholders should use the shadcn-style `Skeleton` component in `apps/web/components/ui/skeleton.tsx`

The replay path should stay static while cars animate over buffered historical track-position frames.

## Collector Runtime

The collector requires Redis for stream buffering between the ingest and writer processes. Start Redis before running the collector:

```bash
docker compose -f compose.collector.yml up -d redis
```

Run the collector directly:

```bash
COLLECTOR_DRY_RUN=0 pnpm --filter @f1-hub/collector start
```

Dry-run is enabled by default. Set `COLLECTOR_DRY_RUN=0` for real Tinybird writes.

Run the collector in watch mode during development:

```bash
pnpm --filter @f1-hub/collector dev
```

Run the full stack (Redis, Prometheus, Grafana, collector) with Docker Compose:

```bash
docker compose -f compose.collector.yml up -d
```

### Adding a new session

Seeding writes session metadata to `f1_sessions` and `session_summaries` but does not populate track data. Session pages will show "No circuit or timing snapshot is available" until backfilled.

```bash
# 1. Seed all sessions for the current year
COLLECTOR_DRY_RUN=0 pnpm --filter @f1-hub/collector seed:sessions

# 2. Backfill track data (drivers, position frames, outline) per session
COLLECTOR_DRY_RUN=0 pnpm backfill:track --session-key=<session_key>

# 3. Backfill replay, timing, and telemetry data from OpenF1
COLLECTOR_DRY_RUN=0 pnpm backfill:replay:openf1 --session-key=<session_key>
```

Run backfills one at a time — they hit OpenF1 at ~3 req/s and parallel runs will trigger rate limits.

There are two replay backfill scripts:

- `backfill:replay:openf1` — synthesizes timing, weather, and telemetry from OpenF1 historical data. Use this for sessions you did not capture live.
- `backfill:replay` — chunks existing `live_envelopes` into replay records. Only works if the live collector was running during the session.

### Standalone Docker

Build and run the collector container standalone:

```bash
docker build -f apps/collector/Dockerfile -t f1-hub-collector .
docker run --env-file .env.local -e COLLECTOR_DRY_RUN=0 --restart unless-stopped f1-hub-collector
```

## Repo Layout

```text
f1-hub/
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
