# Open Questions

## Updated Status (2026-03-14)

Decided:

- Tinybird is the UI read source for both historical and live views.
- Collector remains a separate write service.
- Waddler is out of scope.
- `shadcn/ui` + Tailwind v4 + CSS variables is the active UI contract.

Still open:

- Exact replay fidelity target for v1 track playback:
  - raw fidelity at higher read cost
  - or lightly downsampled map windows for lower cost and smoother UX
- Whether `driver_progress_frames` should become the canonical Tinybird replay surface for maps instead of client-side projection from raw XY
- Deployment model for the collector in production:
  - long-lived container host choice and operational runbook
- Scope split between v1 and v1.1:
  - telemetry overlays and advanced standings depth vs timeline polish
- Local-development standard:
  - Tinybird Local is the current default dev path
  - cloud workspace available for production and verification

## Remaining Decisions

1. Collector production runtime:
   - Choose host model for long-lived collector process.
   - Define restart policy, health checks, and deploy flow.

2. Replay fidelity target:
   - Keep raw-ish replay windows for higher fidelity.
   - Or materialize downsampled replay-map windows for lower query cost.

3. Canonical map replay model:
   - Keep client-side path projection from `track_position_frames`.
   - Or materialize `driver_progress_frames` in Tinybird and make UI read that only.

4. V1 vs V1.1 scope boundary:
   - Lock exactly which telemetry/map overlays are in v1.
   - Defer remaining intelligence modules to v1.1.

## Current Assumptions In This Plan

- SignalR remains the best live source because upstream already proves that model.
- Tinybird is the historical warehouse and analytical query engine.
- A dedicated collector service is acceptable and preferred.
- The UI reads only from Tinybird-backed backend APIs, even for live data.
- The collector is a separate write-only service.

## Biggest Technical Risks

### Tinybird Read Latency Must Be Tuned For Live

If the UI must always read from Tinybird-backed APIs, then write batching, current-state pipes, and recent-delta queries need to be tuned carefully or live latency will drift upward.

### Tinybird Cloud Quota Can Block Dev Loops

The cloud workspace has a daily request cap. Tinybird Local is the default dev path to avoid this. Cloud is used for production and verification runs.

### Full-Fidelity Telemetry Volume Is Large

Car telemetry and position updates will create the highest data volume. You should plan multiple resolutions from day one.

### Next Serverless Runtimes Still Need Care For Realtime Reads

If you implement live reads through frequent backend refreshes or streamed responses, serverless limits still matter. Keep the collector separate and keep the web tier stateless where possible.

## Recommended Next Decisions

1. Lock canonical replay map model (`driver_progress_frames` vs client projection).
2. Lock collector hosting and operational runbook.
3. Lock v1 feature boundary.
