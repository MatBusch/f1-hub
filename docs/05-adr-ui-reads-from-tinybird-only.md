# ADR 001: UI Reads From Tinybird-Backed Backend Only

## Status

Accepted

## Decision

For `f1-hub`, the UI will always read through backend APIs whose source of truth is Tinybird.

This applies to:

- historical pages
- replay pages
- current live session pages

The collector is a separate service and is write-only from the UI's perspective.

## Consequences

### Allowed

- collector -> Tinybird
- web/backend -> Tinybird
- browser -> web/backend

### Not allowed

- browser -> collector
- browser -> upstream SignalR
- browser -> OpenF1 in normal product flows

## Why

This gives the app one clean read architecture:

- one data access pattern in the UI
- one typed server-side query layer
- one place to cache, validate, and evolve contracts
- one durable source for both historical and live views

## Required Implementation Pattern

1. Collector ingests live upstream data.
2. Collector writes raw and normalized rows into Tinybird.
3. Web/backend queries Tinybird for current state and recent deltas.
4. UI fetches only from backend APIs.
5. React Query merges backend responses into the client cache.

## Performance Requirement

Because live reads also go through Tinybird, the backend must expose read models designed for low-latency refresh:

- current-state views
- recent-delta views keyed by sequence or timestamp
- boot snapshots
- replay chunk endpoints

## Notes

This is a cleaner architecture than mixing:

- direct collector subscriptions for live
- Tinybird queries for historical

It trades some theoretical minimum latency for a more consistent product architecture.
