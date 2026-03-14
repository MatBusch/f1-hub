import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";

import {
  type LiveEnvelope,
  signalrTopics,
  type NormalizedTopic,
  type TrackPositionFrame,
} from "@f1-hub/contracts";

const SIGNALR_URL = "livetiming.formula1.com/signalr";
const SIGNALR_HUB = "Streaming";

const negotiationResponseSchema = z
  .object({
    ConnectionToken: z.string().optional(),
    connectionToken: z.string().optional(),
  })
  .transform((value) => value.ConnectionToken ?? value.connectionToken ?? null);

const responseSchema = z.object({
  I: z.string().optional(),
  R: z.unknown().optional(),
  M: z
    .array(
      z.object({
        A: z.tuple([z.string(), z.unknown(), z.string()]),
      }),
    )
    .optional(),
});

export type SignalRUpdate = {
  topic: string;
  data: unknown;
  timestamp: string;
};

type PendingResolver = (message: string) => void;

export class F1SignalRClient {
  private readonly queue: string[] = [];
  private readonly resolvers: PendingResolver[] = [];
  private socket: WebSocket | null = null;

  async connect() {
    const connectionData = JSON.stringify([{ name: SIGNALR_HUB }]);
    const negotiateUrl = new URL(`https://${SIGNALR_URL}/negotiate`);
    negotiateUrl.searchParams.set("clientProtocol", "1.5");
    negotiateUrl.searchParams.set("connectionData", connectionData);

    const negotiateResponse = await fetch(negotiateUrl.toString(), {
      headers: {
        "User-Agent": "BestHTTP",
      },
      cache: "no-store",
    });

    if (!negotiateResponse.ok) {
      throw new Error(`SignalR negotiate failed: ${negotiateResponse.status}`);
    }

    const cookie = negotiateResponse.headers.get("set-cookie");
    const token = negotiationResponseSchema.parse(
      await negotiateResponse.json(),
    );

    if (!token || !cookie) {
      throw new Error("SignalR negotiate response missing token or cookie.");
    }

    const connectUrl = new URL(`wss://${SIGNALR_URL}/connect`);
    connectUrl.searchParams.set("clientProtocol", "1.5");
    connectUrl.searchParams.set("transport", "webSockets");
    connectUrl.searchParams.set("connectionToken", token);

    this.socket = new WebSocket(connectUrl, {
      headers: {
        "User-Agent": "BestHTTP",
        "Accept-Encoding": "gzip,identity",
        Cookie: cookie,
      },
    });

    this.socket.on("message", (payload: RawData) => {
      const text = payload.toString();
      const resolver = this.resolvers.shift();

      if (resolver) {
        resolver(text);
        return;
      }

      this.queue.push(text);
    });

    await new Promise<void>((resolve, reject) => {
      this.socket?.once("open", () => resolve());
      this.socket?.once("error", (error: Error) => reject(error));
    });
  }

  async subscribe(topics = signalrTopics) {
    if (!this.socket) {
      throw new Error("SignalR socket is not connected.");
    }

    const id = randomUUID();
    this.socket.send(
      JSON.stringify({
        H: SIGNALR_HUB,
        M: "Subscribe",
        A: [topics],
        I: id,
      }),
    );

    for (;;) {
      const message = await this.nextMessage();
      const parsed = responseSchema.safeParse(JSON.parse(message));

      if (!parsed.success) {
        continue;
      }

      if (
        parsed.data.R !== undefined &&
        (parsed.data.I === undefined || parsed.data.I === id)
      ) {
        return parsed.data.R;
      }

      if (parsed.data.M?.length) {
        this.queue.unshift(message);
      }
    }
  }

  async nextUpdates(): Promise<SignalRUpdate[]> {
    const message = await this.nextMessage();
    const parsed = responseSchema.safeParse(JSON.parse(message));

    if (!parsed.success || !parsed.data.M?.length) {
      return [];
    }

    return parsed.data.M.map((entry) => {
      const [topic, data, timestamp] = entry.A;
      return { topic, data, timestamp };
    });
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }

  private nextMessage() {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }

    return new Promise<string>((resolve) => {
      this.resolvers.push(resolve);
    });
  }
}

export function normalizeTopic(topic: string): NormalizedTopic | null {
  switch (topic) {
    case "CarData.z":
      return "telemetry";
    case "Position.z":
      return "position";
    case "TimingStats":
      return "timingStats";
    case "TimingAppData":
      return "timingApp";
    case "TimingData":
      return "timing";
    case "WeatherData":
      return "weather";
    case "TrackStatus":
      return "trackStatus";
    case "RaceControlMessages":
      return "raceControl";
    case "TeamRadio":
      return "teamRadio";
    case "DriverList":
      return "driverList";
    case "LapCount":
      return "lapCount";
    case "ChampionshipPrediction":
      return "championshipPrediction";
    case "ExtrapolatedClock":
    case "SessionStatus":
    case "SessionInfo":
    case "SessionData":
      return "session";
    default:
      return null;
  }
}

export function extractRaceControlMessages(
  sessionKey: number,
  nextSequence: () => number,
  update: SignalRUpdate,
) {
  return extractRaceControlMessagesFromPayload(
    sessionKey,
    nextSequence,
    update.data,
    update.timestamp,
  );
}

export function extractRaceControlMessagesFromPayload(
  sessionKey: number,
  nextSequence: () => number,
  payload: unknown,
  fallbackTimestamp: string,
) {
  const parsedPayload = payload as {
    Messages?: Array<Record<string, unknown>>;
  };

  if (!parsedPayload?.Messages || !Array.isArray(parsedPayload.Messages)) {
    return [];
  }

  return parsedPayload.Messages.map((message) => ({
    sessionKey,
    sequence: nextSequence(),
    emittedAt: normalizeTimestamp(
      (message.Utc as string | undefined) ?? fallbackTimestamp,
    ),
    category: String(message.Category ?? "Other"),
    title: String(message.Message ?? "Race Control"),
    body: String(message.Message ?? "Race Control"),
    flag: typeof message.Flag === "string" ? message.Flag : undefined,
    scope: typeof message.Scope === "string" ? message.Scope : undefined,
  }));
}

export function createBootstrapEnvelopes(
  sessionKey: number,
  nextSequence: () => number,
  state: Record<string, unknown>,
  receivedAt: string,
): LiveEnvelope[] {
  const envelopes: LiveEnvelope[] = [];

  for (const [topic, payload] of Object.entries(state)) {
    const normalizedTopic = normalizeTopic(topic);

    if (!normalizedTopic) {
      continue;
    }

    envelopes.push({
      id: randomUUID(),
      sessionKey,
      sequence: nextSequence(),
      emittedAt: extractPayloadTimestamp(payload, receivedAt),
      receivedAt,
      mode: "snapshot",
      topic: normalizedTopic,
      payload,
    });
  }

  return envelopes;
}

function decodeCompressedSignalRPayload(payload: unknown) {
  if (typeof payload !== "string" || payload.length === 0) {
    return null;
  }

  try {
    const inflated = inflateRawSync(Buffer.from(payload, "base64"));
    return JSON.parse(inflated.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInt(value: unknown) {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function extractTrackPositionFramesFromPayload(
  sessionKey: number,
  meetingKey: number,
  payload: unknown,
  fallbackTimestamp: string,
): TrackPositionFrame[] {
  const decoded = decodeCompressedSignalRPayload(payload) as {
    Position?: Array<{
      Timestamp?: string;
      Entries?: Record<
        string,
        {
          X?: number;
          Y?: number;
          Z?: number;
        }
      >;
    }>;
  } | null;

  if (!decoded?.Position || !Array.isArray(decoded.Position)) {
    return [];
  }

  const frames: TrackPositionFrame[] = [];

  for (const sample of decoded.Position) {
    const emittedAt = normalizeTimestamp(sample.Timestamp ?? fallbackTimestamp);

    for (const [driverNumberRaw, entry] of Object.entries(
      sample.Entries ?? {},
    )) {
      const driverNumber = Number.parseInt(driverNumberRaw, 10);

      if (!Number.isFinite(driverNumber) || driverNumber < 0) {
        continue;
      }

      const x = asInt(entry?.X);
      const y = asInt(entry?.Y);
      const z = asInt(entry?.Z);

      if (x === null && y === null && z === null) {
        continue;
      }

      frames.push({
        sessionKey,
        meetingKey,
        driverNumber,
        emittedAt,
        position: null,
        x,
        y,
        z,
        source: "signalr",
      });
    }
  }

  return frames;
}

function extractPayloadTimestamp(payload: unknown, fallbackTimestamp: string) {
  if (typeof payload === "object" && payload !== null && "Utc" in payload) {
    const utc = payload.Utc;

    if (typeof utc === "string" && utc.length > 0) {
      return normalizeTimestamp(utc);
    }
  }

  return normalizeTimestamp(fallbackTimestamp);
}

export function normalizeTimestamp(value: string) {
  const normalized =
    value.includes("T") || /[+-]\d\d:\d\d$/.test(value)
      ? value
      : `${value.replace(" ", "T")}Z`;

  return new Date(normalized).toISOString();
}
