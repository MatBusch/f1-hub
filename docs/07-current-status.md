# Current Status

Last updated: 2026-03-14

## Tinybird Local Workflow

- This repo uses the Tinybird TypeScript SDK in `lib/tinybird.ts`, so local build must use:
  - `pnpm exec tinybird build --local`
- Do not use `tb --local build` for this repo; that expects datafiles and will not create SDK-defined endpoints such as `session_catalog`.
- Run workspace commands from `/home/greenrandall/f1-hub`.
- For web development, use `pnpm --filter @f1-hub/web dev`.
- If Turbopack ever regresses after the repo move, the fallback command is `pnpm --filter @f1-hub/web dev:webpack`.

Recommended local shell flow from `/home/greenrandall/f1-hub`:

```bash
export TINYBIRD_TOKEN="$TB_LOCAL_WORKSPACE_TOKEN"
export TINYBIRD_URL="http://localhost:7181"
export COLLECTOR_DRY_RUN=0
pnpm tb:local:start
pnpm exec tinybird build --local
pnpm dev
```

## Current Build State

- Web stack is active and building:
  - Next.js `16.1.6`
  - React `19.2.4`
  - TypeScript `5.9.3`
  - `shadcn/ui` + Tailwind v4 + CSS variables
- Data contract is Tinybird-first for all reads.
- Collector is a separate service and writes to Tinybird only.
- Waddler scope is dropped.
- Post-relocation note:
  - `apps/web` now relies on app-local framework resolution under `apps/web/node_modules`
  - the old Turbopack root override was removed because it caused `Next.js package not found` panics after the repo was moved into its own dedicated directory
  - workspace package transpilation now uses Next's `transpilePackages` setting instead

## Tinybird Cloud State (Workspace `f1_hub`, `us-west-2`)

All datasources and endpoints are defined in `lib/tinybird.ts`. See `docs/02-target-architecture.md` for the full data model.

## Seeded and Backfilled Data

Session used for validation:

- Australia GP race
- `sessionKey=11234`
- `startsAt=2026-03-08T04:00:00.000Z`

Current Tinybird row reality for `11234`:

- `session_driver_directory`: `22` rows
- `track_position_frames`: `707,058` rows
- `track_outline_points`: `321` rows

## UI and API State

Session catalog now exposes replay readiness metadata per session:

- `driverCount`
- `frameCount`
- `outlinePointCount`
- `hasDrivers`
- `hasFrames`
- `hasOutline`
- `replayReady`

Track APIs are available via Next route handlers:

- `/api/sessions/[sessionKey]/track/drivers`
- `/api/sessions/[sessionKey]/track/latest`
- `/api/sessions/[sessionKey]/track/frames`
- `/api/sessions/[sessionKey]/track/outline`

Session page (`/sessions/11234`) currently:

- uses Tinybird-backed boot, summary, replay, race-control, and track APIs
- now prefers a fixed official circuit SVG when venue metadata is known
- projects driver positions onto a stable path instead of rendering raw XY directly
- falls back to classification-estimate mode when track frames are not present
- supports replay player and now requests track frame windows around replay timestamps

Recent replay/map changes completed in code:

- replay transport no longer depends on the lower `Race Intelligence` tab state
- replay now keeps a stable frame set during query transitions to avoid live/replay chip flapping
- map path derivation now rejects clearly scrambled stored outlines and falls back to one-lap frame-derived pathing
- known venues such as Melbourne now prefer the official circuit SVG path for rendering

Known limitation:

- full end-to-end cloud verification of the rendered track path has not been completed yet

## Collector State

`backfill-track` now has:

- OpenF1 rate-limit-safe behavior (global pacing near `3 req/s`)
- `429` retry/backoff
- idempotent behavior for existing data:
  - skips full frame fetch/append when `track_position_frames` already exist
  - skips driver append when `session_drivers` already exist
  - appends outline only when `track_outline_points` is missing (or with `--force`)

Live collector now has:

- SignalR `Position.z` decoding into structured `track_position_frames`
- session driver directory seeding for active sessions
- opportunistic live outline generation from accumulated SignalR frames
- one Tinybird-backed read model for live and historical map surfaces

## Verified Commands

From `/home/greenrandall/f1-hub`:

```bash
pnpm typecheck
pnpm --filter @f1-hub/web build
pnpm --filter @f1-hub/web dev
pnpm --filter @f1-hub/web dev:webpack
pnpm exec tinybird build
tb --cloud endpoint data track_outline --session_key 11234 --format json
tb --cloud endpoint data track_latest_positions --session_key 11234 --format json
```

Backfill/materialization:

```bash
env COLLECTOR_DRY_RUN=0 pnpm backfill:track --session-key=11234
```

## Near-Term Next Steps

1. Verify `session_catalog`, `session_boot`, `track_outline`, and `track_latest_positions` against cloud.
2. Confirm Australia race replay now renders:
   - official circuit under avatars
   - stable replay chip state
   - projected movement along path rather than raw XY flicker
3. Add low-cost materialized replay map windows or `driver_progress_frames` in Tinybird to cut replay query cost further.
4. Add a safe replace/version strategy for `track_outline_points` so bad historical outlines can be regenerated without duplicate rows.
5. Add richer track overlays (speed/DRS/lap deltas) from persisted sources without adding browser-side upstream dependencies.
