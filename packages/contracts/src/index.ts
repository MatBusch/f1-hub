import { z } from "zod";

export const signalrTopics = [
  "Heartbeat",
  "CarData.z",
  "Position.z",
  "ExtrapolatedClock",
  "TimingStats",
  "TimingAppData",
  "WeatherData",
  "TrackStatus",
  "SessionStatus",
  "DriverList",
  "RaceControlMessages",
  "SessionInfo",
  "SessionData",
  "LapCount",
  "TimingData",
  "TeamRadio",
  "ChampionshipPrediction",
] as const;

export const signalrTopicSchema = z.enum(signalrTopics);

export const normalizedTopics = [
  "session",
  "timing",
  "timingStats",
  "timingApp",
  "telemetry",
  "position",
  "weather",
  "trackStatus",
  "raceControl",
  "teamRadio",
  "lapCount",
  "driverList",
  "championshipPrediction",
] as const;

export const normalizedTopicSchema = z.enum(normalizedTopics);

export const sessionScopeSchema = z.enum(["live", "historical", "replay"]);
export type SessionScope = z.infer<typeof sessionScopeSchema>;

export const sessionIdentitySchema = z.object({
  season: z.number().int().min(2018),
  meetingKey: z.number().int().nonnegative(),
  sessionKey: z.number().int().nonnegative(),
  sessionType: z.string().min(1),
  sessionName: z.string().min(1).optional(),
});

export const liveWindowCursorSchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
});

export type LiveWindowCursor = z.infer<typeof liveWindowCursorSchema>;

export const liveEnvelopeModeSchema = z.enum(["snapshot", "patch"]);

export const liveEnvelopeSchema = z.object({
  id: z.string().min(1),
  sessionKey: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
  receivedAt: z.string().datetime().optional(),
  mode: liveEnvelopeModeSchema,
  topic: normalizedTopicSchema,
  payload: z.unknown(),
});

export const replayChunkSchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  chunkIndex: z.number().int().nonnegative(),
  rangeStartSequence: z.number().int().nonnegative(),
  rangeEndSequence: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
  events: z.array(liveEnvelopeSchema),
});

export const sessionBootSchema = z.object({
  session: sessionIdentitySchema,
  bootSequence: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  state: z.record(z.string(), z.unknown()),
});

export const raceControlMessageSchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
  category: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  flag: z.string().optional(),
  scope: z.string().optional(),
});

export const sessionSummarySchema = z.object({
  session: sessionIdentitySchema,
  status: z.string().min(1),
  driverCount: z.number().int().nonnegative(),
  lastSequence: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const sessionCatalogRowSchema = z.object({
  season: z.number().int().min(2018),
  meetingKey: z.number().int().nonnegative(),
  meetingName: z.string().min(1),
  sessionKey: z.number().int().nonnegative(),
  sessionName: z.string().min(1),
  sessionType: z.string().min(1),
  startsAt: z.string().datetime(),
  status: z.string().min(1),
  driverCount: z.number().int().nonnegative(),
  frameCount: z.number().int().nonnegative(),
  outlinePointCount: z.number().int().nonnegative(),
  lastFrameAt: z.string().datetime().nullable(),
  hasDrivers: z.boolean(),
  hasFrames: z.boolean(),
  hasOutline: z.boolean(),
  replayReady: z.boolean(),
});

export const sessionDriverSchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  meetingKey: z.number().int().nonnegative(),
  driverNumber: z.number().int().nonnegative(),
  broadcastName: z.string().min(1),
  fullName: z.string().min(1),
  nameAcronym: z.string().min(1),
  teamName: z.string().min(1),
  teamColor: z.string().min(1),
  headshotUrl: z.string().url().optional(),
});

export const trackPositionFrameSchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  meetingKey: z.number().int().nonnegative(),
  driverNumber: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
  position: z.number().int().nonnegative().nullable().optional(),
  x: z.number().int().nullable().optional(),
  y: z.number().int().nullable().optional(),
  z: z.number().int().nullable().optional(),
  source: z.string().min(1),
});

export const trackOutlinePointSchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  meetingKey: z.number().int().nonnegative(),
  pointIndex: z.number().int().nonnegative(),
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int().nullable().optional(),
  source: z.string().min(1),
});

export const telemetryLapSummarySchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  meetingKey: z.number().int().nonnegative(),
  driverNumber: z.number().int().nonnegative(),
  lapNumber: z.number().int().positive(),
  lapStartTime: z.string().datetime(),
  lapEndTime: z.string().datetime().nullable().optional(),
  lapDurationMs: z.number().int().nonnegative().nullable().optional(),
  sector1Ms: z.number().int().nonnegative().nullable().optional(),
  sector2Ms: z.number().int().nonnegative().nullable().optional(),
  sector3Ms: z.number().int().nonnegative().nullable().optional(),
  isPitOutLap: z.boolean(),
  stintNumber: z.number().int().nonnegative().nullable().optional(),
  compound: z.string().optional(),
  topSpeed: z.number().int().nonnegative().nullable().optional(),
});

export const telemetrySampleSchema = z.object({
  sessionKey: z.number().int().nonnegative(),
  meetingKey: z.number().int().nonnegative(),
  driverNumber: z.number().int().nonnegative(),
  lapNumber: z.number().int().positive(),
  emittedAt: z.string().datetime(),
  speed: z.number().int().nonnegative().nullable().optional(),
  rpm: z.number().int().nonnegative().nullable().optional(),
  gear: z.number().int().nullable().optional(),
  throttle: z.number().int().nonnegative().nullable().optional(),
  brake: z.number().int().nonnegative().nullable().optional(),
  drs: z.number().int().nonnegative().nullable().optional(),
  battery: z.number().int().nonnegative().nullable().optional(),
});

export type SignalrTopic = z.infer<typeof signalrTopicSchema>;
export type NormalizedTopic = z.infer<typeof normalizedTopicSchema>;
export type SessionIdentity = z.infer<typeof sessionIdentitySchema>;
export type LiveEnvelope = z.infer<typeof liveEnvelopeSchema>;
export type ReplayChunk = z.infer<typeof replayChunkSchema>;
export type SessionBoot = z.infer<typeof sessionBootSchema>;
export type RaceControlMessage = z.infer<typeof raceControlMessageSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionCatalogRow = z.infer<typeof sessionCatalogRowSchema>;
export type SessionDriver = z.infer<typeof sessionDriverSchema>;
export type TrackPositionFrame = z.infer<typeof trackPositionFrameSchema>;
export type TrackOutlinePoint = z.infer<typeof trackOutlinePointSchema>;
export type TelemetryLapSummary = z.infer<typeof telemetryLapSummarySchema>;
export type TelemetrySample = z.infer<typeof telemetrySampleSchema>;

export const queryKeys = {
  sessions: () => ["sessions"] as const,
  session: (sessionKey: number) => ["session", sessionKey] as const,
  sessionBoot: (sessionKey: number) => ["session-boot", sessionKey] as const,
  replayChunk: (sessionKey: number, chunkIndex: number) =>
    ["replay-chunk", sessionKey, chunkIndex] as const,
  raceControl: (sessionKey: number) => ["race-control", sessionKey] as const,
  liveWindow: (sessionKey: number, fromSequence: number) =>
    ["live-window", sessionKey, fromSequence] as const,
  sessionDrivers: (sessionKey: number) =>
    ["session-drivers", sessionKey] as const,
  trackFrames: (sessionKey: number, driverNumber?: number) =>
    ["track-frames", sessionKey, driverNumber ?? "all"] as const,
  trackOutline: (sessionKey: number) => ["track-outline", sessionKey] as const,
  telemetryLaps: (sessionKey: number, driverNumber?: number) =>
    ["telemetry-laps", sessionKey, driverNumber ?? "all"] as const,
  telemetryTrace: (
    sessionKey: number,
    driverNumber: number,
    lapNumber: number,
  ) => ["telemetry-trace", sessionKey, driverNumber, lapNumber] as const,
} as const;
