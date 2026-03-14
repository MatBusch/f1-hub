# Upstream Reverse Engineering

## High-Level Services

The upstream `f1-dash` repo is a multi-service system:

- `dashboard`: Next.js frontend
- `realtime`: Rust service that connects to Formula 1 SignalR and exposes SSE
- `api`: Rust service for schedule endpoints
- `signalr`: shared SignalR client crate
- `simulator`: raw message recorder / replay server
- `shared`: shared event and model definitions

## Core Live Flow

The live data path in the upstream system is:

1. Connect to `livetiming.formula1.com/signalr`.
2. Subscribe to 17 topics, including `CarData.z`, `Position.z`, `TimingData`, `WeatherData`, `TrackStatus`, `RaceControlMessages`, and `TeamRadio`.
3. Store a merged in-memory JSON state on the server.
4. Send an SSE `initial` event with the full current state.
5. Send SSE `update` events with topic-scoped patches.
6. Let the browser buffer those frames and choose either latest or delayed playback.

That architecture is important because it avoids upstream fan-out. One server connection feeds many browsers.

## Topics Observed In Upstream Ingest

The upstream realtime service subscribes to:

- `Heartbeat`
- `CarData.z`
- `Position.z`
- `ExtrapolatedClock`
- `TimingStats`
- `TimingAppData`
- `WeatherData`
- `TrackStatus`
- `SessionStatus`
- `DriverList`
- `RaceControlMessages`
- `SessionInfo`
- `SessionData`
- `LapCount`
- `TimingData`
- `TeamRadio`
- `ChampionshipPrediction`

## Frontend Behavior That Matters

The upstream dashboard uses a client-side buffered state engine.

Important traits:

- it receives a full `initial` payload once
- it applies partial `update` payloads after that
- it decompresses `CarData.z` and `Position.z`
- it buffers timed frames for telemetry and positions
- it supports a delay slider by reading from the buffer at `now - delay`
- it updates the rendered store roughly every `200ms`

This means the UI is already conceptually built around a replayable event stream, which is ideal for a Tinybird-backed rebuild.

## Feature Inventory

Pages and feature areas visible in the upstream repo:

- landing / nav page
- schedule page
- help page
- main dashboard
- track map page
- weather page
- standings page
- settings page
- driver detail page placeholder

Major UI modules:

- leaderboard
- track map
- race control feed
- team radio feed
- track violations
- session info / delay timer / connection status
- schedule widgets
- weather map and weather complications
- championship prediction during races

## Historical / Replay Behavior

The upstream historical story is basic:

- the simulator can save raw SignalR messages line by line
- the replay server can resend those lines over WebSocket on a fixed timer
- there is no warehouse model for fast historical querying
- there are no precomputed snapshots for instant resume at an arbitrary timestamp

That is the main reason historical loading is not structurally instant.

## Limits In The Upstream Design

1. Historical access depends on raw message playback instead of indexed storage.
2. Server state is transient and in-memory.
3. There is no normalized analytical schema for laps, stints, telemetry, race control, or weather.
4. The client does meaningful merge and buffer work that could be partially shifted server-side for faster boot.
5. Replay and live are conceptually similar, but they do not share a durable event ledger.

## Migration Implications

Keep these ideas from upstream:

- one upstream live connection, not one per client
- one-way live transport to browsers
- initial snapshot plus incremental patches
- same UI model for live and delayed playback

Replace these parts:

- in-memory-only merged state with durable Tinybird-backed storage
- raw replay files with session snapshots plus chunked replay streams
- ad hoc schedule API with a typed Next / Tinybird data layer
- browser-owned merge logic for first boot with server-prepared snapshots
