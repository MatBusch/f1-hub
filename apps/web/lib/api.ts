import {
  type LiveEnvelope,
  type NormalizedTopic,
  type RaceControlMessage,
  type ReplayChunk,
  type SessionBoot,
  type SessionCatalogRow,
  type SessionDriver,
  type SessionSummary,
  type TelemetryLapSummary,
  type TelemetrySample,
  type TrackOutlinePoint,
  type TrackPositionFrame,
} from "@f1-hub/contracts";

type ApiEnvelope<T> = {
  ok: true;
  data: T;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchJson<T>(input: string): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
  });

  const payload = (await response.json()) as
    | ApiEnvelope<T>
    | { ok: false; error: string };

  if (!response.ok || !payload.ok) {
    throw new ApiError(
      "error" in payload ? payload.error : "Request failed",
      response.status,
    );
  }

  return payload.data;
}

export async function fetchSessionCatalog(limit = 24, status?: string) {
  const query = new URLSearchParams({ limit: String(limit) });

  if (status) {
    query.set("status", status);
  }

  return fetchJson<{ data: SessionCatalogRow[]; rows?: number }>(
    `/api/sessions?${query.toString()}`,
  );
}

export async function fetchSessionSummary(sessionKey: number) {
  return fetchJson<SessionSummary>(`/api/sessions/${sessionKey}/summary`);
}

export async function fetchSessionCatalogMeta(sessionKey: number) {
  return fetchJson<SessionCatalogRow>(`/api/sessions/${sessionKey}/catalog-meta`);
}

export async function fetchSessionBoot(sessionKey: number) {
  return fetchJson<SessionBoot>(`/api/sessions/${sessionKey}/boot`);
}

export async function fetchLiveWindow(
  sessionKey: number,
  fromSequence = 0,
  limit = 24,
  topic?: NormalizedTopic,
) {
  const query = new URLSearchParams({
    fromSequence: String(fromSequence),
    limit: String(limit),
  });

  if (topic) {
    query.set("topic", topic);
  }

  return fetchJson<{ data: LiveEnvelope[]; rows?: number }>(
    `/api/sessions/${sessionKey}/live?${query.toString()}`,
  );
}

export async function fetchReplayChunks(
  sessionKey: number,
  fromChunk = 0,
  toChunk?: number,
) {
  const query = new URLSearchParams({ fromChunk: String(fromChunk) });

  if (toChunk !== undefined) {
    query.set("toChunk", String(toChunk));
  }

  return fetchJson<{ data: ReplayChunk[]; rows?: number }>(
    `/api/sessions/${sessionKey}/replay?${query.toString()}`,
  );
}

export async function fetchRaceControl(sessionKey: number, limit = 25) {
  return fetchJson<{ data: RaceControlMessage[]; rows?: number }>(
    `/api/sessions/${sessionKey}/race-control?limit=${limit}`,
  );
}

export async function fetchSessionDrivers(sessionKey: number) {
  return fetchJson<{ data: SessionDriver[]; rows?: number }>(
    `/api/sessions/${sessionKey}/track/drivers`,
  );
}

export async function fetchTrackLatestPositions(sessionKey: number) {
  return fetchJson<{ data: TrackPositionFrame[]; rows?: number }>(
    `/api/sessions/${sessionKey}/track/latest`,
  );
}

export async function fetchTrackPositionFrames(
  sessionKey: number,
  input: {
    driverNumber?: number;
    fromTime?: string;
    toTime?: string;
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams();

  if (input.driverNumber !== undefined) {
    query.set("driverNumber", String(input.driverNumber));
  }

  if (input.fromTime) {
    query.set("fromTime", input.fromTime);
  }

  if (input.toTime) {
    query.set("toTime", input.toTime);
  }

  if (input.limit !== undefined) {
    query.set("limit", String(input.limit));
  }

  const search = query.toString();

  return fetchJson<{ data: TrackPositionFrame[]; rows?: number }>(
    `/api/sessions/${sessionKey}/track/frames${search ? `?${search}` : ""}`,
  );
}

export async function fetchTrackReplayFrame(
  sessionKey: number,
  atTime: string,
  windowMs = 1500,
) {
  const query = new URLSearchParams({
    atTime,
    windowMs: String(windowMs),
  });

  return fetchJson<{ data: TrackPositionFrame[]; rows?: number }>(
    `/api/sessions/${sessionKey}/track/replay-frame?${query.toString()}`,
  );
}

export async function fetchTrackOutline(sessionKey: number) {
  return fetchJson<{ data: TrackOutlinePoint[]; rows?: number }>(
    `/api/sessions/${sessionKey}/track/outline`,
  );
}

export async function fetchTelemetryLaps(
  sessionKey: number,
  driverNumber: number,
) {
  return fetchJson<{ data: TelemetryLapSummary[]; rows?: number }>(
    `/api/sessions/${sessionKey}/telemetry/laps?driverNumber=${driverNumber}`,
  );
}

export async function fetchTelemetryTrace(
  sessionKey: number,
  driverNumber: number,
  lapNumber: number,
) {
  return fetchJson<{ data: TelemetrySample[]; rows?: number }>(
    `/api/sessions/${sessionKey}/telemetry/trace?driverNumber=${driverNumber}&lapNumber=${lapNumber}`,
  );
}
